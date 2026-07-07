import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'

export interface MarkerSpec {
  id: string
  kind: 'pin' | 'event'
  lat: number
  lng: number
  icon: string
  color: string
  state: 'visible' | 'peak' | 'dimmed'
  stepNumber?: number
  selected?: boolean
  draggable?: boolean
}

export interface LineSpec {
  id: string
  coords: [number, number][] // [lng, lat]
  color: string
  state: 'visible' | 'peak' | 'dimmed'
}

export interface PathSpec {
  coords: [number, number][]
  color: string
}

interface Props {
  markers: MarkerSpec[]
  lines: LineSpec[]
  path: PathSpec | null
  focus: { lat: number; lng: number } | null
  onMarkerClick: (id: string, kind: 'pin' | 'event') => void
  onMarkerMoved: (id: string, lngLat: { lat: number; lng: number }) => void
  onMapClick: (lngLat: { lat: number; lng: number }) => void
}

const ATLANTA: [number, number] = [-84.372, 33.765]
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const LINE_LAYER = 'pin-lines-line'
const LINE_GLOW_LAYER = 'pin-lines-glow'

function signature(s: MarkerSpec): string {
  return [s.lat, s.lng, s.icon, s.color, s.state, s.stepNumber ?? '', s.selected ? 1 : 0, s.draggable ? 1 : 0].join('|')
}

function linesToGeoJSON(lines: LineSpec[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: lines
      .filter((l) => l.coords.length > 1)
      .map((l) => ({
        type: 'Feature',
        properties: {
          id: l.id,
          color: l.color,
          width: l.state === 'peak' ? 7 : 4.5,
          opacity: l.state === 'dimmed' ? 0.3 : 0.85,
          glow: l.state === 'peak' ? 0.35 : 0,
        },
        geometry: { type: 'LineString', coordinates: l.coords },
      })),
  }
}

export default function MapView({ markers, lines, path, focus, onMarkerClick, onMarkerMoved, onMapClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const loadedRef = useRef(false)
  const markerObjs = useRef<Map<string, { marker: maplibregl.Marker; sig: string }>>(new Map())
  // keep latest handlers without re-binding map listeners
  const handlers = useRef({ onMarkerClick, onMapClick, onMarkerMoved })
  handlers.current = { onMarkerClick, onMapClick, onMarkerMoved }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: ATLANTA,
      zoom: 12.1,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserLocation: true,
    })
    map.addControl(geolocate, 'bottom-right')
    map.on('click', (e) => {
      // a tap on a line pin counts as a marker click, not a map click
      if (map.getLayer(LINE_LAYER)) {
        const feats = map.queryRenderedFeatures(e.point, { layers: [LINE_LAYER] })
        const id = feats[0]?.properties?.id
        if (typeof id === 'string' && !id.startsWith('__')) {
          handlers.current.onMarkerClick(id, 'pin')
          return
        }
      }
      handlers.current.onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    })
    // 'style.load' fires as soon as the style JSON is ready — 'load' can be
    // delayed indefinitely by slow tile fetches, and layers don't need tiles.
    map.on('style.load', () => {
      loadedRef.current = true
      map.addSource('pin-lines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: LINE_GLOW_LAYER,
        type: 'line',
        source: 'pin-lines',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 16,
          'line-opacity': ['get', 'glow'],
        },
      })
      map.addLayer({
        id: LINE_LAYER,
        type: 'line',
        source: 'pin-lines',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': ['get', 'opacity'],
        },
      })
      map.addSource('experience-path', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'experience-path-line',
        type: 'line',
        source: 'experience-path',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 4,
          'line-opacity': 0.85,
          'line-dasharray': [0.2, 2],
        },
      })
    })
    // show the user's live location without requiring a tap on the control
    map.once('idle', () => {
      try {
        geolocate.trigger()
      } catch {
        // geolocation unavailable (permissions / insecure context) — control stays usable
      }
    })
    if (import.meta.env.DEV) {
      ;(window as unknown as { __map: maplibregl.Map }).__map = map
    }
    mapRef.current = map
    // The container can measure 0×0 during the first paint (and StrictMode's
    // double-mount can strand MapLibre's own resize tracking), leaving the
    // canvas at its 400×300 fallback — observe and resize explicitly.
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(containerRef.current)
    requestAnimationFrame(() => map.resize())
    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      loadedRef.current = false
      markerObjs.current.clear()
    }
  }, [])

  // sync markers (diff by id + rendered signature to avoid flicker)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const seen = new Set<string>()
    for (const spec of markers) {
      seen.add(spec.id)
      const sig = signature(spec)
      const existing = markerObjs.current.get(spec.id)
      if (existing?.sig === sig) continue
      existing?.marker.remove()

      // MapLibre positions the outer element via inline transform + its own
      // .maplibregl-marker class — never style position/transform on it.
      // All visuals (color, pulse, hover scale) live on the inner circle.
      const el = document.createElement('div')
      el.className = `marker-root ${spec.state === 'peak' ? 'peak' : ''} ${spec.state === 'dimmed' ? 'dimmed' : ''} ${
        spec.kind === 'event' ? 'event' : ''
      } ${spec.selected ? 'selected' : ''}`
      const inner = document.createElement('div')
      inner.className = 'marker'
      inner.style.setProperty('--marker-color', spec.color)
      inner.textContent = spec.icon
      if (spec.stepNumber != null) {
        const n = document.createElement('span')
        n.className = 'step-num'
        n.textContent = String(spec.stepNumber)
        inner.appendChild(n)
      }
      el.appendChild(inner)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        handlers.current.onMarkerClick(spec.id, spec.kind)
      })
      const marker = new maplibregl.Marker({ element: el, draggable: spec.draggable })
        .setLngLat([spec.lng, spec.lat])
        .addTo(map)
      if (spec.draggable) {
        marker.on('dragend', () => {
          const pos = marker.getLngLat()
          // snap back — the pin only actually moves once the save lands and
          // the updated spec recreates the marker at its new home
          marker.setLngLat([spec.lng, spec.lat])
          handlers.current.onMarkerMoved(spec.id, { lat: pos.lat, lng: pos.lng })
        })
      }
      markerObjs.current.set(spec.id, { marker, sig })
    }
    for (const [id, obj] of markerObjs.current) {
      if (!seen.has(id)) {
        obj.marker.remove()
        markerObjs.current.delete(id)
      }
    }
  }, [markers])

  // line pins
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      const src = map.getSource('pin-lines') as maplibregl.GeoJSONSource | undefined
      src?.setData(linesToGeoJSON(lines))
    }
    if (loadedRef.current) apply()
    else map.once('style.load', apply)
  }, [lines])

  // experience path line
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      const src = map.getSource('experience-path') as maplibregl.GeoJSONSource | undefined
      if (!src) return
      src.setData(
        path && path.coords.length > 1
          ? {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: { color: path.color },
                  geometry: { type: 'LineString', coordinates: path.coords },
                },
              ],
            }
          : { type: 'FeatureCollection', features: [] },
      )
      if (path && path.coords.length > 1) {
        const bounds = path.coords.reduce(
          (b, c) => b.extend(c as [number, number]),
          new maplibregl.LngLatBounds(path.coords[0], path.coords[0]),
        )
        map.fitBounds(bounds, { padding: { top: 120, bottom: 200, left: 60, right: 60 }, maxZoom: 15 })
      }
    }
    if (loadedRef.current) apply()
    else map.once('style.load', apply)
  }, [path])

  // fly to focused point
  useEffect(() => {
    const map = mapRef.current
    if (!map || !focus) return
    map.flyTo({ center: [focus.lng, focus.lat], zoom: Math.max(map.getZoom(), 14.5), duration: 800 })
  }, [focus])

  return <div ref={containerRef} className="map" />
}

import { useEffect, useMemo, useState } from 'react'
import MapView, { type LineSpec, type MarkerSpec, type PathSpec } from './components/MapView'
import TimeScopeBar from './components/TimeScopeBar'
import FilterBar from './components/FilterBar'
import DetailSheet from './components/DetailSheet'
import { ExperienceList, FollowBar } from './components/ExperiencePanel'
import AdminGate from './components/admin/AdminGate'
import PinEditor from './components/admin/PinEditor'
import CategoryEditor from './components/admin/CategoryEditor'
import ExperienceBuilder from './components/admin/ExperienceBuilder'
import { loadAppData } from './lib/data'
import { now } from './lib/clock'
import { eventState, pinState } from './lib/visibility'
import { dispatchWorkflow, getToken, setToken, updateJsonFile, uploadMediaFile } from './lib/github'
import { slugify } from './lib/slug'
import type { AppData, Category, Experience, MediaItem, Pin, TimeScope } from './lib/types'

const PINS_PATH = 'public/data/pins.json'
const CATS_PATH = 'public/data/categories.json'
const EXPS_PATH = 'public/data/experiences.json'

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const fn = () => setHash(window.location.hash)
    window.addEventListener('hashchange', fn)
    return () => window.removeEventListener('hashchange', fn)
  }, [])
  return hash
}

interface ExpDraft {
  experience: Experience
  isNew: boolean
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null)
  const [at, setAt] = useState<Date>(() => new Date())
  const [scope, setScope] = useState<TimeScope>('now')
  const [activeCats, setActiveCats] = useState<Set<string> | null>(null)
  const [selected, setSelected] = useState<{ kind: 'pin' | 'event'; id: string } | null>(null)
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null)
  const [showExpList, setShowExpList] = useState(false)
  const [activeExpId, setActiveExpId] = useState<string | null>(null)
  const [expStep, setExpStep] = useState(0)
  const [mediaOverrides, setMediaOverrides] = useState<Record<string, string>>({})

  // ----- admin state -----
  const isAdminRoute = useHashRoute().startsWith('#/admin')
  const [token, setTokenState] = useState<string | null>(() => getToken())
  const [placingPin, setPlacingPin] = useState(false)
  const [drawingLine, setDrawingLine] = useState<[number, number][] | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [pinDraft, setPinDraft] = useState<{ pin: Pin; isNew: boolean } | null>(null)
  const [showCats, setShowCats] = useState(false)
  const [expDraft, setExpDraft] = useState<ExpDraft | null>(null)
  const [saving, setSaving] = useState(false)

  const isAdmin = isAdminRoute && Boolean(token)

  useEffect(() => {
    loadAppData().then(setData)
    setAt(now())
    const tick = setInterval(() => setAt(now()), 30_000)
    return () => clearInterval(tick)
  }, [])

  const pinsById = useMemo(() => new Map((data?.pins ?? []).map((p) => [p.id, p])), [data?.pins])
  const catsById = useMemo(() => new Map((data?.categories ?? []).map((c) => [c.id, c])), [data?.categories])
  const activeExp = data?.experiences.find((e) => e.id === activeExpId) ?? null

  // ----- markers -----
  const markers = useMemo<MarkerSpec[]>(() => {
    if (!data) return []

    // experience focus mode: only its stops, numbered, in order
    if (activeExp) {
      return activeExp.steps
        .map((s, i) => {
          const pin = pinsById.get(s.pinId)
          if (!pin) return null
          const cat = catsById.get(pin.category)
          return {
            id: pin.id,
            kind: 'pin' as const,
            lat: pin.lat,
            lng: pin.lng,
            icon: cat?.icon ?? '📍',
            color: cat?.color ?? '#607d8b',
            state: i === expStep ? ('peak' as const) : ('visible' as const),
            stepNumber: i + 1,
            selected: selected?.kind === 'pin' && selected.id === pin.id,
          }
        })
        .filter((m): m is NonNullable<typeof m> => m !== null)
    }

    const specs: MarkerSpec[] = []
    for (const pin of data.pins) {
      if (activeCats && !activeCats.has(pin.category)) continue
      const st = pinState(pin, at, scope)
      if (st === 'hidden') continue
      let state: MarkerSpec['state'] = st
      if (scope === 'all') {
        const nowState = pinState(pin, at, 'now')
        state = nowState === 'hidden' ? 'dimmed' : nowState
      }
      const cat = catsById.get(pin.category)
      specs.push({
        id: pin.id,
        kind: 'pin',
        lat: pin.lat,
        lng: pin.lng,
        icon: cat?.icon ?? '📍',
        color: cat?.color ?? '#607d8b',
        state,
        selected: selected?.kind === 'pin' && selected.id === pin.id,
        // line anchors follow their line — reposition those by redrawing
        draggable: isAdmin && !pin.line,
      })
    }
    for (const ev of data.events) {
      if (activeCats && !activeCats.has(ev.category)) continue
      const st = eventState(ev, at, scope)
      if (st === 'hidden') continue
      const cat = catsById.get(ev.category)
      specs.push({
        id: ev.id,
        kind: 'event',
        lat: ev.lat,
        lng: ev.lng,
        icon: cat?.icon ?? '🎟️',
        color: cat?.color ?? '#7e57c2',
        state: st,
        selected: selected?.kind === 'event' && selected.id === ev.id,
      })
    }
    return specs
  }, [data, at, scope, activeCats, selected, activeExp, expStep, pinsById, catsById, isAdmin])

  const lines = useMemo<LineSpec[]>(() => {
    if (!data) return []
    const specs: LineSpec[] = []
    if (!activeExp) {
      for (const pin of data.pins) {
        if (!pin.line || pin.line.length < 2) continue
        if (activeCats && !activeCats.has(pin.category)) continue
        const st = pinState(pin, at, scope)
        if (st === 'hidden') continue
        let state: LineSpec['state'] = st
        if (scope === 'all') {
          const nowState = pinState(pin, at, 'now')
          state = nowState === 'hidden' ? 'dimmed' : nowState
        }
        specs.push({ id: pin.id, coords: pin.line, color: catsById.get(pin.category)?.color ?? '#607d8b', state })
      }
    }
    if (drawingLine) {
      specs.push({ id: '__draft', coords: drawingLine, color: '#ffb74d', state: 'peak' })
    }
    return specs
  }, [data, at, scope, activeCats, activeExp, catsById, drawingLine])

  const path = useMemo<PathSpec | null>(() => {
    const exp = activeExp ?? (expDraft ? expDraft.experience : null)
    if (!exp) return null
    const coords = exp.steps
      .map((s) => pinsById.get(s.pinId))
      .filter((p): p is Pin => Boolean(p))
      .map((p) => [p.lng, p.lat] as [number, number])
    return coords.length > 1 ? { coords, color: exp.color } : null
  }, [activeExp, expDraft, pinsById])

  // ----- interactions -----
  const handleMarkerClick = (id: string, kind: 'pin' | 'event') => {
    if (expDraft && kind === 'pin') {
      setExpDraft((d) =>
        d ? { ...d, experience: { ...d.experience, steps: [...d.experience.steps, { pinId: id }] } } : d,
      )
      return
    }
    setSelected({ kind, id })
    const p = kind === 'pin' ? pinsById.get(id) : data?.events.find((e) => e.id === id)
    if (p) setFocus({ lat: p.lat, lng: p.lng })
  }

  const handleMapClick = (lngLat: { lat: number; lng: number }) => {
    if (drawingLine) {
      setDrawingLine([...drawingLine, [lngLat.lng, lngLat.lat]])
      return
    }
    if (placingPin) {
      setPlacingPin(false)
      setPinDraft({
        pin: { id: '', name: '', category: '', lat: lngLat.lat, lng: lngLat.lng, media: [] },
        isNew: true,
      })
      return
    }
    setSelected(null)
  }

  const finishLine = () => {
    if (!drawingLine || drawingLine.length < 2) return
    const mid = drawingLine[Math.floor(drawingLine.length / 2)]
    setPinDraft({
      pin: { id: '', name: '', category: '', lat: mid[1], lng: mid[0], line: drawingLine, media: [] },
      isNew: true,
    })
    setDrawingLine(null)
  }

  const handleMarkerMoved = async (id: string, lngLat: { lat: number; lng: number }) => {
    const pin = pinsById.get(id)
    if (!pin || !isAdmin) return
    if (!confirm(`Move "${pin.name}" to the new spot?`)) return
    try {
      const pins = await updateJsonFile<Pin[]>(
        requireToken(),
        PINS_PATH,
        (cur) => (cur ?? data?.pins ?? []).map((p) => (p.id === id ? { ...p, lat: lngLat.lat, lng: lngLat.lng } : p)),
        `Move pin: ${pin.name}`,
      )
      setData((d) => (d ? { ...d, pins } : d))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Move failed.')
    }
  }

  const syncGoogleList = async () => {
    let listUrl = localStorage.getItem('gdf-google-list-url') ?? ''
    const entered = prompt(
      'Google Maps list share link (maps.app.goo.gl/…).\nLeave as-is to reuse, or paste a new one:',
      listUrl,
    )
    if (entered === null) return
    listUrl = entered.trim()
    if (!listUrl) return
    localStorage.setItem('gdf-google-list-url', listUrl)
    setSyncing(true)
    try {
      await dispatchWorkflow(requireToken(), 'sync-google-list.yml', { list_url: listUrl })
      alert('Sync started! The workflow scrapes your list and commits new pins — they appear on the site in ~3 minutes.')
    } catch (e) {
      alert(
        (e instanceof Error ? e.message : 'Sync failed.') +
          '\n\nNote: your token needs "Actions: read & write" permission to trigger the sync.',
      )
    } finally {
      setSyncing(false)
    }
  }

  const stepTo = (n: number) => {
    setExpStep(n)
    const pin = activeExp && pinsById.get(activeExp.steps[n]?.pinId)
    if (pin) setFocus({ lat: pin.lat, lng: pin.lng })
    setSelected(null)
  }

  // ----- admin writes -----
  const requireToken = (): string => {
    if (!token) throw new Error('Not signed in.')
    return token
  }

  const savePin = async (pin: Pin) => {
    setSaving(true)
    try {
      const pins = await updateJsonFile<Pin[]>(
        requireToken(),
        PINS_PATH,
        (cur) => {
          const list = cur ?? data?.pins ?? []
          const i = list.findIndex((p) => p.id === pin.id)
          return i >= 0 ? list.map((p, j) => (j === i ? pin : p)) : [...list, pin]
        },
        `${pinDraft?.isNew ? 'Add' : 'Update'} pin: ${pin.name}`,
      )
      setData((d) => (d ? { ...d, pins } : d))
      setPinDraft(null)
      setSelected({ kind: 'pin', id: pin.id })
    } finally {
      setSaving(false)
    }
  }

  const deletePin = async (pin: Pin) => {
    setSaving(true)
    try {
      const pins = await updateJsonFile<Pin[]>(
        requireToken(),
        PINS_PATH,
        (cur) => (cur ?? data?.pins ?? []).filter((p) => p.id !== pin.id),
        `Delete pin: ${pin.name}`,
      )
      setData((d) => (d ? { ...d, pins } : d))
      setPinDraft(null)
      setSelected(null)
    } finally {
      setSaving(false)
    }
  }

  const uploadPinMedia = async (pin: Pin, blob: Blob, filename: string, type: MediaItem['type']): Promise<Pin> => {
    const tok = requireToken()
    const src = await uploadMediaFile(tok, pin.id, blob, filename)
    // let this session preview the file before the deploy catches up
    setMediaOverrides((m) => ({ ...m, [src]: URL.createObjectURL(blob) }))
    const item: MediaItem = { type, src }
    let updated: Pin = pin
    const pins = await updateJsonFile<Pin[]>(
      tok,
      PINS_PATH,
      (cur) =>
        (cur ?? data?.pins ?? []).map((p) => {
          if (p.id !== pin.id) return p
          updated = { ...p, media: [...(p.media ?? []), item] }
          return updated
        }),
      `Add ${type} to ${pin.name}`,
    )
    setData((d) => (d ? { ...d, pins } : d))
    return updated
  }

  const removePinMedia = async (pin: Pin, index: number): Promise<Pin> => {
    let updated: Pin = pin
    const pins = await updateJsonFile<Pin[]>(
      requireToken(),
      PINS_PATH,
      (cur) =>
        (cur ?? data?.pins ?? []).map((p) => {
          if (p.id !== pin.id) return p
          updated = { ...p, media: (p.media ?? []).filter((_, i) => i !== index) }
          return updated
        }),
      `Remove media from ${pin.name}`,
    )
    setData((d) => (d ? { ...d, pins } : d))
    return updated
  }

  const saveCategories = async (next: Category[]) => {
    setSaving(true)
    try {
      const categories = await updateJsonFile<Category[]>(requireToken(), CATS_PATH, () => next, 'Update categories')
      setData((d) => (d ? { ...d, categories } : d))
      setShowCats(false)
    } finally {
      setSaving(false)
    }
  }

  const saveExperience = async () => {
    if (!expDraft) return
    setSaving(true)
    try {
      const exp = {
        ...expDraft.experience,
        id: expDraft.experience.id || slugify(expDraft.experience.name) || `exp-${expDraft.experience.steps.length}`,
        name: expDraft.experience.name.trim(),
      }
      const experiences = await updateJsonFile<Experience[]>(
        requireToken(),
        EXPS_PATH,
        (cur) => {
          const list = cur ?? data?.experiences ?? []
          const i = list.findIndex((e) => e.id === exp.id)
          return i >= 0 ? list.map((e, j) => (j === i ? exp : e)) : [...list, exp]
        },
        `${expDraft.isNew ? 'Add' : 'Update'} experience: ${exp.name}`,
      )
      setData((d) => (d ? { ...d, experiences } : d))
      setExpDraft(null)
    } finally {
      setSaving(false)
    }
  }

  const deleteExperience = async () => {
    if (!expDraft) return
    setSaving(true)
    try {
      const experiences = await updateJsonFile<Experience[]>(
        requireToken(),
        EXPS_PATH,
        (cur) => (cur ?? data?.experiences ?? []).filter((e) => e.id !== expDraft.experience.id),
        `Delete experience: ${expDraft.experience.name}`,
      )
      setData((d) => (d ? { ...d, experiences } : d))
      setExpDraft(null)
    } finally {
      setSaving(false)
    }
  }

  if (!data) {
    return (
      <div className="loading-screen">
        <div style={{ fontSize: 40 }}>🗺️</div>
        Loading the map…
      </div>
    )
  }

  const selectedItem =
    selected?.kind === 'pin'
      ? (() => {
          const pin = pinsById.get(selected.id)
          return pin ? ({ kind: 'pin', pin } as const) : null
        })()
      : selected?.kind === 'event'
        ? (() => {
            const event = data.events.find((e) => e.id === selected.id)
            return event ? ({ kind: 'event', event } as const) : null
          })()
        : null

  return (
    <div className="app">
      <MapView
        markers={markers}
        lines={lines}
        path={path}
        focus={focus}
        onMarkerClick={handleMarkerClick}
        onMarkerMoved={handleMarkerMoved}
        onMapClick={handleMapClick}
      />

      <div className="topbars">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="brand">
            <span className="dot" /> Guía de Felicidad
          </div>
          <TimeScopeBar scope={scope} onChange={setScope} />
        </div>
        <FilterBar categories={data.categories} active={activeCats} onChange={setActiveCats} />
        {isAdmin && !expDraft && !drawingLine && (
          <div className="admin-bar">
            <button className="btn" onClick={() => setPlacingPin((v) => !v)}>
              {placingPin ? '✕ Cancel placing' : '📍 Add pin'}
            </button>
            <button
              className="btn"
              onClick={() => {
                setPlacingPin(false)
                setDrawingLine([])
              }}
            >
              〰️ Draw line pin
            </button>
            <button className="btn" disabled={syncing} onClick={syncGoogleList}>
              {syncing ? '⏳ Starting…' : '⟳ Sync Google list'}
            </button>
            <button className="btn" onClick={() => setShowCats(true)}>
              🏷️ Categories
            </button>
            <button
              className="btn"
              onClick={() => {
                setActiveExpId(null)
                setExpDraft({
                  experience: { id: '', name: '', color: '#7c4dff', steps: [] },
                  isNew: true,
                })
              }}
            >
              ✨ New experience
            </button>
            <button
              className="btn"
              onClick={() => {
                setToken(null)
                setTokenState(null)
                window.location.hash = ''
              }}
            >
              ⏏ Sign out
            </button>
          </div>
        )}
        {placingPin && <div className="admin-banner">Tap the map where the pin should go</div>}
        {drawingLine && (
          <div className="admin-banner" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            Tap along the route ({drawingLine.length} points)
            <button
              className="btn"
              style={{ minHeight: 30, padding: '4px 12px' }}
              disabled={drawingLine.length < 2}
              onClick={finishLine}
            >
              ✓ Finish
            </button>
            <button className="btn" style={{ minHeight: 30, padding: '4px 12px' }} onClick={() => setDrawingLine(null)}>
              ✕
            </button>
          </div>
        )}
        {expDraft && <div className="admin-banner">Building “{expDraft.experience.name || 'experience'}” — tap pins to add stops</div>}
      </div>

      {!activeExp && !expDraft && (
        <div className="fab-row">
          <button className="btn" onClick={() => setShowExpList(true)}>
            ✨ Experiences
          </button>
        </div>
      )}

      {data.eventsUpdatedAt && !activeExp && (
        <div className="updated-note">events updated {new Date(data.eventsUpdatedAt).toLocaleDateString()}</div>
      )}

      {selectedItem && !expDraft && (
        <DetailSheet
          item={selectedItem}
          category={catsById.get(selectedItem.kind === 'pin' ? selectedItem.pin.category : selectedItem.event.category)}
          at={at}
          mediaOverrides={mediaOverrides}
          isAdmin={isAdmin}
          onClose={() => setSelected(null)}
          onEdit={(pin) => {
            setSelected(null)
            setPinDraft({ pin, isNew: false })
          }}
        />
      )}

      {showExpList && (
        <ExperienceList
          experiences={data.experiences}
          isAdmin={isAdmin}
          onSelect={(id) => {
            setShowExpList(false)
            setActiveExpId(id)
            setExpStep(0)
            setSelected(null)
            const first = data.experiences.find((e) => e.id === id)?.steps[0]
            const pin = first && pinsById.get(first.pinId)
            if (pin) setFocus({ lat: pin.lat, lng: pin.lng })
          }}
          onEdit={(exp) => {
            setShowExpList(false)
            setExpDraft({ experience: { ...exp, steps: [...exp.steps] }, isNew: false })
          }}
          onClose={() => setShowExpList(false)}
        />
      )}

      {activeExp && (
        <FollowBar
          experience={activeExp}
          pins={pinsById}
          step={expStep}
          onStep={stepTo}
          onExit={() => {
            setActiveExpId(null)
            setExpStep(0)
          }}
        />
      )}

      {/* ----- admin overlays ----- */}
      {isAdminRoute && !token && <AdminGate onToken={(t) => (setToken(t), setTokenState(t))} />}

      {pinDraft && (
        <PinEditor
          draft={pinDraft.pin}
          isNew={pinDraft.isNew}
          categories={data.categories}
          saving={saving}
          onSave={savePin}
          onDelete={deletePin}
          onUploadMedia={uploadPinMedia}
          onRemoveMedia={removePinMedia}
          onCancel={() => setPinDraft(null)}
        />
      )}

      {showCats && <CategoryEditor categories={data.categories} saving={saving} onSave={saveCategories} onClose={() => setShowCats(false)} />}

      {expDraft && (
        <ExperienceBuilder
          draft={expDraft.experience}
          isNew={expDraft.isNew}
          pins={pinsById}
          saving={saving}
          onChange={(experience) => setExpDraft((d) => (d ? { ...d, experience } : d))}
          onSave={saveExperience}
          onDelete={expDraft.isNew ? undefined : deleteExperience}
          onCancel={() => setExpDraft(null)}
        />
      )}
    </div>
  )
}

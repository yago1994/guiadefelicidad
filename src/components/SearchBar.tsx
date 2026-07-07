import { useEffect, useRef, useState } from 'react'
import type { Category } from '../lib/types'
import { searchPlaces, type SearchResult } from '../lib/geosearch'

interface Props {
  categories: Map<string, Category>
  onSelect: (result: SearchResult) => void
  onClose: () => void
}

export default function SearchBar({ categories, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    abortRef.current?.abort()
    setError(null)
    if (query.trim().length < 3) {
      setResults([])
      setBusy(false)
      return
    }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setBusy(true)
    const t = setTimeout(async () => {
      try {
        const found = await searchPlaces(query.trim(), ctrl.signal)
        setResults(found)
        if (found.length === 0) setError('Nothing found around Atlanta with that name.')
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          setError('Search is unavailable right now — try again in a moment.')
        }
      } finally {
        if (!ctrl.signal.aborted) setBusy(false)
      }
    }, 350)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [query])

  return (
    <div className="search-overlay" role="dialog" aria-label="Search places">
      <div className="search-row">
        <input
          ref={inputRef}
          value={query}
          placeholder="Search restaurants, parks, landmarks…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter' && results[0]) onSelect(results[0])
          }}
          aria-label="Search query"
        />
        <button className="btn" onClick={onClose} aria-label="Close search">
          ✕
        </button>
      </div>
      {(results.length > 0 || busy || error) && (
        <div className="search-results">
          {busy && <div className="hint search-status">Searching…</div>}
          {!busy && error && <div className="hint search-status">{error}</div>}
          {results.map((r, i) => (
            <button key={`${r.osmType ?? ''}${r.osmId ?? i}`} className="search-item" onClick={() => onSelect(r)}>
              <span className="search-icon">{categories.get(r.category)?.icon ?? '📍'}</span>
              <span className="grow">
                <span className="search-name">{r.name}</span>
                {r.address && <span className="hint"> {r.address}</span>}
              </span>
            </button>
          ))}
          <div className="hint search-status">Results from OpenStreetMap</div>
        </div>
      )}
    </div>
  )
}

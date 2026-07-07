import { useState } from 'react'
import { repoInfo, verifyToken } from '../../lib/github'

export default function AdminGate({ onToken }: { onToken: (token: string) => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { owner, repo } = repoInfo()

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const ok = await verifyToken(value.trim())
      if (!ok) {
        setError('That token cannot write to the repo. It needs Contents read & write access.')
        return
      }
      onToken(value.trim())
    } catch {
      setError('Could not reach GitHub. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-scrim">
      <div className="modal" role="dialog" aria-label="Admin sign in">
        <h3>🔑 Admin sign in</h3>
        <p className="hint">
          Paste a GitHub <strong>fine-grained personal access token</strong> with <em>Contents: read &
          write</em> on <code>{owner}/{repo}</code> only. It stays in this browser (localStorage) and every
          save becomes a commit.
        </p>
        <div className="field">
          <label htmlFor="pat">Personal access token</label>
          <input
            id="pat"
            type="password"
            value={value}
            placeholder="github_pat_…"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && value && submit()}
            autoComplete="off"
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="actions">
          <button className="btn primary" disabled={!value || busy} onClick={submit}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <a className="btn" href="#/" onClick={() => (window.location.hash = '')}>
            Back to map
          </a>
        </div>
      </div>
    </div>
  )
}

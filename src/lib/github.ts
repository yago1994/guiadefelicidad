/**
 * Minimal GitHub Contents API client used by admin mode.
 * Every save is a commit to main, which triggers the Pages deploy.
 */

const FALLBACK = { owner: 'yago1994', repo: 'guiadefelicidad' }

export function repoInfo(): { owner: string; repo: string } {
  // On GitHub Pages the repo is derivable from the URL:
  // https://<owner>.github.io/<repo>/...
  const host = window.location.hostname
  if (host.endsWith('.github.io')) {
    const owner = host.slice(0, -'.github.io'.length)
    const repo = window.location.pathname.split('/').filter(Boolean)[0]
    if (owner && repo) return { owner, repo }
  }
  return FALLBACK
}

const TOKEN_KEY = 'gdf-admin-token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

function apiBase(): string {
  const { owner, repo } = repoInfo()
  return `https://api.github.com/repos/${owner}/${repo}/contents`
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

/** Check the token can write to the repo (used by the admin gate). */
export async function verifyToken(token: string): Promise<boolean> {
  const { owner, repo } = repoInfo()
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: headers(token),
  })
  if (!res.ok) return false
  const json = await res.json()
  return Boolean(json.permissions?.push)
}

interface FileResult {
  sha: string
  text: string
}

export async function readRepoFile(token: string, path: string): Promise<FileResult | null> {
  const res = await fetch(`${apiBase()}/${path}?ref=main&nocache=${Date.now()}`, {
    headers: headers(token),
    cache: 'no-store',
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub read failed (${res.status}) for ${path}`)
  const json = await res.json()
  const bytes = Uint8Array.from(atob(json.content.replace(/\n/g, '')), (c) => c.charCodeAt(0))
  return { sha: json.sha, text: new TextDecoder().decode(bytes) }
}

export async function writeRepoFile(
  token: string,
  path: string,
  contentBase64: string,
  message: string,
  sha?: string,
): Promise<void> {
  const res = await fetch(`${apiBase()}/${path}`, {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: contentBase64, branch: 'main', ...(sha ? { sha } : {}) }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GitHub write failed (${res.status}): ${body.slice(0, 200)}`)
  }
}

function encodeText(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin)
}

/**
 * Read-modify-write a JSON data file. Always re-reads before writing so the
 * SHA is fresh and concurrent nightly-worker commits aren't clobbered.
 */
export async function updateJsonFile<T>(
  token: string,
  path: string,
  update: (current: T | null) => T,
  message: string,
): Promise<T> {
  const existing = await readRepoFile(token, path)
  const current = existing ? (JSON.parse(existing.text) as T) : null
  const next = update(current)
  await writeRepoFile(token, path, encodeText(JSON.stringify(next, null, 2) + '\n'), message, existing?.sha)
  return next
}

/** Trigger a workflow_dispatch run (requires a token with Actions: write). */
export async function dispatchWorkflow(
  token: string,
  workflowFile: string,
  inputs: Record<string, string> = {},
): Promise<void> {
  const { owner, repo } = repoInfo()
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Could not start the workflow (${res.status}): ${body.slice(0, 160)}`)
  }
}

export const MAX_MEDIA_BYTES = 25 * 1024 * 1024

export async function uploadMediaFile(
  token: string,
  pinId: string,
  file: Blob,
  filename: string,
): Promise<string> {
  if (file.size > MAX_MEDIA_BYTES) {
    throw new Error(
      `File is ${(file.size / 1024 / 1024).toFixed(1)} MB — max is 25 MB. Trim or compress the clip first.`,
    )
  }
  const buf = new Uint8Array(await file.arrayBuffer())
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk))
  }
  const safe = filename.toLowerCase().replace(/[^a-z0-9._-]+/g, '-')
  const path = `public/media/${pinId}/${Date.now()}-${safe}`
  await writeRepoFile(token, path, btoa(bin), `Add media for ${pinId}`)
  // pins.json stores the site-relative path (public/ is the web root)
  return path.replace(/^public\//, '')
}

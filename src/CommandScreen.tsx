import { useEffect, useMemo, useRef, useState } from 'react'
import { loadPaths, shortSite, siteOrder } from './data'
import { Graph } from './screens'
import type { Path } from './types'

/**
 * Command bar: almost no chrome, a palette that finds everything.
 *
 * One index over paths, devices, ports, VLANs and URNs. A result either
 * scopes the canvas (a path, a host) or just reads out (a VLAN across
 * paths). Keyboard-first: up/down to move, enter to go, esc to close.
 */

type Hit =
  | { kind: 'path'; id: string; label: string; sub: string; pathId: string }
  | { kind: 'host'; id: string; label: string; sub: string; pathId: string; host: string }
  | { kind: 'vlan'; id: string; label: string; sub: string; pathIds: string[] }
  | { kind: 'port'; id: string; label: string; sub: string; pathId: string }

function index(paths: Path[]): Hit[] {
  const hits: Hit[] = []
  const vlans = new Map<string, Set<string>>()
  for (const path of paths) {
    hits.push({
      kind: 'path',
      id: `path:${path.id}`,
      label: path.name,
      sub: `${path.nodes.filter((node) => node.endpoint).length} ends · ${siteOrder(path).length} sites · ${path.hops.length} hops`,
      pathId: path.id,
    })
    for (const node of path.nodes) {
      hits.push({ kind: 'host', id: `host:${path.id}:${node.id}`, label: node.label, sub: `${shortSite(node.site)} · in ${path.name}`, pathId: path.id, host: node.id })
      for (const port of node.ports) for (const vlan of port.vlan ? [port.vlan] : []) if (!vlans.has(vlan)) vlans.set(vlan, new Set([path.id]))
      for (const vlan of node.vlans) if (!vlans.has(vlan)) vlans.set(vlan, new Set([path.id]))
    }
    for (const edge of path.edges) for (const vlan of edge.vlans) vlans.set(vlan, (vlans.get(vlan) ?? new Set()).add(path.id))
    for (const node of path.nodes) {
      for (const port of node.ports) {
        hits.push({ kind: 'port', id: `port:${path.id}:${node.id}:${port.name}`, label: port.name, sub: `${node.label} · ${shortSite(node.site)} · ${path.name}`, pathId: path.id })
      }
    }
  }
  for (const [vlan, pathIds] of vlans) {
    hits.push({ kind: 'vlan', id: `vlan:${vlan}`, label: `VLAN ${vlan}`, sub: `on ${pathIds.size} path${pathIds.size === 1 ? '' : 's'}`, pathIds: [...pathIds] })
  }
  return hits
}

export function CommandScreen() {
  const [paths, setPaths] = useState<Path[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [needle, setNeedle] = useState('')
  const [cursor, setCursor] = useState(0)
  const [active, setActive] = useState<{ pathId: string | null; label: string | null }>({ pathId: null, label: null })
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadPaths()
      .then(setPaths)
      .catch((ex) => setError(String(ex)))
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
        setTimeout(() => input.current?.select(), 20)
      }
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const hits = useMemo(() => (paths ? index(paths) : []), [paths])
  const shown = useMemo(() => {
    const q = needle.trim().toLowerCase()
    if (!q) return hits.slice(0, 12)
    return hits
      .filter((hit) => hit.label.toLowerCase().includes(q) || hit.sub.toLowerCase().includes(q))
      .slice(0, 30)
  }, [hits, needle])
  useEffect(() => setCursor(0), [needle])

  const run = (hit: Hit) => {
    setOpen(false)
    setNeedle('')
    if (hit.kind === 'vlan') setActive({ pathId: hit.pathIds[0] ?? null, label: `${hit.label} — ${hit.sub}` })
    else setActive({ pathId: hit.pathId, label: `${hit.label} — ${hit.sub}` })
  }

  if (error) return <div className="screen-msg">could not load data: {error}</div>
  if (!paths) return <div className="screen-msg">loading…</div>
  const path = paths.find((candidate) => candidate.id === active.pathId) ?? null

  return (
    <div className="screen cmd-screen">
      <header className="slim-head">
        <button
          className="cmd-open"
          onClick={() => {
            setOpen(true)
            setTimeout(() => input.current?.focus(), 20)
          }}
        >
          Search anything <kbd>⌘K</kbd>
        </button>
        {active.label && <span className="head-meta">{active.label}</span>}
      </header>
      <div className="screen-body">
        {path ? <Graph path={path} /> : <div className="screen-msg">press ⌘K, or click Search anything, to find a path, host, VLAN or port</div>}

        {open && (
        <div className="cmd-backdrop" onClick={() => setOpen(false)}>
          <div className="cmd-palette" onClick={(event) => event.stopPropagation()}>
            <input
              ref={input}
              autoFocus
              placeholder="path, host, VLAN, port…"
              value={needle}
              onChange={(event) => setNeedle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setCursor((c) => Math.min(c + 1, shown.length - 1))
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setCursor((c) => Math.max(c - 1, 0))
                }
                if (event.key === 'Enter' && shown[cursor]) run(shown[cursor])
              }}
            />
            <ul>
              {shown.map((hit, idx) => (
                <li key={hit.id} className={idx === cursor ? 'on' : ''} onMouseEnter={() => setCursor(idx)} onClick={() => run(hit)}>
                  <span className="cmd-kind">{hit.kind}</span>
                  <span className="cmd-label">{hit.label}</span>
                  <span className="cmd-sub">{hit.sub}</span>
                </li>
              ))}
              {!shown.length && <li className="cmd-none">nothing matches</li>}
            </ul>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}

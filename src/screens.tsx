import { useEffect, useMemo, useRef, useState } from 'react'
import { Background, BackgroundVariant, Controls, ReactFlow, ReactFlowProvider, useNodesState, type Edge, type Node, type NodeChange } from '@xyflow/react'
import { healthFor, loadPaths, shortSite, siteColours, siteOrder } from './data'
import { layeredLayout, orientation } from './layouts'
import { LinkEdgeView } from './edges'
import { DeviceNodeView } from './nodes'
import type { Path } from './types'
export { CommandScreen } from './CommandScreen'

function usePaths(): { paths: Path[] | null; error: string | null } {
  const [paths, setPaths] = useState<Path[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    loadPaths()
      .then(setPaths)
      .catch((ex) => setError(String(ex)))
  }, [])
  return { paths, error }
}

const NODE_TYPES = { device: DeviceNodeView }
const EDGE_TYPES = { link: LinkEdgeView }

function LiveNodes({ computed, links, selected, onPick }: { computed: Node[]; links: Edge[]; selected: string | null; onPick?: (kind: 'node' | 'edge', id: string, at?: { x: number; y: number }) => void }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const moved = useRef(new Map<string, { x: number; y: number }>())
  useEffect(() => {
    setNodes(computed.map((node) => ({ ...node, position: moved.current.get(node.id) ?? node.position, selected: node.id === selected })))
  }, [computed, selected, setNodes])
  const handle = (changes: NodeChange<Node>[]) => {
    for (const change of changes) {
      if (change.type === 'position' && change.position && !change.dragging) moved.current.set(change.id, change.position)
    }
    onNodesChange(changes)
  }
  return (
    <ReactFlow
      nodes={nodes}
      edges={links}
      onNodesChange={handle}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={2.2}
      nodesConnectable={false}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onNodeClick={(event, node) => onPick?.('node', node.id, { x: event.clientX, y: event.clientY })}
      onEdgeClick={(event, edge) => onPick?.('edge', edge.id, { x: event.clientX, y: event.clientY })}
      onPaneClick={() => onPick?.('node', '')}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="#d3dae1" />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}

export function Graph({ path, onPick }: { path: Path; onPick?: (kind: 'node' | 'edge', id: string, at?: { x: number; y: number }) => void }) {
  const placed = useMemo(() => layeredLayout(path, 'LR'), [path])
  const colours = useMemo(() => siteColours(path), [path])
  const computed = useMemo(() => {
    const forward = orientation(path)
    const nodes: Node[] = path.nodes
      .filter((node) => placed.has(node.id))
      .map((node) => ({
        id: node.id,
        type: 'device',
        position: placed.get(node.id)!,
        data: { device: node, colour: colours.get(node.site) ?? '#8a949e', health: healthFor(path, node.site), showSite: true },
      }))
    const edges: Edge[] = path.edges.map((edge) => {
      const flip = forward.get(edge.id) === false
      return {
        id: edge.id,
        source: flip ? edge.target : edge.source,
        target: flip ? edge.source : edge.target,
        type: 'link',
        sourceHandle: 's-right',
        targetHandle: 't-left',
        data: { vlans: edge.vlans, ports: edge.ports, sessions: edge.sessions, scope: edge.scope, colour: '#6b8299', shape: 'bezier', fan: edge.sessions.length > 1 },
      }
    })
    return { nodes, edges }
  }, [path, placed, colours])
  return (
    <ReactFlowProvider>
      <LiveNodes computed={computed.nodes} links={computed.edges} selected={null} onPick={onPick} />
    </ReactFlowProvider>
  )
}

export function CanvasScreen() {
  const { paths, error } = usePaths()
  const [pathId, setPathId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ kind: 'node' | 'edge'; id: string; at: { x: number; y: number } } | null>(null)
  const path = useMemo(() => {
    if (!paths) return null
    if (pathId) return paths.find((candidate) => candidate.id === pathId) ?? paths[0]
    return paths.find((candidate) => candidate.nodes.filter((node) => node.endpoint).length > 2) ?? paths[0]
  }, [paths, pathId])
  useEffect(() => setDetail(null), [pathId])

  if (error) return <div className="screen-msg">could not load data: {error}</div>
  if (!paths || !path) return <div className="screen-msg">loading…</div>
  const node = detail?.kind === 'node' ? path.nodes.find((candidate) => candidate.id === detail.id) : undefined
  const edge = detail?.kind === 'edge' ? path.edges.find((candidate) => candidate.id === detail.id) : undefined

  return (
    <div className="screen">
      <header className="slim-head">
        <strong>{path.name}</strong>
        <span className="chip">{path.state}</span>
        {path.senseState && <span className="chip">{path.senseState}</span>}
        <span className="head-meta">
          {path.nodes.filter((n) => n.endpoint).length} endpoints · {siteOrder(path).length} sites · {path.hops.length} hops
        </span>
      </header>
      <div className="screen-body">
        <Graph path={path} onPick={(kind, id, at) => setDetail(id && at ? { kind, id, at } : null)} />
        {node && detail && (
          <div className="float-card" role="dialog" style={anchor(detail.at)}>
            <button className="float-close" onClick={() => setDetail(null)}>
              ×
            </button>
            <h3>{node.label}</h3>
            <p className="float-sub">
              {shortSite(node.site)} · {node.kind === 'host' ? 'host' : 'switch'} {node.endpoint ? '· endpoint' : ''}
            </p>
            {node.ports.map((port) => (
              <div key={port.name} className="float-row mono">
                <span>{port.name}</span>
                <span>{[port.vlan && `VLAN ${port.vlan}`, port.ipv4, port.ipv6, port.mac].filter(Boolean).join(' · ') || '—'}</span>
              </div>
            ))}
          </div>
        )}
        {edge && detail && (
          <div className="float-card" role="dialog" style={anchor(detail.at)}>
            <button className="float-close" onClick={() => setDetail(null)}>
              ×
            </button>
            <h3>link</h3>
            <p className="float-sub">{edge.scope === 'transit' ? 'continuity asserted, no ports reported' : edge.ports.join(' ↔ ')}</p>
            <div className="float-row">
              <span>VLAN</span>
              <span>{edge.vlans.join(', ') || 'untagged'}</span>
            </div>
            <div className="float-row">
              <span>sessions</span>
              <span>{edge.sessions.length}</span>
            </div>
          </div>
        )}
      </div>
      <footer className="filmstrip">
        {paths.map((candidate) => {
          const warn = Object.values(candidate.health).some((h) => h.status === 'warning')
          return (
            <button key={candidate.id} className={`strip-card ${candidate.id === path.id ? 'on' : ''}`} onClick={() => setPathId(candidate.id)}>
              <span className="strip-name">{candidate.name}</span>
              <span className="strip-meta">
                {candidate.nodes.filter((n) => n.endpoint).length} ends · {siteOrder(candidate).length} sites{warn ? ' · warn' : ''}
              </span>
            </button>
          )
        })}
      </footer>
    </div>
  )
}

/** Put the card beside the click, but never off the edge of the window. */
function anchor(at: { x: number; y: number }): React.CSSProperties {
  const W = 320
  const left = Math.min(at.x + 18, window.innerWidth - W - 16)
  const top = Math.min(Math.max(at.y - 40, 70), Math.max(window.innerHeight - 260, 80))
  return { left: Math.max(left, 12), top, right: 'auto' }
}

export function ListScreen() {
  const { paths, error } = usePaths()
  const [picked, setPicked] = useState<string | null>(null)
  const path = useMemo(() => {
    if (!paths) return null
    if (picked) return paths.find((candidate) => candidate.id === picked) ?? null
    return paths.find((candidate) => new Set(candidate.nodes.map((node) => node.site)).size > 3) ?? paths[0] ?? null
  }, [paths, picked])
  if (error) return <div className="screen-msg">could not load data: {error}</div>
  if (!paths) return <div className="screen-msg">loading…</div>
  return (
    <div className="screen list-screen">
      <div className="list-side">
        {paths.map((candidate) => {
          const health = Object.values(candidate.health)
          const ok = health.filter((h) => h.status === 'ok').length
          const warn = health.filter((h) => h.status === 'warning').length
          const un = health.filter((h) => h.status === 'unmanaged').length
          return (
            <button key={candidate.id} className={`list-row ${candidate.id === path?.id ? 'on' : ''}`} onClick={() => setPicked(candidate.id)}>
              <span className="list-name">{candidate.name}</span>
              <span className="list-dots">
                {ok > 0 && <i style={{ background: '#2e7d32' }}>{ok}</i>}
                {warn > 0 && <i style={{ background: '#b26a00' }}>{warn}</i>}
                {un > 0 && <i style={{ background: '#8a949e' }}>{un}</i>}
              </span>
              <span className="list-meta">
                {candidate.nodes.filter((n) => n.endpoint).length} ends · {siteOrder(candidate).length} sites · {candidate.hops.length} hops
              </span>
              <MiniSketch path={candidate} />
            </button>
          )
        })}
      </div>
      <div className="list-preview">{path ? <Graph path={path} /> : <div className="screen-msg">pick a row</div>}</div>
    </div>
  )
}

function MiniSketch({ path }: { path: Path }) {
  const placed = useMemo(() => layeredLayout(path, 'LR'), [path])
  const colours = useMemo(() => siteColours(path), [path])
  if (!path.nodes.length) return null
  const xs = [...placed.values()].map((p) => p.x)
  const ys = [...placed.values()].map((p) => p.y)
  const minx = Math.min(...xs)
  const maxx = Math.max(...xs) + 196
  const miny = Math.min(...ys)
  const maxy = Math.max(...ys) + 76
  const sx = (v: number) => 6 + ((v - minx) / Math.max(maxx - minx, 1)) * 188
  const sy = (v: number) => 4 + ((v - miny) / Math.max(maxy - miny, 1)) * 22
  return (
    <svg className="minisketch" viewBox="0 0 200 30">
      {path.edges.map((edge) => {
        const a = placed.get(edge.source)
        const b = placed.get(edge.target)
        if (!a || !b) return null
        return <line key={edge.id} x1={sx(a.x + 98)} y1={sy(a.y + 38)} x2={sx(b.x + 98)} y2={sy(b.y + 38)} stroke={edge.scope === 'transit' ? '#c3cdd6' : '#9db4c4'} strokeDasharray={edge.scope === 'transit' ? '2 3' : undefined} strokeWidth={1.4} />
      })}
      {path.nodes.map((node) => {
        const p = placed.get(node.id)
        if (!p) return null
        return <circle key={node.id} cx={sx(p.x + 98)} cy={sy(p.y + 38)} r={node.endpoint ? 3.4 : 2.2} fill={colours.get(node.site) ?? '#8a949e'} />
      })}
    </svg>
  )
}

export function MatrixScreen() {
  const { paths, error } = usePaths()
  const [picked, setPicked] = useState<string | null>(null)
  const path = useMemo(() => {
    if (!paths) return null
    if (picked) return paths.find((candidate) => candidate.id === picked) ?? null
    return paths.find((candidate) => new Set(candidate.nodes.map((node) => node.site)).size > 3) ?? paths[0] ?? null
  }, [paths, picked])
  const matrix = useMemo(() => {
    if (!path) return null
    const sites = siteOrder(path)
    const cells = new Map<string, { vlans: Set<string>; links: number }>()
    const siteof = new Map(path.nodes.map((node) => [node.id, node.site]))
    for (const edge of path.edges) {
      const a = siteof.get(edge.source)!
      const b = siteof.get(edge.target)!
      if (a === b) continue
      const key = [sites.indexOf(a), sites.indexOf(b)].sort().join(':')
      if (!cells.has(key)) cells.set(key, { vlans: new Set(), links: 0 })
      const cell = cells.get(key)!
      cell.links += 1
      for (const vlan of edge.vlans) cell.vlans.add(vlan)
    }
    return { sites, cells }
  }, [path])
  if (error) return <div className="screen-msg">could not load data: {error}</div>
  if (!paths) return <div className="screen-msg">loading…</div>
  return (
    <div className="screen">
      <header className="slim-head">
        <select value={path?.id ?? ''} onChange={(event) => setPicked(event.target.value || null)}>
          {paths.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </header>
      {path && matrix && (
        <div className="matrix-wrap">
          <table className="matrix">
            <thead>
              <tr>
                <th />
                {matrix.sites.map((site) => (
                  <th key={site}>{shortSite(site)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.sites.map((row, i) => (
                <tr key={row}>
                  <th>{shortSite(row)}</th>
                  {matrix.sites.map((col, j) => {
                    if (j === i) return <td key={col} className="diag" />
                    const key = [Math.min(i, j), Math.max(i, j)].join(':')
                    const cell = matrix.cells.get(key)
                    return (
                      <td key={col} className={cell ? 'hit' : ''}>
                        {cell ? (
                          <>
                            <span>{cell.links} link{cell.links === 1 ? '' : 's'}</span>
                            {[...cell.vlans].slice(0, 3).map((vlan) => (
                              <em key={vlan}>{vlan}</em>
                            ))}
                          </>
                        ) : (
                          ''
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!path && <div className="screen-msg">pick a path to see its site-by-site matrix</div>}
    </div>
  )
}

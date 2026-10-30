import { useEffect, useMemo, useRef, useState } from 'react'
import { Background, BackgroundVariant, Controls, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow } from '@xyflow/react'
import { healthFor, loadPaths, shortSite, siteColours, siteOrder } from './data'
import { zoomEdgeTypes, zoomNodeTypes } from './zoomNodes'
import type { Path } from './types'

/**
 * Semantic zoom: the same canvas redraws as you go in.
 *
 * Far: one bubble per domain. Mid: devices. Close: ports and addresses.
 * The zoom level is read off the viewport each frame and decides what the
 * nodes contain, so there is nothing to switch and nothing to get lost in.
 */

const DOMAINS_BELOW = 0.55
const PORTS_ABOVE = 1.15

function levelOf(zoom: number): 0 | 1 | 2 {
  if (zoom < DOMAINS_BELOW) return 0
  if (zoom > PORTS_ABOVE) return 2
  return 1
}

const LEVEL_NAME = ['domains', 'devices', 'ports'] as const

const R = 86
const RSPACE = 62

function domainGraph(path: Path) {
  if (!path.nodes.length) return { nodes: [], edges: [] }
  const colours = siteColours(path)
  const sites = siteOrder(path)
  const devices = new Map<string, number>()
  for (const node of path.nodes) devices.set(node.site, (devices.get(node.site) ?? 0) + 1)
  const siteof = new Map(path.nodes.map((node) => [node.id, node.site]))
  const pairs = new Map<string, number>()
  for (const edge of path.edges) {
    const a = siteof.get(edge.source)!
    const b = siteof.get(edge.target)!
    if (a === b) continue
    const key = [a, b].sort().join('||')
    pairs.set(key, (pairs.get(key) ?? 0) + 1)
  }
  // ring layout by first-seen order
  const cx = 0
  const cy = 0
  const radius = sites.length <= 1 ? 0 : Math.max(170, sites.length * RSPACE)
  const pos = new Map(
    sites.map((site, idx) => {
      const theta = (2 * Math.PI * idx) / sites.length - Math.PI / 2
      return [site, { x: cx + radius * Math.cos(theta) - R, y: cy + radius * Math.sin(theta) - R }]
    }),
  )
  return {
    nodes: sites.map(
      (site) =>
        ({
          id: site,
          type: 'zoomDomain',
          position: pos.get(site)!,
          style: { width: R * 2, height: R * 2 },
          data: { label: shortSite(site), colour: colours.get(site) ?? '#8a949e', devices: devices.get(site) ?? 0, health: healthFor(path, site) },
        }) as any,
    ),
    edges: [...pairs.entries()].map(([key, count]) => {
      const [a, b] = key.split('||')
      return { id: `dom-${key}`, source: a, target: b, type: 'zoomLink', data: { count }, zIndex: -1 } as any
    }),
  }
}

function deviceGraph(path: Path) {
  if (!path.nodes.length) return { nodes: [], edges: [] }
  const colours = siteColours(path)
  const W = 150
  const H = 54
  const bySite = new Map<string, string[]>()
  for (const node of path.nodes) {
    if (!bySite.has(node.site)) bySite.set(node.site, [])
    bySite.get(node.site)!.push(node.id)
  }
  const pos = new Map<string, { x: number; y: number }>()
  const columns: { site: string; ids: string[] }[] = []
  const adjacency = new Map<string, string[]>()
  for (const node of path.nodes) adjacency.set(node.id, [])
  for (const edge of path.edges) {
    adjacency.get(edge.source)?.push(edge.target)
    adjacency.get(edge.target)?.push(edge.source)
  }
  // BFS columns from the first endpoint, keep sites in their own column block
  const start = path.nodes.find((node) => node.endpoint) ?? path.nodes[0]
  const col = new Map<string, number>()
  if (start) {
    col.set(start.id, 0)
    const queue = [start.id]
    while (queue.length) {
      const id = queue.shift()!
      for (const other of adjacency.get(id) ?? []) {
        if (col.has(other)) continue
        col.set(other, col.get(id)! + 1)
        queue.push(other)
      }
    }
  }
  const maxcol = Math.max(...[...col.values(), 0])
  for (const [site, ids] of bySite) columns.push({ site, ids })
  columns.forEach((block, blockIdx) => {
    block.ids.forEach((id, idx) => {
      pos.set(id, { x: (col.get(id) ?? maxcol / 2) * (W + 90), y: blockIdx * 220 + idx * (H + 26) })
    })
  })
  return {
    nodes: path.nodes.map(
      (node) =>
        ({
          id: node.id,
          type: 'zoomDevice',
          position: pos.get(node.id)!,
          style: { width: W, height: H },
          data: { label: node.label, site: shortSite(node.site), colour: colours.get(node.site) ?? '#8a949e', endpoint: node.endpoint, ports: node.ports.length },
        }) as any,
    ),
    edges: path.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, type: 'zoomLink', data: { count: 1, transit: edge.scope === 'transit' }, zIndex: -1 })) as any[],
  }
}

function portGraph(path: Path) {
  const base = deviceGraph(path)
  // same coordinates, taller boxes: each port row adds height the layout
  // already made room for by using generous vertical spacing
  return {
    nodes: base.nodes.map((node: any) => {
      const device = path.nodes.find((candidate) => candidate.id === node.id)!
      return {
        ...node,
        style: { width: 190, height: 34 + device.ports.length * 22 + 14 },
        data: { ...node.data, ports: device.ports },
      }
    }),
    edges: base.edges,
  }
}

function ZoomCanvas({ path, onLevel }: { path: Path; onLevel: (name: string) => void }) {
  const flow = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([])
  const [level, setLevel] = useState<0 | 1 | 2>(1)

  useEffect(() => {
    onLevel(LEVEL_NAME[level])
  }, [level, onLevel])

  useEffect(() => {
    const graph = level === 0 ? domainGraph(path) : level === 1 ? deviceGraph(path) : portGraph(path)
    setNodes(graph.nodes)
    setEdges(graph.edges)
  }, [path, level, setNodes, setEdges])

  // Each level has its own extent. Refit on a level change, but clamp the
  // zoom inside that level's band so the fit cannot immediately trip the
  // threshold it just crossed and bounce back.
  const settling = useRef(false)
  useEffect(() => {
    settling.current = true
    const timer = setTimeout(() => {
      const band = level === 0 ? { minZoom: 0.2, maxZoom: DOMAINS_BELOW - 0.05 } : level === 2 ? { minZoom: PORTS_ABOVE + 0.05, maxZoom: 1.8 } : { minZoom: DOMAINS_BELOW + 0.05, maxZoom: PORTS_ABOVE - 0.05 }
      flow.fitView({ duration: 300, padding: 0.18, ...band })
      setTimeout(() => {
        settling.current = false
      }, 380)
    }, 60)
    return () => clearTimeout(timer)
  }, [path, level, flow])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={zoomNodeTypes}
      edgeTypes={zoomEdgeTypes}
      onNodeClick={() => undefined}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onMove={(_event, viewport) => {
        if (!settling.current) setLevel(levelOf(viewport.zoom))
      }}
      minZoom={0.14}
      maxZoom={2.5}
      fitView
    >
      <Background variant={BackgroundVariant.Dots} gap={26} size={1.2} color="#d3dae1" />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  )
}

export function ZoomScreen() {
  const { paths, error } = usePathsSuspended()
  const [pathId, setPathId] = usePathState(paths)
  const [levelName, setLevelName] = useState('devices')
  const path = useMemo(() => {
    if (!paths) return null
    if (pathId) return paths.find((candidate) => candidate.id === pathId) ?? paths[0]
    return paths.find((candidate) => new Set(candidate.nodes.map((node) => node.site)).size > 3) ?? paths[0]
  }, [paths, pathId])
  if (error) return <div className="screen-msg">could not load data: {error}</div>
  if (!paths || !path) return <div className="screen-msg">loading…</div>
  return (
    <div className="screen">
      <header className="slim-head">
        <select value={path.id} onChange={(event) => setPathId(event.target.value)}>
          {paths.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
        <span className="head-meta">showing <strong>{levelName}</strong> · zoom out for domains, in for ports</span>
      </header>
      <div className="screen-body">
        <ReactFlowProvider key={path.id}>
          <ZoomCanvas path={path} onLevel={setLevelName} />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
function usePathsSuspended() {
  const [paths, setPaths] = useState<Path[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    loadPaths()
      .then(setPaths)
      .catch((ex) => setError(String(ex)))
  }, [])
  return { paths, error }
}

function usePathState(paths: Path[] | null) {
  return useState<string | null>(paths?.[0]?.id ?? null)
}

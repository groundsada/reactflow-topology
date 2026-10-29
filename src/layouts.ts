import dagre from 'dagre'
import type { Path } from './types'

export const NODE_W = 196
export const NODE_H = 76
export const HOST_W = 168
export const HOST_H = 64

export type Placed = Map<string, { x: number; y: number; w: number; h: number }>

function size(path: Path, id: string) {
  const node = path.nodes.find((candidate) => candidate.id === id)
  return node?.kind === 'host' ? { w: HOST_W, h: HOST_H } : { w: NODE_W, h: NODE_H }
}

export function orientation(path: Path): Map<string, boolean> {
  const neighbours = new Map<string, string[]>()
  for (const node of path.nodes) neighbours.set(node.id, [])
  for (const edge of path.edges) {
    neighbours.get(edge.source)?.push(edge.target)
    neighbours.get(edge.target)?.push(edge.source)
  }
  const root = [...path.nodes].sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id))[0]
  const depth = new Map<string, number>()
  if (root) {
    depth.set(root.id, 0)
    const queue = [root.id]
    while (queue.length) {
      const id = queue.shift()!
      for (const other of neighbours.get(id) ?? []) {
        if (depth.has(other)) continue
        depth.set(other, (depth.get(id) ?? 0) + 1)
        queue.push(other)
      }
    }
  }
  const out = new Map<string, boolean>()
  for (const edge of path.edges) {
    const ds = depth.get(edge.source) ?? 0
    const dt = depth.get(edge.target) ?? 0
    out.set(edge.id, ds <= dt)
  }
  return out
}

export function layeredLayout(path: Path, direction: 'LR' | 'TB' = 'LR'): Placed {
  const graph = new dagre.graphlib.Graph()
  graph.setGraph({ rankdir: direction, nodesep: 46, ranksep: 120, marginx: 40, marginy: 40 })
  graph.setDefaultEdgeLabel(() => ({}))
  for (const node of path.nodes) {
    const { w, h } = size(path, node.id)
    graph.setNode(node.id, { width: w, height: h })
  }
  const forward = orientation(path)
  for (const edge of path.edges) {
    if (forward.get(edge.id)) graph.setEdge(edge.source, edge.target)
    else graph.setEdge(edge.target, edge.source)
  }
  dagre.layout(graph)
  const out: Placed = new Map()
  for (const node of path.nodes) {
    const laid = graph.node(node.id)
    if (!laid) continue
    out.set(node.id, { x: laid.x - laid.width / 2, y: laid.y - laid.height / 2, w: laid.width, h: laid.height })
  }
  return out
}

export type GroupBox = { site: string; x: number; y: number; w: number; h: number }

const PAD = 52
const HEADER = 34
const GROUP_GAP = 64

export function groupedLayout(path: Path): { nodes: Placed; groups: GroupBox[] } {
  const bySite = new Map<string, string[]>()
  for (const node of path.nodes) {
    if (!bySite.has(node.site)) bySite.set(node.site, [])
    bySite.get(node.site)!.push(node.id)
  }

  const inner = new Map<string, Placed>()
  const boxsize = new Map<string, { w: number; h: number }>()
  for (const [site, ids] of bySite) {
    const graph = new dagre.graphlib.Graph()
    graph.setGraph({ rankdir: 'LR', nodesep: 30, ranksep: 80, marginx: 0, marginy: 0 })
    graph.setDefaultEdgeLabel(() => ({}))
    for (const id of ids) {
      const { w, h } = size(path, id)
      graph.setNode(id, { width: w, height: h })
    }
    for (const edge of path.edges) {
      if (ids.includes(edge.source) && ids.includes(edge.target)) graph.setEdge(edge.source, edge.target)
    }
    dagre.layout(graph)
    const placed: Placed = new Map()
    let maxx = 0
    let maxy = 0
    for (const id of ids) {
      const laid = graph.node(id)
      if (!laid) continue
      const x = laid.x - laid.width / 2 + PAD
      const y = laid.y - laid.height / 2 + PAD + HEADER
      placed.set(id, { x, y, w: laid.width, h: laid.height })
      maxx = Math.max(maxx, x + laid.width)
      maxy = Math.max(maxy, y + laid.height)
    }
    inner.set(site, placed)
    boxsize.set(site, { w: maxx + PAD, h: maxy + PAD })
  }

  const outer = new dagre.graphlib.Graph()
  outer.setGraph({ rankdir: 'LR', nodesep: GROUP_GAP, ranksep: GROUP_GAP + 40, marginx: 40, marginy: 40 })
  outer.setDefaultEdgeLabel(() => ({}))
  for (const [site, dims] of boxsize) outer.setNode(site, { width: dims.w, height: dims.h })
  const siteof = new Map(path.nodes.map((node) => [node.id, node.site]))
  for (const edge of path.edges) {
    const sa = siteof.get(edge.source)
    const sb = siteof.get(edge.target)
    if (sa && sb && sa !== sb) outer.setEdge(sa, sb)
  }
  dagre.layout(outer)

  const groups: GroupBox[] = []
  const nodes: Placed = new Map()
  for (const [site, dims] of boxsize) {
    const laid = outer.node(site)
    const ox = (laid?.x ?? 0) - dims.w / 2
    const oy = (laid?.y ?? 0) - dims.h / 2
    groups.push({ site, x: ox, y: oy, w: dims.w, h: dims.h })
    for (const [id, pos] of inner.get(site) ?? []) {
      nodes.set(id, { x: pos.x, y: pos.y, w: pos.w, h: pos.h })
    }
  }
  return { nodes, groups }
}

export function radialLayout(path: Path): Placed {
  const ends = path.nodes.filter((node) => node.endpoint)
  const transit = path.nodes.filter((node) => !node.endpoint)
  const count = Math.max(ends.length, 1)
  const rim = Math.max(300, 92 * count)
  const cx = rim + NODE_W
  const cy = rim + NODE_H
  const out: Placed = new Map()

  const angle = new Map<string, number>()
  ends.forEach((node, idx) => {
    const theta = (2 * Math.PI * idx) / count - Math.PI / 2
    angle.set(node.id, theta)
    const { w, h } = size(path, node.id)
    out.set(node.id, { x: cx + rim * Math.cos(theta) - w / 2, y: cy + rim * Math.sin(theta) - h / 2, w, h })
  })

  const neighbours = new Map<string, string[]>()
  for (const node of path.nodes) neighbours.set(node.id, [])
  for (const edge of path.edges) {
    neighbours.get(edge.source)?.push(edge.target)
    neighbours.get(edge.target)?.push(edge.source)
  }
  for (let pass = 0; pass < 4; pass += 1) {
    for (const node of transit) {
      const known = (neighbours.get(node.id) ?? []).map((id) => angle.get(id)).filter((a): a is number => a !== undefined)
      if (!known.length) continue
      const sx = known.reduce((acc, a) => acc + Math.cos(a), 0)
      const sy = known.reduce((acc, a) => acc + Math.sin(a), 0)
      angle.set(node.id, Math.atan2(sy, sx))
    }
  }
  if (transit.length === 1) {
    const only = transit[0]
    const { w, h } = size(path, only.id)
    out.set(only.id, { x: cx - w / 2, y: cy - h / 2, w, h })
    return out
  }

  const ordered = [...transit].sort((a, b) => (angle.get(a.id) ?? 0) - (angle.get(b.id) ?? 0))
  let placed = 0
  let ring = 0
  while (placed < ordered.length) {
    const radius = rim * (0.26 + 0.26 * ring)
    const capacity = Math.max(3, Math.floor((2 * Math.PI * radius) / (NODE_W + 34)))
    const slice = ordered.slice(placed, placed + capacity)
    const offset = angle.get(slice[0].id) ?? 0
    slice.forEach((node, idx) => {
      const theta = offset + (2 * Math.PI * idx) / slice.length
      const { w, h } = size(path, node.id)
      out.set(node.id, { x: cx + radius * Math.cos(theta) - w / 2, y: cy + radius * Math.sin(theta) - h / 2, w, h })
    })
    placed += slice.length
    ring += 1
  }
  return out
}

export function metroLayout(path: Path): Placed {
  const neighbours = new Map<string, string[]>()
  for (const node of path.nodes) neighbours.set(node.id, [])
  for (const edge of path.edges) {
    neighbours.get(edge.source)?.push(edge.target)
    neighbours.get(edge.target)?.push(edge.source)
  }
  const start = (path.nodes.find((node) => node.endpoint) ?? path.nodes[0])?.id
  const rank = new Map<string, number>()
  if (start) {
    const queue = [start]
    rank.set(start, 0)
    while (queue.length) {
      const id = queue.shift()!
      for (const other of neighbours.get(id) ?? []) {
        if (rank.has(other)) continue
        rank.set(other, (rank.get(id) ?? 0) + 1)
        queue.push(other)
      }
    }
  }
  const sites: string[] = []
  for (const node of path.nodes) if (!sites.includes(node.site)) sites.push(node.site)

  const COL = NODE_W + 92
  const ROW = NODE_H + 54
  const taken = new Set<string>()
  const out: Placed = new Map()
  for (const node of path.nodes) {
    const col = rank.get(node.id) ?? 0
    let row = sites.indexOf(node.site)
    while (taken.has(`${col}:${row}`)) row += sites.length
    taken.add(`${col}:${row}`)
    const { w, h } = size(path, node.id)
    out.set(node.id, { x: 40 + col * COL, y: 40 + row * ROW, w, h })
  }
  return out
}

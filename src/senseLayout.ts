import dagre from 'dagre'

export type Sized = { id: string; w: number; h: number }
export type Link = { source: string; target: string }
export type Mode = 'hierarchical' | 'orthogonal' | 'force'

export const MODE_LABEL: Record<Mode, string> = {
  hierarchical: 'hierarchical',
  orthogonal: 'orthogonal',
  force: 'radial',
}

const GRID = 20

export function senseLayout(items: Sized[], links: Link[], mode: Mode): Map<string, { x: number; y: number }> {
  if (mode === 'force') return rings(items, links)

  const graph = new dagre.graphlib.Graph()
  graph.setGraph(
    mode === 'orthogonal'
      ? { rankdir: 'LR', nodesep: 60, ranksep: 140, marginx: 60, marginy: 60, ranker: 'longest-path' }
      : { rankdir: 'LR', nodesep: 44, ranksep: 130, marginx: 60, marginy: 60 },
  )
  graph.setDefaultEdgeLabel(() => ({}))
  for (const item of items) graph.setNode(item.id, { width: item.w, height: item.h })
  const known = new Set(items.map((item) => item.id))
  for (const link of links) if (known.has(link.source) && known.has(link.target)) graph.setEdge(link.source, link.target)
  dagre.layout(graph)

  const out = new Map<string, { x: number; y: number }>()
  for (const item of items) {
    const laid = graph.node(item.id)
    if (!laid) continue
    let x = laid.x - item.w / 2
    let y = laid.y - item.h / 2
    if (mode === 'orthogonal') {
      x = Math.round(x / GRID) * GRID
      y = Math.round(y / GRID) * GRID
    }
    out.set(item.id, { x, y })
  }
  return out
}

function rings(items: Sized[], links: Link[]): Map<string, { x: number; y: number }> {
  const neighbours = new Map<string, string[]>()
  for (const item of items) neighbours.set(item.id, [])
  for (const link of links) {
    neighbours.get(link.source)?.push(link.target)
    neighbours.get(link.target)?.push(link.source)
  }
  const root = [...items].sort((a, b) => (neighbours.get(b.id)?.length ?? 0) - (neighbours.get(a.id)?.length ?? 0) || a.id.localeCompare(b.id))[0]
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
  const byDepth = new Map<number, Sized[]>()
  for (const item of items) {
    const d = depth.get(item.id) ?? 0
    if (!byDepth.has(d)) byDepth.set(d, [])
    byDepth.get(d)!.push(item)
  }
  const widest = Math.max(...items.map((item) => item.w), 200)
  const tallest = Math.max(...items.map((item) => item.h), 120)
  const out = new Map<string, { x: number; y: number }>()
  let cx = 0
  let cy = 0
  const maxDepth = Math.max(...[...byDepth.keys()], 0)
  const span = (maxDepth + 1) * (widest + 90)
  cx = span
  cy = span
  for (const [d, group] of [...byDepth].sort((a, b) => a[0] - b[0])) {
    if (d === 0) {
      group.forEach((item, idx) => out.set(item.id, { x: cx - item.w / 2 + idx * (item.w + 40), y: cy - item.h / 2 }))
      continue
    }
    const radius = d * Math.max(widest + 90, tallest + 90)
    group.forEach((item, idx) => {
      const theta = (2 * Math.PI * idx) / group.length - Math.PI / 2
      out.set(item.id, { x: cx + radius * Math.cos(theta) - item.w / 2, y: cy + radius * Math.sin(theta) - item.h / 2 })
    })
  }
  return out
}

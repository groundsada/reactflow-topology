import type { DeviceEdge, DeviceNode, Path, SiteHealth } from './types'

export async function loadPaths(): Promise<Path[]> {
  const resp = await fetch(`${import.meta.env.BASE_URL}data/paths.json`)
  if (!resp.ok) throw new Error(`paths.json: ${resp.status} ${resp.statusText}`)
  const body = (await resp.json()) as { paths: Path[] }
  return body.paths
}

export function siteOrder(path: Path): string[] {
  const seen: string[] = []
  for (const node of path.nodes) if (!seen.includes(node.site)) seen.push(node.site)
  return seen
}

export function healthFor(path: Path, site: string): SiteHealth | null {
  if (path.health[site]) return path.health[site]
  const hit = Object.keys(path.health).find((key) => key === site || site.startsWith(key) || key.startsWith(site))
  return hit ? path.health[hit] : null
}

export function adjacency(path: Path): Map<string, DeviceEdge[]> {
  const out = new Map<string, DeviceEdge[]>()
  for (const node of path.nodes) out.set(node.id, [])
  for (const edge of path.edges) {
    out.get(edge.source)?.push(edge)
    out.get(edge.target)?.push(edge)
  }
  return out
}

export function nodeIndex(path: Path): Map<string, DeviceNode> {
  return new Map(path.nodes.map((node) => [node.id, node]))
}

export function hopsByDevice(path: Path): { node: string; site: string; hops: Path['hops'] }[] {
  const out: { node: string; site: string; hops: Path['hops'] }[] = []
  for (const hop of path.hops) {
    const last = out[out.length - 1]
    if (last && last.node === hop.node) last.hops.push(hop)
    else out.push({ node: hop.node, site: hop.site, hops: [hop] })
  }
  return out
}

export function vlansOf(path: Path): string[] {
  const seen = new Set<string>()
  for (const edge of path.edges) for (const vlan of edge.vlans) seen.add(vlan)
  for (const node of path.nodes) for (const vlan of node.vlans) seen.add(vlan)
  return [...seen].sort()
}

export function connectivity(path: Path): { seen: number; total: number } {
  const adj = adjacency(path)
  if (!path.nodes.length) return { seen: 0, total: 0 }
  const seen = new Set<string>()
  const stack = [path.nodes[0].id]
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    for (const edge of adj.get(id) ?? []) {
      const other = edge.source === id ? edge.target : edge.source
      if (!seen.has(other)) stack.push(other)
    }
  }
  return { seen: seen.size, total: path.nodes.length }
}

const PALETTE = ['#2f5d8a', '#8a5a2f', '#3f7a4d', '#8a3f4d', '#5b4a85', '#2f737f', '#7a6a2f', '#55606d']

export function siteColours(path: Path): Map<string, string> {
  const out = new Map<string, string>()
  siteOrder(path).forEach((site, idx) => out.set(site, PALETTE[idx % PALETTE.length]))
  return out
}

export function vlanColours(path: Path): Map<string, string> {
  const out = new Map<string, string>()
  vlansOf(path).forEach((vlan, idx) => out.set(vlan, PALETTE[idx % PALETTE.length]))
  return out
}

export function reported(value: string | null | undefined): string | null {
  if (!value) return null
  return /^\?.*\?$/.test(value) ? null : value
}

export function shortSite(site: string): string {
  return site.replace(/^urn:ogf:network:/, '').replace(/:\d{4}:?$/, '') || site
}

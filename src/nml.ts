
import { reported } from './data'
import type { Intent, Path } from './types'

export type Provenance = 'manifest' | 'derived'

export type Attribute = {
  key: 'belongsTo' | 'hasLabel' | 'isAlias' | 'tag' | 'type' | 'encoding' | 'capacity' | 'address'
  value: string
  from: Provenance
  pivot?: string
  external?: boolean
}

export type Resource = {
  id: string
  urn: string
  short: string
  type: 'BidirectionalPort' | 'Node' | 'Topology' | 'SwitchingService'
  device: string | null
  site: string
  attributes: Attribute[]
}

function deviceUrn(urn: string, port: string | null): string | null {
  if (!port) return null
  const at = urn.lastIndexOf(`:${port}`)
  return at > 0 ? urn.slice(0, at) : null
}

function shorten(urn: string): string {
  return urn.replace(/^urn:ogf:network:/, '')
}

function connectionFor(intent: Intent, urn: string) {
  return intent.connections.find((connection) => connection.terminals.some((terminal) => terminal.uri === urn)) ?? null
}

export function resources(path: Path): Resource[] {
  const out: Resource[] = []
  const seen = new Set<string>()
  const siteOf = new Map(path.nodes.map((node) => [node.id, node.site]))

  for (const hop of path.hops) {
    const site = siteOf.get(hop.node) ?? hop.site
    const dev = deviceUrn(hop.urn, hop.port)

    if (hop.site && !seen.has(`topo:${hop.site}`)) {
      seen.add(`topo:${hop.site}`)
      out.push({
        id: `topo:${hop.site}`,
        urn: hop.site,
        short: shorten(hop.site) || hop.site,
        type: 'Topology',
        device: null,
        site,
        attributes: [
          { key: 'type', value: 'Topology', from: 'derived' },
          { key: 'tag', value: site, from: 'manifest' },
        ],
      })
    }

    if (dev && !seen.has(`node:${dev}`)) {
      seen.add(`node:${dev}`)
      const device = path.nodes.find((candidate) => candidate.id === hop.node)
      const attributes: Attribute[] = [
        { key: 'type', value: hop.kind === 'host' ? 'Node (DTN)' : 'Node', from: 'manifest' },
      ]
      if (hop.site) attributes.push({ key: 'belongsTo', value: hop.site, from: 'derived', pivot: `topo:${hop.site}` })
      if (device?.joint) attributes.push({ key: 'tag', value: device.joint, from: 'manifest' })
      for (const addr of [...(device?.ips ?? []), ...(device?.macs ?? [])]) {
        const value = reported(addr)
        if (value) attributes.push({ key: 'address', value, from: 'manifest' })
      }
      out.push({ id: `node:${dev}`, urn: dev, short: hop.node, type: 'Node', device: hop.node, site, attributes })

      const ports = device?.ports.length ?? 0
      if (ports > 1) {
        out.push({
          id: `svc:${dev}`,
          urn: `${dev}:SwitchingService`,
          short: `${hop.node} · switching`,
          type: 'SwitchingService',
          device: hop.node,
          site,
          attributes: [
            { key: 'type', value: 'SwitchingService', from: 'derived' },
            { key: 'belongsTo', value: dev, from: 'derived', pivot: `node:${dev}` },
            { key: 'encoding', value: 'ethernet / vlan', from: 'derived' },
            ...(device?.vlans ?? []).map((vlan): Attribute => ({ key: 'hasLabel', value: `label: ${vlan}`, from: 'manifest' })),
          ],
        })
      }
    }

    const connection = connectionFor(path.intent, hop.urn)
    const attributes: Attribute[] = [{ key: 'type', value: 'BidirectionalPort', from: 'manifest' }]
    if (dev) attributes.push({ key: 'belongsTo', value: dev, from: 'derived', pivot: `node:${dev}` })
    if (hop.vlan) attributes.push({ key: 'hasLabel', value: `label: ${hop.vlan}`, from: 'manifest' })
    if (hop.peer) {
      const local = path.hops.find((candidate) => candidate.urn === hop.peer)
      attributes.push({
        key: 'isAlias',
        value: hop.peer,
        from: 'manifest',
        pivot: local ? `port:${hop.peer}` : undefined,
        external: !local,
      })
    }
    if (connection?.name) attributes.push({ key: 'tag', value: `policy:${connection.name.replace(/\s+/g, '_')}`, from: 'manifest' })
    if (connection?.bandwidth) {
      attributes.push({ key: 'capacity', value: `${connection.bandwidth} Mb/s${connection.qos ? ` · ${connection.qos}` : ''}`, from: 'manifest' })
    }
    for (const addr of [hop.ipv4, hop.ipv6, hop.mac]) {
      const value = reported(addr)
      if (value) attributes.push({ key: 'address', value, from: 'manifest' })
    }
    out.push({
      id: `port:${hop.urn}`,
      urn: hop.urn,
      short: `${hop.node} · ${hop.port ?? '?'}`,
      type: 'BidirectionalPort',
      device: hop.node,
      site,
      attributes,
    })
  }
  return out
}

export type Finding = {
  level: 'error' | 'warning' | 'info' | 'unavailable'
  rule: string
  detail: string
}

export function validate(path: Path): Finding[] {
  const out: Finding[] = []

  const adj = new Map<string, string[]>()
  for (const node of path.nodes) adj.set(node.id, [])
  for (const edge of path.edges) {
    adj.get(edge.source)?.push(edge.target)
    adj.get(edge.target)?.push(edge.source)
  }
  const seen = new Set<string>()
  const stack = path.nodes.length ? [path.nodes[0].id] : []
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    for (const other of adj.get(id) ?? []) if (!seen.has(other)) stack.push(other)
  }
  if (seen.size !== path.nodes.length) {
    out.push({ level: 'error', rule: 'path continuity', detail: `${path.nodes.length - seen.size} of ${path.nodes.length} devices are not reachable from the first - the reported graph is in pieces.` })
  }
  const transit = path.edges.filter((edge) => edge.scope === 'transit')
  if (transit.length) {
    out.push({ level: 'info', rule: 'asserted continuity', detail: `${transit.length} link${transit.length === 1 ? '' : 's'} drawn without a reported port pair: an opaque domain gave only its ingress and egress, so continuity across it is assumed, not observed.` })
  }

  const spread = path.nodes
    .map((node) => {
      const counts = new Map<string, number>()
      for (const port of node.ports) if (port.vlan) counts.set(port.vlan, (counts.get(port.vlan) ?? 0) + 1)
      const worst = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
      return worst && worst[1] > 1 ? `${node.label} ×${worst[1]} on VLAN ${worst[0]}` : null
    })
    .filter(Boolean)
  if (spread.length) {
    out.push({
      level: 'unavailable',
      rule: 'duplicate VLAN tag',
      detail: `${spread.length} device(s) repeat a tag across ports (${spread.slice(0, 3).join('; ')}${spread.length > 3 ? ', …' : ''}). That is what a broadcast segment looks like; the manifest does not say which service each port serves, so a real collision cannot be told apart from it here.`,
    })
  }

  for (let idx = 1; idx < path.hops.length; idx += 1) {
    const prev = path.hops[idx - 1]
    const hop = path.hops[idx]
    if (prev.vlan && hop.vlan && prev.vlan !== hop.vlan && prev.node !== hop.node) {
      out.push({ level: 'info', rule: 'VLAN translation', detail: `${prev.node} VLAN ${prev.vlan} → ${hop.node} VLAN ${hop.vlan}.` })
    }
  }

  const delivered = new Set(path.hops.map((hop) => hop.urn))
  for (const connection of path.intent.connections) {
    for (const terminal of connection.terminals) {
      if (!delivered.has(terminal.uri)) {
        out.push({ level: 'warning', rule: 'terminal not in manifest', detail: `the intent asks for ${shorten(terminal.uri)} but no manifest hop reports it.` })
      }
      if (terminal.vlan === 'any') {
        out.push({ level: 'info', rule: 'unresolved label request', detail: `${shorten(terminal.uri)} was requested with vlan "any"; the delivered tag is whatever the domain chose.` })
      }
    }
    if (!connection.bandwidth) {
      out.push({ level: 'unavailable', rule: 'bandwidth oversubscription', detail: `${connection.name ?? 'connection'} declares no capacity, so there is nothing to check a sum against.` })
    }
  }

  for (const [site, health] of Object.entries(path.health)) {
    if (health.status === 'warning') out.push({ level: 'warning', rule: 'SiteRM', detail: `${site}: ${health.warnings.length} warning(s) of ${health.total} check(s).` })
    if (health.status === 'unmanaged') out.push({ level: 'unavailable', rule: 'SiteRM', detail: `${site} is not monitored${health.reason ? ` - ${health.reason}` : ''}; its state here is unknown, not healthy.` })
  }

  out.push({ level: 'unavailable', rule: 'MTU mismatch', detail: 'no MTU is reported for any port in the manifest or the intent, so this check cannot run.' })
  out.push({ level: 'unavailable', rule: 'latency', detail: 'the manifest carries no delay metric; hover tooltips say so rather than showing a zero.' })

  return out
}

export function matches(resource: Resource, needle: string): boolean {
  if (!needle) return true
  const hay = [resource.urn, resource.short, resource.site, resource.type, ...resource.attributes.map((attribute) => attribute.value)].join(' ').toLowerCase()
  return hay.includes(needle.toLowerCase())
}

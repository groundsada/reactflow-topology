
export type PortDetail = {
  name: string
  vlan: string | null
  ipv4: string | null
  ipv6: string | null
  mac: string | null
  peer: string | null
}

export type DeviceNode = {
  id: string
  label: string
  site: string
  kind: 'switch' | 'host'
  ports: PortDetail[]
  vlans: string[]
  ips: string[]
  macs: string[]
  joint: string | null
  degree: number
  endpoint: boolean
}

export type Session = { id: string; ports: string[]; vlans: string[] }

export type DeviceEdge = {
  id: string
  source: string
  target: string
  vlans: string[]
  ports: string[]
  sessions: Session[]
  scope: 'internal' | 'interdomain' | 'transit'
}

export type Hop = {
  index: number
  kind: 'host' | 'switch'
  site: string
  node: string
  port: string | null
  urn: string
  peer: string | null
  vlan: string | null
  ipv4: string | null
  ipv6: string | null
  mac: string | null
  joint: string | null
}

export type SiteHealth = {
  managed: boolean
  reason: string | null
  total: number
  warnings: { host: string; service: string; state: string; detail: string | null }[]
  status: 'ok' | 'warning' | 'unmanaged'
}

export type Terminal = { uri: string; vlan: string | null; ipv4: string | null; ipv6: string | null }

export type Intent = {
  type: string | null
  connections: {
    name: string | null
    terminals: Terminal[]
    bandwidth: string | null
    qos: string | null
    schedule: string | null
  }[]
}

export type Path = {
  id: string
  name: string
  source: 'production' | 'synthetic'
  uuid: string
  orchestrator: string | null
  state: string | null
  senseState: string | null
  owner: string | null
  timestamp: string | null
  intent: Intent
  health: Record<string, SiteHealth>
  nodes: DeviceNode[]
  edges: DeviceEdge[]
  hops: Hop[]
  manifestPorts?: number
  problem: string | null
}

export type ViewId = 'layered' | 'grouped' | 'ladder' | 'radial' | 'metro'

export type ScreenId = 'canvas' | 'zoom' | 'list' | 'command' | 'matrix' | 'console'

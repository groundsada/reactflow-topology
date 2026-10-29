import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { DeviceNode, SiteHealth } from './types'
import { shortSite } from './data'

export type DeviceData = {
  device: DeviceNode
  colour: string
  health: SiteHealth | null
  showSite: boolean
  compact?: boolean
  dim?: boolean
}

const STATUS_DOT: Record<SiteHealth['status'], string> = {
  ok: '#2e7d32',
  warning: '#b26a00',
  unmanaged: '#8a949e',
}

export function DeviceNodeView({ data, selected }: NodeProps) {
  const { device, colour, health, showSite, compact, dim } = data as unknown as DeviceData
  const isHost = device.kind === 'host'
  const ports = device.ports.map((port) => port.name)
  return (
    <div
      className={`device ${isHost ? 'host' : 'switch'} ${selected ? 'selected' : ''} ${compact ? 'compact' : ''} ${dim ? 'dim' : ''}`}
      style={{ borderColor: colour, ['--accent' as string]: colour }}
    >
      {(['left', 'right', 'top', 'bottom'] as const).map((side) => (
        <span key={side}>
          <Handle type="target" id={`t-${side}`} position={POS[side]} className="dot" />
          <Handle type="source" id={`s-${side}`} position={POS[side]} className="dot" />
        </span>
      ))}
      <div className="device-top">
        <span className={`kind-mark ${isHost ? 'host-mark' : device.degree > 2 ? 'branch-mark' : 'switch-mark'}`} />
        <span className="device-label">{device.label}</span>
        {health && <span className="status" title={statusTitle(health)} style={{ background: STATUS_DOT[health.status] }} />}
      </div>
      {showSite && <div className="device-site">{shortSite(device.site)}</div>}
      {!compact && ports.length > 0 && (
        <div className="device-ports" title={ports.join(', ')}>
          {ports.slice(0, 3).join(' · ')}
          {ports.length > 3 ? ` +${ports.length - 3}` : ''}
        </div>
      )}
      {device.endpoint && <div className="end-flag">endpoint</div>}
    </div>
  )
}

const POS = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
} as const

function statusTitle(health: SiteHealth) {
  if (health.status === 'unmanaged') return health.reason ?? 'not monitored by SiteRM'
  if (health.status === 'warning') return `${health.warnings.length} SiteRM warning(s)`
  return `SiteRM reporting, ${health.total} check(s), no warnings`
}

export type GroupData = { site: string; colour: string; health: SiteHealth | null; devices: number }

export function SiteGroupView({ data }: NodeProps) {
  const { site, colour, health, devices } = data as unknown as GroupData
  return (
    <div className="site-group" style={{ borderColor: colour, ['--accent' as string]: colour }}>
      <div className="site-group-head">
        <span className="swatch" style={{ background: colour }} />
        <span className="site-name">{shortSite(site)}</span>
        <span className="site-count">{devices}</span>
        {health && <span className="status" title={statusTitle(health)} style={{ background: STATUS_DOT[health.status] }} />}
      </div>
    </div>
  )
}

export type HopData = {
  hop: import('./types').Hop
  colour: string
  health: SiteHealth | null
  crossing: boolean
  first: boolean
  last: boolean
}

export function HopNodeView({ data, selected }: NodeProps) {
  const { hop, colour, health, crossing, first, last } = data as unknown as HopData
  return (
    <div className={`hop ${selected ? 'selected' : ''} ${crossing ? 'crossing' : ''}`} style={{ ['--accent' as string]: colour }}>
      <Handle type="target" position={Position.Top} className="dot" />
      <Handle type="source" position={Position.Bottom} className="dot" />
      <div className="hop-rail">
        <span className="hop-index">{hop.index + 1}</span>
      </div>
      <div className="hop-body">
        <div className="hop-head">
          <span className="hop-node">{hop.node}</span>
          {(first || last) && <span className="hop-tag">{first ? 'ingress' : 'egress'}</span>}
          {hop.kind === 'host' && <span className="hop-tag host-tag">host</span>}
          {health && <span className="status" style={{ background: STATUS_DOT[health.status] }} title={statusTitle(health)} />}
        </div>
        <div className="hop-port">
          <span className="mono">{hop.port ?? '—'}</span>
          {hop.vlan && <span className="chip">VLAN {hop.vlan}</span>}
        </div>
        {(hop.ipv4 || hop.ipv6 || hop.mac) && (
          <div className="hop-addr mono">
            {[hop.ipv4, hop.ipv6, hop.mac].filter(Boolean).join('  ·  ')}
          </div>
        )}
        {hop.joint && <div className="hop-joint">joint: {hop.joint}</div>}
      </div>
    </div>
  )
}

export const nodeTypes = {
  device: DeviceNodeView,
  siteGroup: SiteGroupView,
  hop: HopNodeView,
}

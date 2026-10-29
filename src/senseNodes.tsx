import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import type { DeviceNode, SiteHealth } from './types'
import { reported, shortSite } from './data'

export type ChassisData = {
  device: DeviceNode
  colour: string
  health: SiteHealth | null
  expanded: boolean
  onToggle: (id: string) => void
  onPort: (resourceId: string) => void
  activePort: string | null
  muted: boolean
  alert: string | null
  labels: boolean
  hopIndex: number | null
}

const DOT: Record<SiteHealth['status'], string> = { ok: '#2e7d32', warning: '#b26a00', unmanaged: '#8a949e' }

const SIDES = ['left', 'right', 'top', 'bottom'] as const
const POS = { left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom } as const

function Handles() {
  return (
    <>
      {SIDES.map((side) => (
        <span key={side}>
          <Handle type="target" id={`t-${side}`} position={POS[side]} className="dot" />
          <Handle type="source" id={`s-${side}`} position={POS[side]} className="dot" />
        </span>
      ))}
    </>
  )
}

function Badge({ health, alert }: { health: SiteHealth | null; alert: string | null }) {
  if (alert) return <span className="chassis-badge alert" title={alert} />
  if (!health) return null
  return (
    <span
      className={`chassis-badge ${health.status}`}
      style={{ background: DOT[health.status] }}
      title={
        health.status === 'unmanaged'
          ? (health.reason ?? 'no SiteRM frontend: state unknown, not healthy')
          : health.status === 'warning'
            ? `${health.warnings.length} SiteRM warning(s)`
            : `SiteRM reporting, ${health.total} check(s) clean`
      }
    />
  )
}

export function ChassisNodeView({ data, selected }: NodeProps) {
  const { device, colour, health, expanded, onToggle, onPort, activePort, muted, alert, labels, hopIndex } = data as unknown as ChassisData
  return (
    <div className={`chassis ${selected ? 'selected' : ''} ${muted ? 'muted' : ''}`} style={{ ['--accent' as string]: colour }}>
      <NodeResizer isVisible={selected} minWidth={170} minHeight={56} lineClassName="resize-line" handleClassName="resize-handle" />
      <Handles />
      <Badge health={health} alert={alert} />
      <div className="chassis-head">
        <button
          className="disclose"
          onClick={(event) => {
            event.stopPropagation()
            onToggle(device.id)
          }}
          title={expanded ? 'collapse port slots' : 'disclose port slots'}
        >
          {expanded ? '−' : '+'}
        </button>
        <span className="chassis-name">{device.label}</span>
        {hopIndex !== null && <span className="hop-pip" title="position in the manifest walk">{hopIndex + 1}</span>}
      </div>
      {labels && <div className="chassis-site">{shortSite(device.site)}</div>}
      {expanded ? (
        <div className="slots">
          {device.ports.map((port) => (
            <button
              key={port.name}
              className={`slot ${activePort === `port:${port.name}` ? 'on' : ''}`}
              onClick={(event) => {
                event.stopPropagation()
                onPort(port.name)
              }}
              title={[port.name, port.vlan ? `VLAN ${port.vlan}` : null, reported(port.ipv4), reported(port.ipv6), reported(port.mac), port.peer ? `isAlias ${port.peer}` : null].filter(Boolean).join('\n')}
            >
              <Handle type="target" id={`pt-l-${port.name}`} position={Position.Left} className="port-anchor left" />
              <Handle type="source" id={`ps-l-${port.name}`} position={Position.Left} className="port-anchor left" />
              <Handle type="target" id={`pt-r-${port.name}`} position={Position.Right} className="port-anchor right" />
              <Handle type="source" id={`ps-r-${port.name}`} position={Position.Right} className="port-anchor right" />
              <span className={`connector ${port.peer ? 'live' : ''}`} />
              <span className="slot-name mono">{port.name}</span>
              {port.vlan && <span className="slot-vlan">{port.vlan}</span>}
            </button>
          ))}
          {!device.ports.length && <div className="slot empty-slot">no ports reported</div>}
        </div>
      ) : (
        <div className="chassis-foot">
          {device.ports.length} port{device.ports.length === 1 ? '' : 's'}
          {device.vlans.length ? ` · VLAN ${device.vlans.join(', ')}` : ''}
        </div>
      )}
    </div>
  )
}

export function CloudNodeView({ data, selected }: NodeProps) {
  const { label, sub, colour, health, muted, count } = data as unknown as {
    label: string
    sub: string
    colour: string
    health: SiteHealth | null
    muted: boolean
    count: number
  }
  return (
    <div className={`cloud ${selected ? 'selected' : ''} ${muted ? 'muted' : ''}`} style={{ ['--accent' as string]: colour }}>
      <NodeResizer isVisible={selected} minWidth={160} minHeight={80} lineClassName="resize-line" handleClassName="resize-handle" />
      <Handles />
      <Badge health={health} alert={null} />
      <svg className="cloud-glyph" viewBox="0 0 64 34" aria-hidden>
        <path d="M14 30c-6 0-10-4-10-9s4-9 9-9c1-6 6-10 12-10 6 0 11 4 12 9 1-1 3-1 4-1 5 0 9 4 9 9s-4 11-10 11z" />
      </svg>
      <div className="cloud-text">
        <span className="cloud-name">{label}</span>
        <span className="cloud-sub">{sub}</span>
      </div>
      {count > 0 && <span className="cloud-count" title="devices this domain reported inside itself">{count}</span>}
    </div>
  )
}

export function RackNodeView({ data, selected }: NodeProps) {
  const { device, colour, health, muted, labels, onPort, activePort, expanded, onToggle } = data as unknown as ChassisData
  return (
    <div className={`rack ${selected ? 'selected' : ''} ${muted ? 'muted' : ''}`} style={{ ['--accent' as string]: colour }}>
      <NodeResizer isVisible={selected} minWidth={150} minHeight={52} lineClassName="resize-line" handleClassName="resize-handle" />
      <Handles />
      <Badge health={health} alert={null} />
      <div className="rack-head">
        <button
          className="disclose"
          onClick={(event) => {
            event.stopPropagation()
            onToggle(device.id)
          }}
        >
          {expanded ? '−' : '+'}
        </button>
        <span className="rack-blades" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="chassis-name">{device.label}</span>
      </div>
      {labels && <div className="chassis-site">{shortSite(device.site)} · DTN</div>}
      {expanded && (
        <div className="slots">
          {device.ports.map((port) => (
            <button
              key={port.name}
              className={`slot ${activePort === `port:${port.name}` ? 'on' : ''}`}
              onClick={(event) => {
                event.stopPropagation()
                onPort(port.name)
              }}
              title={[port.name, port.vlan ? `VLAN ${port.vlan}` : null, reported(port.ipv4), reported(port.ipv6), reported(port.mac)].filter(Boolean).join('\n')}
            >
              <Handle type="target" id={`pt-l-${port.name}`} position={Position.Left} className="port-anchor left" />
              <Handle type="source" id={`ps-l-${port.name}`} position={Position.Left} className="port-anchor left" />
              <Handle type="target" id={`pt-r-${port.name}`} position={Position.Right} className="port-anchor right" />
              <Handle type="source" id={`ps-r-${port.name}`} position={Position.Right} className="port-anchor right" />
              <span className={`connector ${port.peer ? 'live' : ''}`} />
              <span className="slot-name mono">{port.name}</span>
              {port.vlan && <span className="slot-vlan">{port.vlan}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export const senseNodeTypes = {
  chassis: ChassisNodeView,
  cloud: CloudNodeView,
  rack: RackNodeView,
}

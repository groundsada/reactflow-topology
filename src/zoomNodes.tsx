import type { EdgeProps, NodeProps } from '@xyflow/react'
import { BaseEdge, EdgeLabelRenderer, Handle, Position, getBezierPath } from '@xyflow/react'
import type { SiteHealth } from './types'

// An edge needs somewhere to land. Without handles React Flow silently
// draws nothing, which is what made the domain level look unconnected.
const SIDES = [Position.Left, Position.Right, Position.Top, Position.Bottom]

function Anchors() {
  return (
    <>
      {SIDES.map((side) => (
        <span key={side}>
          <Handle type="target" id={`t-${side}`} position={side} className="dot" />
          <Handle type="source" id={`s-${side}`} position={side} className="dot" />
        </span>
      ))}
    </>
  )
}

const DOT: Record<SiteHealth['status'], string> = { ok: '#2e7d32', warning: '#b26a00', unmanaged: '#8a949e' }

export function ZoomDomainView({ data }: NodeProps) {
  const { label, colour, devices, health } = data as any
  return (
    <div className="zoom-domain" style={{ ['--accent' as string]: colour }}>
      <Anchors />
      {health && <span className="status" style={{ background: DOT[health.status as SiteHealth['status']] }} />}
      <span className="zoom-domain-name">{label}</span>
      <span className="zoom-domain-sub">{devices} device{devices === 1 ? '' : 's'}</span>
    </div>
  )
}

export function ZoomDeviceView({ data }: NodeProps) {
  const { label, site, colour, endpoint, ports } = data as any
  const rows = Array.isArray(ports) && typeof ports[0] === 'object'
  return (
    <div className="zoom-device" style={{ ['--accent' as string]: colour }}>
      <Anchors />
      <div className="zoom-device-head">
        <span>{label}</span>
        {endpoint && <span className="hop-tag">endpoint</span>}
      </div>
      <span className="zoom-device-site">{site}</span>
      {rows &&
        (ports as any[]).map((port) => (
          <div key={port.name} className="zoom-port-row mono">
            <span>{port.name}</span>
            <span>{port.vlan ?? ''}</span>
          </div>
        ))}
      {!rows && <span className="zoom-device-site">{ports} port{ports === 1 ? '' : 's'}</span>}
    </div>
  )
}

export function ZoomLinkView(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props
  const data = props.data as any
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        style={{
          stroke: data?.transit ? '#9aa4b0' : '#7f97ab',
          strokeWidth: (data?.count ?? 1) > 1 ? 3.4 : 1.8,
          strokeDasharray: data?.transit ? '2 6' : undefined,
        }}
      />
      {(data?.count ?? 1) > 1 && (
        <EdgeLabelRenderer>
          <div className="edge-label" style={{ transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)` }}>
            <span className="zoom-edge-count">{data.count} links</span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const zoomNodeTypes = { zoomDomain: ZoomDomainView, zoomDevice: ZoomDeviceView }
export const zoomEdgeTypes = { zoomLink: ZoomLinkView }

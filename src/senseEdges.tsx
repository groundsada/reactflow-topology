import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, getBezierPath, getStraightPath, useInternalNode, type EdgeProps } from '@xyflow/react'
import type { Session } from './types'

export type SensePathData = {
  vlans: string[]
  ports: string[]
  sessions: Session[]
  scope: 'internal' | 'interdomain' | 'transit'
  shape: 'step' | 'bezier' | 'straight'
  bandwidth: string | null
  qos: string | null
  labels: boolean
  muted: boolean
  hovered: boolean
  active: boolean
  fromPort: string | null
  toPort: string | null
  sourceName: string
  targetName: string
}

export function SensePathEdgeView(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected } = props
  const data = props.data as unknown as SensePathData
  const hover = !!data?.hovered
  const geom = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }
  const [path, labelX, labelY] =
    data?.shape === 'bezier' ? getBezierPath(geom) : data?.shape === 'straight' ? getStraightPath({ sourceX, sourceY, targetX, targetY }) : getSmoothStepPath({ ...geom, borderRadius: 12 })

  const transit = data?.scope === 'transit'
  const colour = transit ? '#9aa4b0' : data?.scope === 'internal' ? '#6b8299' : '#2b5d87'
  const sessions = data?.sessions ?? []
  const weight = Math.min(2 + sessions.length * 0.6, 6)

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: colour,
          strokeWidth: selected || hover || data?.active ? weight + 1.4 : weight,
          strokeDasharray: transit ? '2 8' : undefined,
          opacity: data?.muted ? 0.12 : 1,
        }}
        interactionWidth={22}
      />
      {(data?.labels || hover) && (
        <EdgeLabelRenderer>
          <div className={`edge-label ${data?.muted ? 'dim' : ''}`} style={{ transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)` }}>
            {hover ? (
              <div className="tip">
                <div className="tip-head">
                  {data.sourceName}
                  {data.fromPort && <span className="tip-port">{data.fromPort}</span>}
                  <span className="tip-arrow">↔</span>
                  {data.targetName}
                  {data.toPort && <span className="tip-port">{data.toPort}</span>}
                </div>
                {transit ? (
                  <div className="tip-note">the domain reported no port pair between these two. Continuity across it is asserted by the walk, not observed.</div>
                ) : (
                  <>
                    <Row label="VLAN" value={data.vlans?.length ? data.vlans.join(', ') : 'untagged / not reported'} />
                    <Row label="bandwidth" value={data.bandwidth ?? 'not reported'} />
                    <Row label="QoS" value={data.qos ?? 'not reported'} />
                    <Row label="MTU" value="not reported by the manifest" missing />
                    <Row label="delay" value="not reported by the manifest" missing />
                    {sessions.length > 1 && <Row label="sessions" value={`${sessions.length} parallel (${sessions.map((session) => session.vlans.join('/') || '?').join(', ')})`} />}
                  </>
                )}
              </div>
            ) : (
              <span className={`chip ${transit ? 'transit' : ''}`}>{transit ? 'transit' : data.vlans?.length ? `VLAN ${data.vlans.join(',')}` : 'link'}</span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

function Row({ label, value, mono, missing }: { label: string; value: string; mono?: boolean; missing?: boolean }) {
  return (
    <div className="tip-row">
      <span className="tip-key">{label}</span>
      <span className={`${mono ? 'mono' : ''} ${missing ? 'tip-missing' : ''}`}>{value}</span>
    </div>
  )
}

export function SenseFloatingEdgeView(props: EdgeProps) {
  const source = useInternalNode(props.source)
  const target = useInternalNode(props.target)
  if (!source || !target) return null
  const ca = centre(source)
  const cb = centre(target)
  const pa = border(source, cb)
  const pb = border(target, ca)
  return <SensePathEdgeView {...props} sourceX={pa.x} sourceY={pa.y} targetX={pb.x} targetY={pb.y} />
}

type Internal = NonNullable<ReturnType<typeof useInternalNode>>

function centre(node: Internal) {
  const w = node.measured?.width ?? 220
  const h = node.measured?.height ?? 90
  return { x: (node.internals?.positionAbsolute?.x ?? node.position.x) + w / 2, y: (node.internals?.positionAbsolute?.y ?? node.position.y) + h / 2, w, h }
}

function border(node: Internal, toward: { x: number; y: number }) {
  const c = centre(node)
  const dx = toward.x - c.x
  const dy = toward.y - c.y
  if (dx === 0 && dy === 0) return { x: c.x, y: c.y }
  const scale = Math.min(dx === 0 ? Infinity : c.w / 2 / Math.abs(dx), dy === 0 ? Infinity : c.h / 2 / Math.abs(dy))
  return { x: c.x + dx * scale, y: c.y + dy * scale }
}

export const senseEdgeTypes = {
  sense: SensePathEdgeView,
  senseFloating: SenseFloatingEdgeView,
}

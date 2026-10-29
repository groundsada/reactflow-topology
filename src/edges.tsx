import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useInternalNode,
  type EdgeProps,
} from '@xyflow/react'
import type { Session } from './types'

export type LinkData = {
  vlans: string[]
  ports: string[]
  sessions: Session[]
  scope: 'internal' | 'interdomain' | 'transit'
  colour: string
  shape: 'bezier' | 'step' | 'straight'
  dim?: boolean
  fan?: boolean
}

export function LinkEdgeView(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected } = props
  const data = props.data as unknown as LinkData
  const sessions = data?.sessions ?? []
  const multi = sessions.length > 1

  const geom = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }
  const [path, labelX, labelY] =
    data?.shape === 'step'
      ? getSmoothStepPath({ ...geom, borderRadius: 10 })
      : data?.shape === 'straight'
        ? getStraightPath({ sourceX, sourceY, targetX, targetY })
        : getBezierPath(geom)

  const width = data?.scope === 'interdomain' ? 2.4 : 1.6
  const weight = multi ? Math.min(width + sessions.length * 0.5, 6) : width

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: data?.colour ?? '#8a949e',
          strokeWidth: selected ? weight + 1.4 : weight,
          strokeDasharray: data?.scope === 'transit' ? '2 7' : data?.scope === 'internal' ? '6 5' : undefined,
          opacity: data?.dim ? 0.18 : 1,
        }}
      />
      {multi && data?.fan && (
        <path d={path} fill="none" stroke={data.colour} strokeWidth={1} opacity={data.dim ? 0.1 : 0.45} transform="translate(0,6)" />
      )}
      <EdgeLabelRenderer>
        <div
          className={`edge-label ${data?.scope ?? ''} ${data?.dim ? 'dim' : ''}`}
          style={{ transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)` }}
        >
          {multi ? (
            <div className="session-stack">
              <span className="session-count">{sessions.length} sessions</span>
              {sessions.slice(0, 6).map((session, idx) => (
                <span key={session.id} className="chip" title={session.ports.join(' ↔ ')}>
                  {session.vlans.join(',') || `#${idx + 1}`}
                </span>
              ))}
              {sessions.length > 6 && <span className="chip">+{sessions.length - 6}</span>}
            </div>
          ) : (
            <span className={`chip ${data?.scope === 'transit' ? 'transit' : ''}`} title={data?.scope === 'transit' ? 'the domain reported no ports between these routers; the path crosses anyway' : data?.ports?.join(' ↔ ')}>
              {data?.scope === 'transit' ? 'transit' : data?.vlans?.length ? `VLAN ${data.vlans.join(',')}` : 'link'}
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

export function FloatingLinkEdgeView(props: EdgeProps) {
  const source = useInternalNode(props.source)
  const target = useInternalNode(props.target)
  if (!source || !target) return null
  const [sx, sy, tx, ty] = facing(source, target)
  return <LinkEdgeView {...props} sourceX={sx} sourceY={sy} targetX={tx} targetY={ty} />
}

type Internal = NonNullable<ReturnType<typeof useInternalNode>>

function facing(a: Internal, b: Internal): [number, number, number, number] {
  const ca = centre(a)
  const cb = centre(b)
  const pa = border(a, cb)
  const pb = border(b, ca)
  return [pa.x, pa.y, pb.x, pb.y]
}

function centre(node: Internal) {
  const w = node.measured?.width ?? 180
  const h = node.measured?.height ?? 70
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

export function HopEdgeView(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props
  const data = props.data as unknown as { label?: string; colour?: string; crossing?: boolean }
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8 })
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: data?.colour ?? '#8a949e',
          strokeWidth: data?.crossing ? 2.6 : 1.5,
          strokeDasharray: data?.crossing ? undefined : '5 4',
        }}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div className="edge-label" style={{ transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)` }}>
            <span className="chip">{data.label}</span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const edgeTypes = {
  link: LinkEdgeView,
  floating: FloatingLinkEdgeView,
  hop: HopEdgeView,
}

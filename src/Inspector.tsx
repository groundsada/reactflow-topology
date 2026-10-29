import { adjacency, healthFor, nodeIndex, shortSite } from './data'
import type { Path } from './types'

export function Inspector({ path, selected, onSelect }: { path: Path; selected: string | null; onSelect: (id: string | null) => void }) {
  const nodes = nodeIndex(path)
  const device = selected?.startsWith('hop-') ? null : selected ? nodes.get(selected) : null
  const hop = selected?.startsWith('hop-') ? path.hops[Number(selected.slice(4))] : null

  return (
    <aside className="inspector">
      {device && (
        <>
          <div className="insp-head">
            <h2>{device.label}</h2>
            <button className="close" onClick={() => onSelect(null)}>
              ×
            </button>
          </div>
          <p className="sub">
            {shortSite(device.site)} · {device.kind} · {device.degree} neighbour{device.degree === 1 ? '' : 's'}
            {device.endpoint && ' · endpoint'}
          </p>
          <Section title={`Ports on this path (${device.ports.length})`}>
            {device.ports.map((port) => (
              <div className="row" key={`${port.name}-${port.vlan}`}>
                <span className="mono strong">{port.name}</span>
                {port.vlan && <span className="chip">VLAN {port.vlan}</span>}
                {port.ipv4 && <div className="mono dim-text">{port.ipv4}</div>}
                {port.ipv6 && <div className="mono dim-text">{port.ipv6}</div>}
                {port.mac && <div className="mono dim-text">{port.mac}</div>}
                {port.peer && <div className="mono dim-text wrap">↔ {port.peer}</div>}
              </div>
            ))}
          </Section>
          <Section title="Links">
            {(adjacency(path).get(device.id) ?? []).map((edge) => {
              const otherId = edge.source === device.id ? edge.target : edge.source
              const other = nodes.get(otherId)
              return (
                <div className="row" key={edge.id}>
                  <button className="linkish" onClick={() => onSelect(otherId)}>
                    {other?.label ?? otherId}
                  </button>
                  <span className="chip">{edge.scope}</span>
                  {edge.sessions.length > 1 && <span className="chip">{edge.sessions.length} sessions</span>}
                  <div className="mono dim-text">{edge.vlans.length ? `VLAN ${edge.vlans.join(', ')}` : 'no VLAN'}</div>
                  <div className="mono dim-text wrap">{edge.ports.join(' ↔ ')}</div>
                </div>
              )
            })}
          </Section>
          <HealthBlock path={path} site={device.site} />
        </>
      )}

      {hop && (
        <>
          <div className="insp-head">
            <h2>Hop {hop.index + 1}</h2>
            <button className="close" onClick={() => onSelect(null)}>
              ×
            </button>
          </div>
          <p className="sub">
            {hop.node} · {shortSite(hop.site)} · {hop.kind}
          </p>
          <Section title="Port">
            <div className="row">
              <span className="mono strong">{hop.port ?? '—'}</span>
              {hop.vlan && <span className="chip">VLAN {hop.vlan}</span>}
              <div className="mono dim-text wrap">{hop.urn}</div>
            </div>
          </Section>
          {(hop.ipv4 || hop.ipv6 || hop.mac) && (
            <Section title="Addressing">
              <div className="row mono">
                {hop.ipv4 && <div>{hop.ipv4}</div>}
                {hop.ipv6 && <div>{hop.ipv6}</div>}
                {hop.mac && <div>{hop.mac}</div>}
              </div>
            </Section>
          )}
          {hop.peer && (
            <Section title="Peer port">
              <div className="row mono wrap">{hop.peer}</div>
            </Section>
          )}
          <HealthBlock path={path} site={hop.site} />
        </>
      )}

      {!device && !hop && <PathSummary path={path} />}
    </aside>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="insp-section">
      <h3>{title}</h3>
      {children}
    </div>
  )
}

function HealthBlock({ path, site }: { path: Path; site: string }) {
  const health = healthFor(path, site)
  if (!health) return null
  return (
    <Section title={`SiteRM — ${shortSite(site)}`}>
      <div className="row">
        <span className={`chip ${health.status}`}>{health.status}</span>
        <span className="chip">{health.total} checks</span>
        {health.reason && <div className="dim-text">{health.reason}</div>}
      </div>
      {health.warnings.map((warn, idx) => (
        <div className="row warn-row" key={idx}>
          <span className="mono strong">
            {warn.service} · {warn.state}
          </span>
          <div className="dim-text wrap pre">{warn.detail}</div>
        </div>
      ))}
    </Section>
  )
}

function PathSummary({ path }: { path: Path }) {
  const ends = path.nodes.filter((node) => node.endpoint)
  return (
    <>
      <div className="insp-head">
        <h2>{path.name}</h2>
      </div>
      <p className="sub mono">{path.uuid}</p>
      <Section title="Reservation">
        <div className="row">
          <div>
            orchestrator <span className="mono">{path.orchestrator}</span>
          </div>
          <div>
            state <span className="chip">{path.state}</span>
          </div>
          {path.senseState && (
            <div>
              sense-o state <span className="chip">{path.senseState}</span>
            </div>
          )}
          {path.owner && (
            <div>
              owner <span className="mono">{path.owner}</span>
            </div>
          )}
          {path.timestamp && (
            <div>
              created <span className="mono">{path.timestamp}</span>
            </div>
          )}
        </div>
      </Section>
      {path.intent.type && (
        <Section title="Intent (asked for)">
          <div className="row">
            <span className="chip intent">{path.intent.type}</span>
          </div>
          {path.intent.connections.map((conn, idx) => (
            <div className="row" key={idx}>
              <span className="strong">{conn.name ?? `connection ${idx + 1}`}</span>
              {conn.bandwidth && <span className="chip">{conn.bandwidth} Gbps {conn.qos}</span>}
              {conn.schedule && <span className="chip">ends {conn.schedule}</span>}
              {conn.terminals.map((term) => (
                <div className="mono dim-text wrap" key={term.uri}>
                  {shortSite(term.uri ?? '')} · vlan {term.vlan ?? 'any'}
                  {term.ipv6 ? ` · ${term.ipv6}` : ''}
                  {term.ipv4 ? ` · ${term.ipv4}` : ''}
                </div>
              ))}
            </div>
          ))}
        </Section>
      )}
      <Section title={`Delivered (${path.nodes.length} devices, ${path.hops.length} hops)`}>
        <div className="row">
          <div>
            {ends.length} endpoint{ends.length === 1 ? '' : 's'}:
          </div>
          {ends.map((node) => (
            <div className="mono dim-text" key={node.id}>
              {node.label} — {shortSite(node.site)}
            </div>
          ))}
        </div>
      </Section>
      <p className="hint">Click any device or rung for its ports and addressing.</p>
    </>
  )
}

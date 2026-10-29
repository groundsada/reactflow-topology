import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Background, BackgroundVariant, Controls, Panel, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow, type Edge, type Node, type NodeChange } from '@xyflow/react'
import { healthFor, shortSite, siteColours, siteOrder } from './data'
import { matches, resources, validate, type Finding, type Resource } from './nml'
import { senseEdgeTypes } from './senseEdges'
import { senseLayout, MODE_LABEL, type Mode } from './senseLayout'
import { senseNodeTypes } from './senseNodes'
import { Splitter } from './Splitter'
import type { DeviceNode, Path } from './types'

type Layer = 'physical' | 'logical'
type SideMode = 'browser' | 'validate' | 'search'

const CHASSIS_W = 232
const RACK_W = 208
const CLOUD_W = 216
const CLOUD_H = 100

function portPair(edge: Path['edges'][number], source: DeviceNode, target: DeviceNode): [string | null, string | null] {
  const onSource = edge.ports.filter((name) => source.ports.some((port) => port.name === name))
  const onTarget = edge.ports.filter((name) => target.ports.some((port) => port.name === name))
  const from = onSource.find((name) => !onTarget.includes(name)) ?? onSource[0] ?? null
  const to = onTarget.find((name) => name !== from) ?? (from && onTarget.includes(from) ? from : (onTarget[0] ?? null))
  return [from, to]
}

export function SenseViewer({ path, onRefresh, refreshedAt }: { path: Path; onRefresh: () => void; refreshedAt: string }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<Mode>('hierarchical')
  const [layer, setLayer] = useState<Layer>('physical')
  const [labels, setLabels] = useState(true)
  const [search, setSearch] = useState('')
  const [side, setSide] = useState<SideMode>('browser')
  const [picked, setPicked] = useState<string | null>(null)
  const [nmlWidth, setNmlWidth] = useState(330)

  const list = useMemo(() => resources(path), [path])
  const findings = useMemo(() => validate(path), [path])
  const current = useMemo(() => list.find((resource) => resource.id === picked) ?? list[0] ?? null, [list, picked])

  const step = useCallback(
    (delta: number) => {
      if (!list.length) return
      const at = Math.max(list.findIndex((resource) => resource.id === (picked ?? list[0].id)), 0)
      const next = (at + delta + list.length) % list.length
      setPicked(list[next].id)
      setSide('browser')
    },
    [list, picked],
  )

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  return (
    <div className="sense" style={{ gridTemplateColumns: `${nmlWidth}px 6px minmax(0, 1fr)` }}>
      <aside className="nml">
        <div className="nml-phase">
          <span className="nml-phase-key">phase</span>
          <strong>{(path.senseState ?? path.state ?? 'unknown').toUpperCase()}</strong>
          <span className="nml-phase-sub">{path.intent.type ?? 'intent type not declared'}</span>
        </div>

        {side === 'browser' && current && (
          <>
            <div className="nml-urn">
              <span className="nml-type">{current.type}</span>
              <code className="mono wrap">{current.urn}</code>
            </div>
            <div className="nml-page">
              <button onClick={() => step(-1)}>‹ PREVIOUS</button>
              <span className="nml-count">
                {Math.max(list.findIndex((resource) => resource.id === current.id), 0) + 1} / {list.length}
              </span>
              <button onClick={() => step(1)}>NEXT ›</button>
            </div>
            <div className="nml-cards">
              {current.attributes.map((attribute, idx) => (
                <div key={`${attribute.key}-${idx}`} className="nml-card">
                  <div className="nml-card-head">
                    <span className="nml-key">{attribute.key}</span>
                    <span className={`nml-from ${attribute.from}`}>{attribute.from}</span>
                    {attribute.pivot && (
                      <button className="nml-pivot" title="pivot the graph to this resource" onClick={() => setPicked(attribute.pivot!)}>
                        →
                      </button>
                    )}
                  </div>
                  <code className="mono wrap">{attribute.value}</code>
                  {attribute.external && <div className="nml-note">remote domain; not reported to us, so not navigable</div>}
                </div>
              ))}
            </div>
          </>
        )}

        {side === 'validate' && <Validation findings={findings} />}

        {side === 'search' && (
          <div className="nml-cards">
            <input className="search" autoFocus placeholder="urn, host, VLAN, IP, port…" value={search} onChange={(event) => setSearch(event.target.value)} />
            <p className="sub">{search ? `${list.filter((resource) => matches(resource, search)).length} of ${list.length} resources match` : `${list.length} resources on this path`}</p>
            {list
              .filter((resource) => matches(resource, search))
              .slice(0, 80)
              .map((resource) => (
                <button
                  key={resource.id}
                  className={`nml-hit ${resource.id === current?.id ? 'on' : ''}`}
                  onClick={() => {
                    setPicked(resource.id)
                    setSide('browser')
                  }}
                >
                  <span className="nml-type">{resource.type}</span>
                  <span className="wrap">{resource.short}</span>
                </button>
              ))}
          </div>
        )}

        <div className="nml-modes">
          <button className={side === 'browser' ? 'on' : ''} onClick={() => setSide('browser')}>
            Browser
          </button>
          <button className={side === 'validate' ? 'on' : ''} onClick={() => setSide('validate')}>
            Validation
            {findings.some((finding) => finding.level === 'error') && <span className="pip bad" />}
            {!findings.some((finding) => finding.level === 'error') && findings.some((finding) => finding.level === 'warning') && <span className="pip warn" />}
          </button>
          <button className={side === 'search' ? 'on' : ''} onClick={() => setSide('search')}>
            Search
          </button>
        </div>
      </aside>

      <Splitter width={nmlWidth} onChange={setNmlWidth} min={240} max={620} />

      <div className="sense-canvas">
        <ReactFlowProvider key={`${path.id}-${layer}`}>
          <Flow
            path={path}
            layer={layer}
            setLayer={setLayer}
            mode={mode}
            setMode={setMode}
            labels={labels}
            setLabels={setLabels}
            search={search}
            setSearch={setSearch}
            expanded={expanded}
            toggle={toggle}
            current={current}
            onPick={setPicked}
            onRefresh={onRefresh}
            refreshedAt={refreshedAt}
          />
        </ReactFlowProvider>
      </div>
    </div>
  )
}

function Validation({ findings }: { findings: Finding[] }) {
  const order: Finding['level'][] = ['error', 'warning', 'info', 'unavailable']
  return (
    <div className="nml-cards">
      {order.map((level) => {
        const group = findings.filter((finding) => finding.level === level)
        if (!group.length) return null
        return (
          <div key={level} className="nml-group">
            <h4 className={level}>
              {level === 'unavailable' ? 'could not be checked' : level} <span>{group.length}</span>
            </h4>
            {group.map((finding, idx) => (
              <div key={idx} className={`finding ${level}`}>
                <span className="finding-rule">{finding.rule}</span>
                <span className="finding-detail">{finding.detail}</span>
              </div>
            ))}
          </div>
        )
      })}
      {!findings.length && <p className="sub">nothing to report</p>}
    </div>
  )
}

type FlowProps = {
  path: Path
  layer: Layer
  setLayer: (layer: Layer) => void
  mode: Mode
  setMode: (mode: Mode) => void
  labels: boolean
  setLabels: (on: boolean) => void
  search: string
  setSearch: (value: string) => void
  expanded: Set<string>
  toggle: (id: string) => void
  current: Resource | null
  onPick: (id: string | null) => void
  onRefresh: () => void
  refreshedAt: string
}

function Flow(props: FlowProps) {
  const { path, layer, mode, labels, search, expanded, toggle, current, onPick } = props
  const flow = useReactFlow()
  const [hovered, setHovered] = useState<string | null>(null)
  const colours = useMemo(() => siteColours(path), [path])

  const hopIndex = useMemo(() => {
    const out = new Map<string, number>()
    path.hops.forEach((hop) => {
      if (!out.has(hop.node)) out.set(hop.node, hop.index)
    })
    return out
  }, [path])

  const capacity = useMemo(() => {
    const only = path.intent.connections.length === 1 ? path.intent.connections[0] : null
    return { bandwidth: only?.bandwidth ? `${only.bandwidth} Mb/s` : null, qos: only?.qos ?? null }
  }, [path])

  const activePortName = current?.type === 'BidirectionalPort' ? (current.short.split(' · ')[1] ?? null) : null

  const graph = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const hit = (hay: string) => !needle || hay.toLowerCase().includes(needle)

    if (layer === 'logical') {
      const sites = siteOrder(path)
      const devicesPer = new Map<string, number>()
      for (const node of path.nodes) devicesPer.set(node.site, (devicesPer.get(node.site) ?? 0) + 1)
      const siteOf = new Map(path.nodes.map((node) => [node.id, node.site]))
      const pairs = new Map<string, { a: string; b: string; vlans: Set<string>; ports: Set<string> }>()
      for (const edge of path.edges) {
        const sa = siteOf.get(edge.source)!
        const sb = siteOf.get(edge.target)!
        if (sa === sb) continue
        const key = [sa, sb].sort().join('||')
        if (!pairs.has(key)) pairs.set(key, { a: sa, b: sb, vlans: new Set(), ports: new Set() })
        const bundle = pairs.get(key)!
        for (const vlan of edge.vlans) bundle.vlans.add(vlan)
        for (const port of edge.ports) bundle.ports.add(port)
      }
      const sized = sites.map((site) => ({ id: site, w: CLOUD_W, h: CLOUD_H }))
      const placed = senseLayout(
        sized,
        [...pairs.values()].map((bundle) => ({ source: bundle.a, target: bundle.b })),
        mode,
      )
      const cloudNodes: Node[] = sites.map((site) => ({
        id: site,
        type: 'cloud',
        position: placed.get(site) ?? { x: 0, y: 0 },
        style: { width: CLOUD_W, height: CLOUD_H },
        data: {
          label: shortSite(site),
          sub: `${devicesPer.get(site) ?? 0} device${(devicesPer.get(site) ?? 0) === 1 ? '' : 's'} reported`,
          colour: colours.get(site) ?? '#2b5d87',
          health: healthFor(path, site),
          muted: !hit(site),
          count: devicesPer.get(site) ?? 0,
        },
      }))
      const cloudEdges: Edge[] = [...pairs.entries()].map(([key, bundle]) => ({
        id: key,
        source: bundle.a,
        target: bundle.b,
        type: 'senseFloating',
        data: {
          vlans: [...bundle.vlans],
          ports: [...bundle.ports],
          sessions: [],
          scope: 'interdomain',
          shape: mode === 'orthogonal' ? 'step' : 'bezier',
          bandwidth: capacity.bandwidth,
          qos: capacity.qos,
          labels,
          muted: false,
          hovered: hovered === key,
          sourceName: shortSite(bundle.a),
          targetName: shortSite(bundle.b),
        },
      }))
      return { nodes: cloudNodes, edges: cloudEdges }
    }

    const sized = path.nodes.map((node) => {
      const open = expanded.has(node.id)
      const rows = open ? Math.max(node.ports.length, 1) : 0
      const base = node.kind === 'host' ? 70 : 84
      return { id: node.id, w: node.kind === 'host' ? RACK_W : CHASSIS_W, h: base + rows * 24 + (open ? 8 : 0) }
    })
    const placed = senseLayout(sized, path.edges, mode)
    const box = new Map(sized.map((item) => [item.id, item]))

    const deviceNodes: Node[] = path.nodes.map((node) => {
      const health = healthFor(path, node.site)
      const hay = [node.id, node.label, node.site, ...node.vlans, ...node.ips, ...node.macs, ...node.ports.map((port) => port.name)].join(' ')
      return {
        id: node.id,
        type: node.kind === 'host' ? 'rack' : 'chassis',
        position: placed.get(node.id) ?? { x: 0, y: 0 },
        style: { width: box.get(node.id)?.w, height: box.get(node.id)?.h },
        data: {
          device: node,
          colour: colours.get(node.site) ?? '#2b5d87',
          health,
          expanded: expanded.has(node.id),
          onToggle: toggle,
          onPort: (port: string) => {
            const resource = resources(path).find((candidate) => candidate.device === node.id && candidate.type === 'BidirectionalPort' && candidate.urn.includes(`:${port}`))
            if (resource) onPick(resource.id)
          },
          activePort: current?.device === node.id && activePortName ? `port:${activePortName}` : null,
          muted: !hit(hay),
          alert: health?.status === 'warning' ? `${health.warnings.length} SiteRM warning(s) at ${shortSite(node.site)}` : null,
          labels,
          hopIndex: hopIndex.get(node.id) ?? null,
        },
      }
    })

    const nameOf = new Map(path.nodes.map((node) => [node.id, node.label]))
    const nodeOf = new Map(path.nodes.map((node) => [node.id, node]))
    const pathEdges: Edge[] = path.edges.map((edge) => {
      const source = nodeOf.get(edge.source)!
      const target = nodeOf.get(edge.target)!
      const [fromPort, toPort] = portPair(edge, source, target)

      const sx = placed.get(edge.source)?.x ?? 0
      const tx = placed.get(edge.target)?.x ?? 0
      const fromSide = sx <= tx ? 'r' : 'l'
      const toSide = sx <= tx ? 'l' : 'r'

      const fromOpen = expanded.has(edge.source) && !!fromPort
      const toOpen = expanded.has(edge.target) && !!toPort
      const anchored = fromOpen || toOpen
      const touchesActive = !!activePortName && (fromPort === activePortName || toPort === activePortName)

      return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: anchored ? 'sense' : 'senseFloating',
      sourceHandle: anchored ? (fromOpen ? `ps-${fromSide}-${fromPort}` : `s-${fromSide === 'r' ? 'right' : 'left'}`) : undefined,
      targetHandle: anchored ? (toOpen ? `pt-${toSide}-${toPort}` : `t-${toSide === 'l' ? 'left' : 'right'}`) : undefined,
      data: {
        fromPort,
        toPort,
        active: touchesActive,
        vlans: edge.vlans,
        ports: edge.ports,
        sessions: edge.sessions,
        scope: edge.scope,
        shape: mode === 'orthogonal' ? 'step' : mode === 'force' ? 'straight' : 'bezier',
        bandwidth: capacity.bandwidth,
        qos: capacity.qos,
        labels,
        hovered: hovered === edge.id,
        muted: needle !== '' && !hit([edge.ports.join(' '), edge.vlans.join(' '), nameOf.get(edge.source) ?? '', nameOf.get(edge.target) ?? ''].join(' ')),
        sourceName: nameOf.get(edge.source) ?? edge.source,
        targetName: nameOf.get(edge.target) ?? edge.target,
      },
      }
    })
    return { nodes: deviceNodes, edges: pathEdges }
  }, [path, layer, mode, labels, search, expanded, toggle, colours, capacity, current, activePortName, hopIndex, onPick, hovered])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges] = useEdgesState<Edge>([])
  const moved = useRef(new Map<string, { x: number; y: number }>())
  const resized = useRef(new Map<string, { width: number; height: number }>())

  const selectedId = layer === 'logical' ? current?.site : current?.device

  useEffect(() => {
    moved.current.clear()
    resized.current.clear()
  }, [mode, layer, path.id])

  useEffect(() => {
    setNodes(
      graph.nodes.map((node) => ({
        ...node,
        position: moved.current.get(node.id) ?? node.position,
        style: { ...node.style, ...(resized.current.get(node.id) ?? {}) },
        selected: node.id === selectedId,
      })),
    )
    setEdges(graph.edges)
  }, [graph, selectedId, setNodes, setEdges])

  useEffect(() => {
    if (!nodes.length) return
    const timer = setTimeout(() => flow.fitView({ duration: 400, padding: 0.2 }), 60)
    return () => clearTimeout(timer)
  }, [mode, layer, path.id])

  useEffect(() => {
    const el = document.querySelector('.sense-canvas')
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = el.getBoundingClientRect().width
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width
      if (Math.abs(width - last) < 4) return
      last = width
      clearTimeout(timer)
      timer = setTimeout(() => flow.fitView({ duration: 250, padding: 0.2 }), 180)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [flow])

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node>[]) => {
      for (const change of changes) {
        if (change.type === 'position' && change.position && !change.dragging) moved.current.set(change.id, change.position)
        if (change.type === 'dimensions' && change.resizing && change.dimensions) resized.current.set(change.id, change.dimensions)
      }
      onNodesChange(changes)
    },
    [onNodesChange],
  )

  const focus = useCallback(() => {
    if (selectedId && nodes.some((node) => node.id === selectedId)) flow.fitView({ nodes: [{ id: selectedId }], duration: 350, padding: 1.1 })
    else flow.fitView({ duration: 350, padding: 0.2 })
  }, [flow, selectedId, nodes])

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(path, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${path.id}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }, [path])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={handleNodesChange}
      nodeTypes={senseNodeTypes}
      edgeTypes={senseEdgeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={2.4}
      nodesConnectable={false}
      onNodeClick={(_, node) => {
        if (layer === 'logical') {
          const resource = resources(path).find((candidate) => candidate.type === 'Topology' && candidate.site === node.id)
          onPick(resource?.id ?? null)
          return
        }
        const resource = resources(path).find((candidate) => candidate.type === 'Node' && candidate.device === node.id)
        onPick(resource?.id ?? null)
      }}
      onPaneClick={() => onPick(null)}
      onEdgeMouseEnter={(_, edge) => setHovered(edge.id)}
      onEdgeMouseLeave={() => setHovered(null)}
    >
      <Background variant={BackgroundVariant.Lines} gap={28} size={1} color="#dde3e9" />
      <Controls showInteractive={false} position="bottom-left" />
      <Panel position="top-right" className="sense-top">
        <input className="search topo-search" placeholder="Search topology…" value={search} onChange={(event) => props.setSearch(event.target.value)} />
        {search && <span className="sub">{nodes.filter((node) => !(node.data as { muted?: boolean }).muted).length} match</span>}
      </Panel>

      <Panel position="top-right" className="sense-tools">
        <button title={`auto-layout engine: ${MODE_LABEL[mode]} — click to cycle hierarchical / orthogonal / radial`} onClick={() => props.setMode(mode === 'hierarchical' ? 'orthogonal' : mode === 'orthogonal' ? 'force' : 'hierarchical')}>
          auto
        </button>
        <button title={selectedId ? 'centre on the selected resource' : 'fit the whole path'} onClick={focus}>
          fit
        </button>
        <button className={labels ? 'on' : ''} title="persistent on-canvas link labels" onClick={() => props.setLabels(!labels)}>
          lbl
        </button>
        <button title={`re-read the exported state${props.refreshedAt ? ` (last read ${props.refreshedAt})` : ''}`} onClick={props.onRefresh}>
          sync
        </button>
        <button className={layer === 'logical' ? 'on' : ''} title={layer === 'physical' ? 'step up to the logical L2 overlay: domains, not devices' : 'step back down to physical devices'} onClick={() => props.setLayer(layer === 'physical' ? 'logical' : 'physical')}>
          {layer === 'physical' ? 'L2 ↑' : 'L1 ↓'}
        </button>
        <button title="export this path as JSON" onClick={exportJson}>
          exp
        </button>
        <button title="reset zoom to 100% and pan to origin" onClick={() => flow.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 250 })}>
          rst
        </button>
      </Panel>

      <Panel position="bottom-center" className="sense-legend">
        <span>
          <i className="sw interdomain" /> interdomain
        </span>
        <span>
          <i className="sw internal" /> internal
        </span>
        <span>
          <i className="sw transit" /> transit (asserted)
        </span>
        <span className="sub">
          {MODE_LABEL[mode]} · {layer} layer · hover a path to inspect it
        </span>
      </Panel>
    </ReactFlow>
  )
}

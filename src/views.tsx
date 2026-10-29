import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, useNodesState, useReactFlow, type Edge, type Node, type NodeChange } from '@xyflow/react'
import { edgeTypes } from './edges'
import { groupedLayout, layeredLayout, metroLayout, orientation, radialLayout } from './layouts'
import { nodeTypes } from './nodes'
import { healthFor, hopsByDevice, shortSite, siteColours, siteOrder, vlanColours } from './data'
import type { Path, ViewId } from './types'

export type ViewProps = {
  path: Path
  focus: string | null
  onSelect: (id: string | null) => void
  selected: string | null
}

const FLOW = {
  fitView: true,
  fitViewOptions: { padding: 0.18 },
  minZoom: 0.12,
  maxZoom: 2.2,
  proOptions: { hideAttribution: false },
  nodesDraggable: true,
  nodesConnectable: false,
  elementsSelectable: true,
} as const

function chrome(path: Path) {
  const colours = siteColours(path)
  return (
    <>
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#dde3e9" />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable maskColor="rgb(26 32 41 / 9%)" nodeColor={(node) => colours.get((node.data as { device?: { site: string } })?.device?.site ?? '') ?? '#9aa6b3'} />
    </>
  )
}

function deviceNodes(path: Path, placed: ReturnType<typeof layeredLayout>, focus: string | null, opts?: { compact?: boolean; showSite?: boolean; parent?: boolean }): Node[] {
  const colours = siteColours(path)
  return path.nodes
    .filter((node) => placed.has(node.id))
    .map((node) => {
      const pos = placed.get(node.id)!
      return {
        id: node.id,
        type: 'device',
        position: { x: pos.x, y: pos.y },
        ...(opts?.parent ? { parentId: node.site, extent: 'parent' as const } : {}),
        data: {
          device: node,
          colour: colours.get(node.site) ?? '#8a949e',
          health: healthFor(path, node.site),
          showSite: opts?.showSite ?? true,
          compact: opts?.compact,
          dim: focus !== null && node.site !== focus,
        },
      }
    })
}

function linkEdges(path: Path, focus: string | null, shape: 'bezier' | 'step' | 'straight', type: 'link' | 'floating' = 'link'): Edge[] {
  const vlans = vlanColours(path)
  const siteof = new Map(path.nodes.map((node) => [node.id, node.site]))
  const forward = orientation(path)
  return path.edges.map((edge) => {
    const dim = focus !== null && siteof.get(edge.source) !== focus && siteof.get(edge.target) !== focus
    const flip = forward.get(edge.id) === false
    return {
      id: edge.id,
      source: flip ? edge.target : edge.source,
      target: flip ? edge.source : edge.target,
      type,
      sourceHandle: type === 'link' ? 's-right' : undefined,
      targetHandle: type === 'link' ? 't-left' : undefined,
      data: {
        vlans: edge.vlans,
        ports: edge.ports,
        sessions: edge.sessions,
        scope: edge.scope,
        colour: vlans.get(edge.vlans[0] ?? '') ?? '#78838f',
        shape,
        fan: edge.sessions.length > 1,
        dim,
      },
    }
  })
}

function useLiveNodes(computed: Node[], resetKey: string, selected: string | null) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const moved = useRef(new Map<string, { x: number; y: number }>())

  useEffect(() => {
    moved.current.clear()
  }, [resetKey])

  useEffect(() => {
    setNodes(computed.map((node) => ({ ...node, position: moved.current.get(node.id) ?? node.position, selected: node.id === selected })))
  }, [computed, selected, setNodes])

  const handle = useCallback(
    (changes: NodeChange<Node>[]) => {
      for (const change of changes) {
        if (change.type === 'position' && change.position && !change.dragging) moved.current.set(change.id, change.position)
      }
      onNodesChange(changes)
    },
    [onNodesChange],
  )

  return { nodes, onNodesChange: handle }
}

function RefitOnResize() {
  const flow = useReactFlow()
  useEffect(() => {
    const el = document.querySelector('.main .canvas')
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = el.getBoundingClientRect().width
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width
      if (Math.abs(width - last) < 4) return
      last = width
      clearTimeout(timer)
      timer = setTimeout(() => flow.fitView({ duration: 250, padding: 0.18 }), 180)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [flow])
  return null
}

export function LayeredView({ path, focus, onSelect, selected }: ViewProps) {
  const nodes = useMemo(() => deviceNodes(path, layeredLayout(path, 'LR'), focus), [path, focus])
  const edges = useMemo(() => linkEdges(path, focus, 'bezier'), [path, focus])
  const live = useLiveNodes(nodes, `layered-${path.id}`, selected)

  return (
    <ReactFlow
      {...FLOW}
      nodes={live.nodes}
      onNodesChange={live.onNodesChange}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={(_, node) => onSelect(node.id)}
      onPaneClick={() => onSelect(null)}
    >
      {chrome(path)}
      <RefitOnResize />
    </ReactFlow>
  )
}

export function GroupedView({ path, focus, onSelect, selected }: ViewProps) {
  const { nodes, edges } = useMemo(() => {
    const laid = groupedLayout(path)
    const colours = siteColours(path)
    const counts = new Map<string, number>()
    for (const node of path.nodes) counts.set(node.site, (counts.get(node.site) ?? 0) + 1)
    const groups: Node[] = laid.groups.map((box) => ({
      id: box.site,
      type: 'siteGroup',
      position: { x: box.x, y: box.y },
      style: { width: box.w, height: box.h },
      selectable: false,
      data: {
        site: box.site,
        colour: colours.get(box.site) ?? '#8a949e',
        health: healthFor(path, box.site),
        devices: counts.get(box.site) ?? 0,
      },
      className: focus !== null && box.site !== focus ? 'faded' : undefined,
    }))
    const children = deviceNodes(path, laid.nodes, focus, { parent: true, showSite: false })
    return { nodes: [...groups, ...children], edges: linkEdges(path, focus, 'step', 'floating') }
  }, [path, focus])

  const live = useLiveNodes(nodes, `grouped-${path.id}`, selected)

  return (
    <ReactFlow
      {...FLOW}
      nodes={live.nodes}
      onNodesChange={live.onNodesChange}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={(_, node) => onSelect(node.type === 'siteGroup' ? null : node.id)}
      onPaneClick={() => onSelect(null)}
    >
      {chrome(path)}
      <RefitOnResize />
    </ReactFlow>
  )
}

export function LadderView({ path, focus, onSelect, selected }: ViewProps) {
  const { nodes, edges } = useMemo(() => {
    const colours = siteColours(path)
    const groups = hopsByDevice(path)
    const nodelist: Node[] = []
    const edgelist: Edge[] = []
    let y = 0
    const COL = 70
    let previd: string | null = null
    let prevsite: string | null = null
    let prevvlan: string | null = null

    const siteKey = (node: string) => node.split(':')[0]
    const order = siteOrder(path)

    groups.forEach((group, gidx) => {
      const key = siteKey(group.node)
      const sitecol = Math.max(order.indexOf(key), 0)
      group.hops.forEach((hop, hidx) => {
        const id = `hop-${hop.index}`
        nodelist.push({
          id,
          type: 'hop',
          position: { x: 60 + sitecol * COL, y },
          data: {
            hop,
            colour: colours.get(key) ?? '#8a949e',
            health: healthFor(path, key),
            crossing: prevsite !== null && prevsite !== key,
            first: gidx === 0 && hidx === 0,
            last: gidx === groups.length - 1 && hidx === group.hops.length - 1,
          },
          className: focus !== null && key !== focus ? 'faded' : undefined,
        })
        if (previd) {
          const crossing = prevsite !== key
          const vlanchange = prevvlan !== null && hop.vlan !== null && prevvlan !== hop.vlan
          edgelist.push({
            id: `${previd}->${id}`,
            source: previd,
            target: id,
            type: 'hop',
            data: {
              colour: colours.get(key) ?? '#8a949e',
              crossing,
              label: crossing ? (vlanchange ? `${shortSite(prevsite ?? '')} → ${shortSite(key)} · VLAN ${prevvlan}→${hop.vlan}` : shortSite(key)) : vlanchange ? `VLAN ${prevvlan}→${hop.vlan}` : undefined,
            },
          })
        }
        previd = id
        prevsite = key
        prevvlan = hop.vlan
        y += 128
      })
      y += 26
    })
    return { nodes: nodelist, edges: edgelist }
  }, [path, focus])

  const live = useLiveNodes(nodes, `ladder-${path.id}`, selected)

  return (
    <ReactFlow
      {...FLOW}
      fitView={false}
      defaultViewport={{ x: 30, y: 20, zoom: 1 }}
      nodes={live.nodes}
      onNodesChange={live.onNodesChange}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={(_, node) => onSelect(node.id)}
      onPaneClick={() => onSelect(null)}
    >
      <Background variant={BackgroundVariant.Lines} gap={70} size={1} color="#dde3e9" />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}

export function RadialView({ path, focus, onSelect, selected }: ViewProps) {
  const nodes = useMemo(() => deviceNodes(path, radialLayout(path), focus, { compact: true }), [path, focus])
  const edges = useMemo(() => linkEdges(path, focus, 'straight', 'floating'), [path, focus])
  const live = useLiveNodes(nodes, `radial-${path.id}`, selected)

  return (
    <ReactFlow
      {...FLOW}
      nodes={live.nodes}
      onNodesChange={live.onNodesChange}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={(_, node) => onSelect(node.id)}
      onPaneClick={() => onSelect(null)}
    >
      {chrome(path)}
      <RefitOnResize />
    </ReactFlow>
  )
}

export function MetroView({ path, focus, onSelect, selected }: ViewProps) {
  const nodes = useMemo(() => deviceNodes(path, metroLayout(path), focus, { compact: true }), [path, focus])
  const edges = useMemo(() => linkEdges(path, focus, 'step', 'floating'), [path, focus])
  const live = useLiveNodes(nodes, `metro-${path.id}`, selected)

  return (
    <ReactFlow
      {...FLOW}
      nodes={live.nodes}
      onNodesChange={live.onNodesChange}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={(_, node) => onSelect(node.id)}
      onPaneClick={() => onSelect(null)}
    >
      <Background variant={BackgroundVariant.Cross} gap={44} size={5} color="#dde3e9" />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable maskColor="rgb(26 32 41 / 9%)" nodeColor={(node) => siteColours(path).get((node.data as { device?: { site: string } })?.device?.site ?? '') ?? '#9aa6b3'} />
      <RefitOnResize />
    </ReactFlow>
  )
}

export const VIEWS: { id: ViewId; label: string; blurb: string; Component: (props: ViewProps) => React.ReactElement }[] = [
  { id: 'layered', label: 'Layered flow', blurb: 'Dagre ranks, left to right. No hand-written placement — forks, meshes and rings all fall out of rank assignment.', Component: LayeredView },
  { id: 'grouped', label: 'Site containers', blurb: 'Sites are real parent nodes. Containment replaces drawn boundaries, so a site can never render as two boxes.', Component: GroupedView },
  { id: 'ladder', label: 'Hop ladder', blurb: 'The manifest hop sequence as a traceroute. No geometry to refuse — every topology renders identically well.', Component: LadderView },
  { id: 'radial', label: 'Radial peers', blurb: 'Endpoints on the rim, transit inside. Nothing can be mistaken for the middle of the path.', Component: RadialView },
  { id: 'metro', label: 'Metro grid', blurb: 'Column is hop distance, row is site, right angles only. Rigid so a change in the picture means a change in the path.', Component: MetroView },
]

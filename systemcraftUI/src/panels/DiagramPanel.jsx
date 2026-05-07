import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Button, TextField, Menu, MenuItem, Tooltip } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import AddIcon from '@mui/icons-material/Add'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import EditIcon from '@mui/icons-material/Edit'
import CheckIcon from '@mui/icons-material/Check'
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  MarkerType,
  addEdge,
  BaseEdge,
  getSmoothStepPath,
  getBezierPath,
  EdgeLabelRenderer,
  ConnectionMode,
  useInternalNode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { C } from '../theme'

const SERVICE_TYPES = ['Redis', 'Kafka', 'Postgres', 'Elasticsearch', 'S3', 'Cassandra', 'MongoDB']

/* ── Floating edge helpers — auto-route to closest side ─────────── */
function getNodeIntersection(intersectionNode, targetNode) {
  const w = intersectionNode.measured.width / 2
  const h = intersectionNode.measured.height / 2
  const x2 = intersectionNode.internals.positionAbsolute.x + w
  const y2 = intersectionNode.internals.positionAbsolute.y + h
  const x1 = targetNode.internals.positionAbsolute.x + targetNode.measured.width / 2
  const y1 = targetNode.internals.positionAbsolute.y + targetNode.measured.height / 2
  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h)
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h)
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1)
  const xx3 = a * xx1
  const yy3 = a * yy1
  return { x: w * (xx3 + yy3) + x2, y: h * (-xx3 + yy3) + y2 }
}

function getEdgePosition(node, point) {
  const nx = Math.round(node.internals.positionAbsolute.x)
  const ny = Math.round(node.internals.positionAbsolute.y)
  const px = Math.round(point.x)
  const py = Math.round(point.y)
  if (px <= nx + 1) return Position.Left
  if (px >= nx + node.measured.width - 1) return Position.Right
  if (py <= ny + 1) return Position.Top
  if (py >= ny + node.measured.height - 1) return Position.Bottom
  return Position.Top
}

function getEdgeParams(source, target) {
  const sourceIntersect = getNodeIntersection(source, target)
  const targetIntersect = getNodeIntersection(target, source)
  return {
    sx: sourceIntersect.x, sy: sourceIntersect.y,
    tx: targetIntersect.x, ty: targetIntersect.y,
    sourcePos: getEdgePosition(source, sourceIntersect),
    targetPos: getEdgePosition(target, targetIntersect),
  }
}

/* ── Floating animated edge ─────────────────────────────────────── */
function CustomEdge({ id, source, target, style, selected, data, markerEnd }) {
  const [hovered, setHovered] = useState(false)
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  if (!sourceNode || !targetNode) return null

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode)
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: sx, sourceY: sy, sourcePosition: sourcePos,
    targetX: tx, targetY: ty, targetPosition: targetPos,
  })
  const active = hovered || selected

  const stroke = style?.stroke || C.line3
  const strokeWidth = active ? 3 : (style?.strokeWidth || 1.5)

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{ stroke, strokeWidth, strokeDasharray: '6 4', animation: 'dashflow 1.2s linear infinite' }}
      />
      <path
        d={edgePath} fill="none" stroke="transparent" strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: 'pointer' }}
      />
      <EdgeLabelRenderer>
        {data?.label && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            <span style={{
              fontSize: '0.625rem',
              color: active ? C.ink1 : C.ink3,
              fontFamily: '"JetBrains Mono", monospace',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
              background: C.bg0,
              border: `1px solid ${stroke}55`,
              borderRadius: 3,
              padding: '1px 6px',
              transition: 'color 120ms, border-color 120ms',
            }}>
              {data.label} →
            </span>
          </div>
        )}
        {active && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 14}px)`,
              pointerEvents: 'all',
              zIndex: 1000,
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                data?.onDelete?.(id)
              }}
              style={{
                width: 22, height: 22, borderRadius: '50%',
                border: '2px solid #fff', background: C.crit,
                color: '#fff', fontSize: 14, fontWeight: 'bold',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0, lineHeight: 1, boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              }}
            >
              ×
            </button>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  )
}

/* ── Custom node ────────────────────────────────────────────────── */
function ServiceNode({ id, data, isConnectable, selected }) {
  const [hovered, setHovered] = useState(false)
  const { name, port, state, status, meta } = data
  const s = {
    ok:   { border: `2px solid ${C.ok}99`, bg: `${C.ok}12`, text: C.ok },
    warn: { border: `2px solid ${C.warn}99`, bg: `${C.warn}12`, text: C.warn },
    crit: { border: `2px solid ${C.crit}cc`, bg: `${C.crit}18`, text: C.crit },
  }[status] || { border: `2px solid ${C.line3}`, bg: C.bg3, text: C.ink3 }

  const showAffordances = hovered || selected
  const handleStyle = {
    width: 12, height: 12,
    backgroundColor: C.accent,
    border: `2px solid ${C.bg0}`,
    opacity: showAffordances ? 1 : 0,
    pointerEvents: showAffordances ? 'auto' : 'none',
    transition: 'opacity 100ms ease, transform 100ms ease',
    transform: showAffordances ? 'scale(1.1)' : 'scale(0.6)',
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 175, borderRadius: '10px', backgroundColor: s.bg, border: s.border,
        padding: '10px 13px', display: 'flex', flexDirection: 'column', gap: '6px',
        position: 'relative', fontFamily: '"JetBrains Mono", monospace', cursor: 'grab', userSelect: 'none',
        boxShadow: selected ? `0 0 0 2px ${C.accent}` : (status === 'crit' ? `0 0 16px ${C.crit}22` : status === 'warn' ? `0 4px 16px ${C.warn}18` : `0 4px 16px rgba(0,0,0,0.5)`),
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.8125rem', color: C.ink1, fontWeight: 700 }}>{name}</div>
        <div style={{ fontSize: '0.5rem', color: C.ink4 }}>{port}</div>
      </div>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: s.text, lineHeight: 1.1, letterSpacing: '-0.02em' }}>{state}</div>
      <div style={{ fontSize: '0.5rem', color: C.ink4, paddingTop: '6px', borderTop: `1px solid ${C.line1}44`, display: 'flex', justifyContent: 'space-between' }}>
        <span>{meta[0]}</span><span>{meta[1]}</span>
      </div>

      {showAffordances && (
        <div
          className="nodrag"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            data.onDelete?.(id)
          }}
          style={{
            position: 'absolute', top: -10, right: -10, width: 22, height: 22,
            background: C.crit, border: '2px solid #fff', borderRadius: '50%',
            color: '#fff', fontSize: 14, fontWeight: 'bold',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            lineHeight: 1,
          }}
          title="Delete"
        >
          ×
        </div>
      )}

      <Handle id="left" type="source" position={Position.Left} isConnectable={isConnectable} style={handleStyle} />
      <Handle id="right" type="source" position={Position.Right} isConnectable={isConnectable} style={handleStyle} />
      <Handle id="top" type="source" position={Position.Top} isConnectable={isConnectable} style={handleStyle} />
      <Handle id="bottom" type="source" position={Position.Bottom} isConnectable={isConnectable} style={handleStyle} />
    </div>
  )
}

const nodeTypes = { service: ServiceNode }
const edgeTypes = { custom: CustomEdge }

/* ── Inspector ──────────────────────────────────────────────────── */
function Inspector({ node, onClose, onRename }) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')

  useEffect(() => {
    setEditing(false)
    setDraftName(node?.data?.name || '')
  }, [node?.id])

  if (!node) return null
  const { name, port, state, status, meta } = node.data

  const statusColor = { ok: C.ok, warn: C.warn, crit: C.crit }[status] || C.ink3
  const metrics = [
    ['port', port, C.ink1],
    ['state', state, statusColor],
    ['status', status, statusColor],
    ['kind', meta?.[0] || '—', C.ink1],
    ['mode', meta?.[1] || '—', C.ink1],
  ]

  const commitRename = () => {
    if (draftName.trim() && draftName !== name) onRename(node.id, draftName.trim())
    setEditing(false)
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: C.bg1 } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pr: 1 }}>
        {editing ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
            <TextField
              autoFocus size="small" value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(false) }}
              sx={{ flex: 1 }}
            />
            <IconButton onClick={commitRename} size="small" sx={{ color: C.ok }}><CheckIcon fontSize="small" /></IconButton>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 1 }}>
            <Box sx={{ fontFamily: '"JetBrains Mono"', color: C.ink1 }}>{name}</Box>
            <Tooltip title="Rename">
              <IconButton onClick={() => { setDraftName(name); setEditing(true) }} size="small" sx={{ color: C.ink3 }}>
                <EditIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </Box>
        )}
        <IconButton onClick={onClose} size="small"><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent>
        {metrics.map(([k, v, color]) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', marginBottom: '0.5rem' }}>
            <div style={{ fontSize: '0.75rem', color: C.ink3, fontFamily: '"JetBrains Mono"' }}>{k}</div>
            <div style={{ fontSize: '0.75rem', color, textAlign: 'right', fontFamily: '"JetBrains Mono"' }}>{v}</div>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  )
}

/* ── Main diagram component ─────────────────────────────────────── */
const INITIAL_NODES = (traffic) => [
  { id: 'client', type: 'service', position: { x: 30, y: 80 }, data: { name: 'Client', port: ':443', state: `${Math.round(traffic / 100) * 100} req/s`, status: 'ok', meta: ['browser', 'TLS 1.3'] } },
  { id: 'app', type: 'service', position: { x: 290, y: 80 }, data: { name: 'FastAPI', port: ':8000', state: '23% cpu', status: 'ok', meta: ['fastapi', 'no cache'] } },
  { id: 'postgres', type: 'service', position: { x: 560, y: 80 }, data: { name: 'Postgres', port: ':5432', state: '94/100 conn', status: 'crit', meta: ['primary', '10M rows'] } },
]

const INITIAL_EDGES = [
  { id: 'c-a', source: 'client', target: 'app', type: 'custom', data: { label: 'HTTPS' }, style: { stroke: C.line3, strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'a-p', source: 'app', target: 'postgres', type: 'custom', data: { label: 'all queries' }, style: { stroke: C.crit, strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
]

export default function DiagramPanel({ traffic = 2340 }) {
  const [inspectedId, setInspectedId] = useState(null)
  const [addAnchor, setAddAnchor] = useState(null)

  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES(traffic))
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)

  // History stack — only push on intentional structural changes
  const historyRef = useRef([{ nodes: INITIAL_NODES(traffic), edges: INITIAL_EDGES }])
  const indexRef = useRef(0)
  const [, forceRender] = useState(0)
  const tick = () => forceRender(x => x + 1)

  const pushHistory = useCallback((nextNodes, nextEdges) => {
    const stripped = nextNodes.map(n => ({ ...n, data: { ...n.data, onDelete: undefined } }))
    const stack = historyRef.current.slice(0, indexRef.current + 1)
    stack.push({ nodes: stripped, edges: nextEdges })
    historyRef.current = stack
    indexRef.current = stack.length - 1
    tick()
  }, [])

  const handleNodeDelete = useCallback((id) => {
    setNodes(curr => {
      const updated = curr.filter(n => n.id !== id)
      setEdges(currE => {
        const filtered = currE.filter(e => e.source !== id && e.target !== id)
        pushHistory(updated, filtered)
        return filtered
      })
      return updated
    })
  }, [setNodes, setEdges, pushHistory])

  const handleEdgeDelete = useCallback((id) => {
    setEdges(curr => {
      const updated = curr.filter(e => e.id !== id)
      pushHistory(nodes, updated)
      return updated
    })
  }, [setEdges, nodes, pushHistory])

  // Memoize decorated arrays — only re-decorate when nodes/edges or callback identity changes
  const decoratedNodes = useMemo(
    () => nodes.map(n => ({ ...n, data: { ...n.data, onDelete: handleNodeDelete } })),
    [nodes, handleNodeDelete]
  )
  const decoratedEdges = useMemo(
    () => edges.map(e => ({ ...e, data: { ...(e.data || {}), onDelete: handleEdgeDelete } })),
    [edges, handleEdgeDelete]
  )

  const addNode = useCallback((type) => {
    const id = `node-${Date.now()}`
    const newNode = { id, type: 'service', position: { x: Math.random() * 200 + 250, y: Math.random() * 150 + 100 }, data: { name: type, port: ':5000', state: 'healthy', status: 'ok', meta: [type.toLowerCase(), 'run'] } }
    const updated = [...nodes, newNode]
    setNodes(updated)
    pushHistory(updated, edges)
  }, [nodes, edges, setNodes, pushHistory])

  const onConnect = useCallback((connection) => {
    const newEdge = { ...connection, id: `e-${Date.now()}`, type: 'custom', data: { label: 'data' }, style: { stroke: C.line3, strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed } }
    const updated = addEdge(newEdge, edges)
    setEdges(updated)
    pushHistory(nodes, updated)
  }, [edges, nodes, setEdges, pushHistory])

  // Native xyflow delete events (Backspace key)
  const onNodesDelete = useCallback((deleted) => {
    const ids = deleted.map(n => n.id)
    const updatedNodes = nodes.filter(n => !ids.includes(n.id))
    const updatedEdges = edges.filter(e => !ids.includes(e.source) && !ids.includes(e.target))
    pushHistory(updatedNodes, updatedEdges)
  }, [nodes, edges, pushHistory])

  const onEdgesDelete = useCallback((deleted) => {
    const ids = deleted.map(e => e.id)
    const updated = edges.filter(e => !ids.includes(e.id))
    pushHistory(nodes, updated)
  }, [edges, nodes, pushHistory])

  // Single-click opens inspector
  const onNodeClick = useCallback((_, node) => {
    setInspectedId(node.id)
  }, [])

  const handleRename = useCallback((id, newName) => {
    const updated = nodes.map(n => n.id === id ? { ...n, data: { ...n.data, name: newName } } : n)
    setNodes(updated)
    pushHistory(updated, edges)
  }, [nodes, edges, setNodes, pushHistory])

  const undo = useCallback(() => {
    if (indexRef.current > 0) {
      indexRef.current -= 1
      const snap = historyRef.current[indexRef.current]
      setNodes(snap.nodes)
      setEdges(snap.edges)
      tick()
    }
  }, [setNodes, setEdges])

  const redo = useCallback(() => {
    if (indexRef.current < historyRef.current.length - 1) {
      indexRef.current += 1
      const snap = historyRef.current[indexRef.current]
      setNodes(snap.nodes)
      setEdges(snap.edges)
      tick()
    }
  }, [setNodes, setEdges])

  // Keyboard shortcuts: Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z
  useEffect(() => {
    const handler = (e) => {
      const cmd = e.metaKey || e.ctrlKey
      if (cmd && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if (cmd && (e.key === 'z' && e.shiftKey || e.key === 'y')) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  const canUndo = indexRef.current > 0
  const canRedo = indexRef.current < historyRef.current.length - 1

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: C.bg0 }}>
      <Box sx={{ px: 2, py: 1, bgcolor: C.bg1, borderBottom: `1px solid ${C.line1}`, display: 'flex', gap: 1, alignItems: 'center' }}>
        <Tooltip title="Add service"><Button size="small" onClick={(e) => setAddAnchor(e.currentTarget)} startIcon={<AddIcon />} sx={{ textTransform: 'none', fontSize: '0.75rem' }}>Add</Button></Tooltip>
        <Menu anchorEl={addAnchor} open={Boolean(addAnchor)} onClose={() => setAddAnchor(null)}>
          {SERVICE_TYPES.map(type => (
            <MenuItem key={type} onClick={() => { addNode(type); setAddAnchor(null) }}>{type}</MenuItem>
          ))}
        </Menu>
        <Tooltip title="Undo (⌘Z)"><span><Button size="small" onClick={undo} disabled={!canUndo} sx={{ minWidth: 'auto', p: 0.5 }}><UndoIcon sx={{ fontSize: '16px' }} /></Button></span></Tooltip>
        <Tooltip title="Redo (⌘⇧Z)"><span><Button size="small" onClick={redo} disabled={!canRedo} sx={{ minWidth: 'auto', p: 0.5 }}><RedoIcon sx={{ fontSize: '16px' }} /></Button></span></Tooltip>
        <Box sx={{ ml: 'auto', fontFamily: '"JetBrains Mono"', fontSize: '0.625rem', color: C.ink4 }}>click to rename · drag handle to connect · select + ⌫ to delete</Box>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0 }}>
        <ReactFlow
          nodes={decoratedNodes}
          edges={decoratedEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          deleteKeyCode={['Backspace', 'Delete']}
          panActivationKeyCode={null}
          connectionMode={ConnectionMode.Loose}
          proOptions={{ hideAttribution: true }}
          fitView
        >
          <Background color={C.line1} gap={24} size={1} />
          <Controls style={{ bottom: 8, right: 8 }} showInteractive={false} />
        </ReactFlow>
      </Box>

      <Box sx={{ px: 2, py: 0.75, bgcolor: C.bg1, borderTop: `1px solid ${C.line1}`, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: C.crit, animation: 'pulse 1.2s infinite' }} />
        <Box sx={{ fontFamily: '"JetBrains Mono"', fontSize: '0.5625rem', color: C.crit }}>pool saturated</Box>
      </Box>

      <Inspector
        node={inspectedId ? nodes.find(n => n.id === inspectedId) : null}
        onClose={() => setInspectedId(null)}
        onRename={handleRename}
      />
    </Box>
  )
}

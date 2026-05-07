import { useState, useCallback } from 'react'
import { Box, Dialog, DialogContent, DialogTitle, IconButton } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { C } from '../theme'

/* ── Custom node ─────────────────────────────────────────────────── */
function ServiceNode({ data }) {
  const { name, port, state, status, meta } = data
  const s = {
    ok:   { border: `2px solid ${C.ok}88`,   bg: `${C.ok}18`,   bar: C.ok,   text: C.ok   },
    warn: { border: `2px solid ${C.warn}99`,  bg: `${C.warn}18`, bar: C.warn, text: C.warn },
    crit: { border: `2px solid ${C.crit}cc`,  bg: `${C.crit}22`, bar: C.crit, text: C.crit },
  }[status] || { border: `2px solid ${C.line3}`, bg: C.bg3, bar: C.line3, text: C.ink3 }

  return (
    <Box sx={{
      width: 148, minHeight: 92,
      borderRadius: '8px', bgcolor: s.bg,
      border: s.border,
      boxShadow: status === 'crit' ? `0 0 0 1px ${C.crit}22, 0 0 20px ${C.crit}18` : 'none',
      p: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px',
      position: 'relative', overflow: 'hidden',
      fontFamily: '"JetBrains Mono", monospace',
      cursor: 'pointer',
      boxShadow: status === 'crit' ? `0 0 0 1px ${C.crit}33, 0 4px 20px ${C.crit}22` : status === 'warn' ? `0 4px 12px ${C.warn}18` : `0 4px 12px rgba(0,0,0,0.4)`,
      '@keyframes critPulse': {
        '0%,100%': { boxShadow: `0 0 8px ${C.crit}18` },
        '50%': { boxShadow: `0 0 28px ${C.crit}44` },
      },
      animation: status === 'crit' ? 'critPulse 2.4s ease-in-out infinite' : 'none',
    }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ fontSize: '0.75rem', color: C.ink1, fontWeight: 600 }}>{name}</Box>
        <Box sx={{ fontSize: '0.5rem', color: C.ink4 }}>{port}</Box>
      </Box>
      <Box sx={{ fontSize: '0.75rem', fontWeight: 500, color: s.text, lineHeight: 1.3 }}>{state}</Box>
      <Box sx={{ fontSize: '0.5625rem', color: C.ink3, mt: 'auto', pt: '6px', borderTop: `1px solid ${C.line1}`, display: 'flex', justifyContent: 'space-between' }}>
        <span>{meta[0]}</span><span>{meta[1]}</span>
      </Box>
      <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, bgcolor: s.bar }} />
      {/* React Flow connection handles (hidden, positioned) */}
      <Handle type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: 'none' }} />
    </Box>
  )
}

const nodeTypes = { service: ServiceNode }

/* ── Inspector dialog ────────────────────────────────────────────── */
function Inspector({ nodeId, onClose }) {
  if (!nodeId) return null
  const data = {
    client:   { title: 'Client / Edge', sub: 'Browser · TLS 1.3', metrics: [['req/s', '2,340', 'ok'], ['error rate', '1.5%', 'bad']] },
    app:      { title: 'FastAPI App', sub: 'localhost:8000 · 4 workers', metrics: [['cpu', '23%', 'ok'], ['workers', '4 / 4', 'ok'], ['db pool', '94/100', 'warn'], ['cache', 'disabled', 'bad']] },
    postgres: { title: 'Postgres · primary', sub: 'localhost:5432 · max_connections=100', metrics: [['connections active', '94 / 100', 'bad'], ['connections waiting', '24', 'bad'], ['cpu', '31%', 'warn'], ['cache hit ratio', '99.1%', 'ok'], ['p99 query', '12ms', 'ok']] },
  }
  const d = data[nodeId] || data.postgres
  const toneColor = t => ({ bad: C.crit, warn: C.warn, ok: C.ok }[t] || C.ink1)

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: C.bg1, border: `1px solid ${C.line2}` } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pb: 1.5 }}>
        <Box>
          <Box sx={{ fontSize: '1rem', fontWeight: 500, color: C.ink1 }}>{d.title}</Box>
          <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem', color: C.ink3, mt: 0.25 }}>{d.sub}</Box>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: C.ink3, mt: -0.5 }}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 1.5, columnGap: 3 }}>
          {d.metrics.map(([k, v, t]) => (
            <>
              <Box key={k + 'k'} sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem', color: C.ink3 }}>{k}</Box>
              <Box key={k + 'v'} sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem', color: toneColor(t), textAlign: 'right', fontWeight: 500 }}>{v}</Box>
            </>
          ))}
        </Box>
        {nodeId === 'postgres' && (
          <Box sx={{ mt: 2.5, pt: 2, borderTop: `1px solid ${C.line1}`, fontSize: '0.8125rem', color: C.ink3, lineHeight: 1.6 }}>
            Pool exhausted — CPU calm. <Box component="span" sx={{ color: C.accent }}>Adding a Redis cache layer would absorb most reads and free the pool.</Box>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ── Main component ──────────────────────────────────────────────── */
export default function DiagramPanel({ traffic = 2340 }) {
  const [inspectedId, setInspectedId] = useState(null)

  const initialNodes = [
    {
      id: 'client',
      type: 'service',
      position: { x: 30, y: 80 },
      data: { name: 'Client', port: ':443', state: `${Math.round(traffic / 100) * 100} req/s`, status: 'ok', meta: ['browser', 'TLS 1.3'] },
    },
    {
      id: 'app',
      type: 'service',
      position: { x: 230, y: 80 },
      data: { name: 'FastAPI', port: ':8000', state: '23% cpu · 4w', status: 'ok', meta: ['fastapi', 'no cache'] },
    },
    {
      id: 'postgres',
      type: 'service',
      position: { x: 440, y: 80 },
      data: { name: 'Postgres', port: ':5432', state: '94/100 conn', status: 'crit', meta: ['primary', '10M rows'] },
    },
  ]

  const initialEdges = [
    {
      id: 'c-a',
      source: 'client',
      target: 'app',
      label: 'HTTPS',
      type: 'smoothstep',
      style: { stroke: C.line3, strokeWidth: 1.5 },
      labelStyle: { fill: C.ink4, fontFamily: '"JetBrains Mono"', fontSize: 10 },
      labelBgStyle: { fill: C.bg0, fillOpacity: 0.9 },
      markerEnd: { type: MarkerType.ArrowClosed, color: C.line3 },
    },
    {
      id: 'a-p',
      source: 'app',
      target: 'postgres',
      label: 'all queries →',
      type: 'smoothstep',
      animated: true,
      style: { stroke: C.crit, strokeWidth: 2 },
      labelStyle: { fill: C.crit, fontFamily: '"JetBrains Mono"', fontSize: 10, fontWeight: 600 },
      labelBgStyle: { fill: C.bg0, fillOpacity: 0.9 },
      markerEnd: { type: MarkerType.ArrowClosed, color: C.crit },
    },
  ]

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  const onNodeClick = useCallback((_, node) => setInspectedId(node.id), [])

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: C.bg0 }}>
      {/* React Flow diagram */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          colorMode="dark"
          proOptions={{ hideAttribution: true }}
          style={{ background: C.bg0 }}
        >
          <Background color={C.line1} gap={24} size={1} />
          <Controls
            style={{ bottom: 8, right: 8, top: 'auto', left: 'auto' }}
            showInteractive={false}
          />
        </ReactFlow>
      </Box>

      {/* Pool saturation status */}
      <Box sx={{ px: 2, py: 0.75, bgcolor: C.bg1, borderTop: `1px solid ${C.line1}`, display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
        <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: C.crit, animation: 'pulse 1.2s ease-in-out infinite', '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />
        <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem', color: C.crit }}>
          connection pool saturated — {Math.round(traffic / 33)} req/s waiting
        </Box>
        <Box sx={{ ml: 'auto', fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5rem', fontWeight: 600, color: C.ink3 }}>click node to inspect</Box>
      </Box>

      <Inspector nodeId={inspectedId} onClose={() => setInspectedId(null)} />
    </Box>
  )
}

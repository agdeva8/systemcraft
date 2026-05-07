import { useState, useCallback, useRef, useEffect, useMemo, useContext } from 'react'
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Button, TextField, Menu, MenuItem, Tooltip, CircularProgress } from '@mui/material'
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
import { SessionCtx } from '../components/Session'
import { getAddableServices, getRemovableServices, isCoreSevice } from '../lib/scenarioConfig'
import { fetchInternals } from '../lib/api'


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
  const { name, port, state, status, meta, deletable } = data
  const s = {
    ok:      { border: `2px solid ${C.ok}99`,   bg: `${C.ok}12`,   text: C.ok },
    warn:    { border: `2px solid ${C.warn}99`, bg: `${C.warn}12`, text: C.warn },
    crit:    { border: `2px solid ${C.crit}cc`, bg: `${C.crit}18`, text: C.crit },
    pending: { border: `2px dashed ${C.ink4}66`, bg: `${C.ink4}08`, text: C.ink4 },
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

      {showAffordances && deletable && (
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
          title="Remove service"
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

/* ── Shared inspector styles ───────────────────────────────────── */
const MONO = { fontFamily: '"JetBrains Mono", monospace' }
const ROW = { display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', marginBottom: '0.4rem' }
const LBL = { fontSize: '0.6875rem', color: C.ink4, ...MONO }
const VAL = (c = C.ink1) => ({ fontSize: '0.6875rem', color: c, textAlign: 'right', ...MONO, fontWeight: 600 })

function PoolBar({ used, max, label }) {
  const pct = max > 0 ? Math.min(used / max, 1) * 100 : 0
  const color = pct >= 90 ? C.crit : pct >= 60 ? C.warn : C.ok
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ ...ROW, marginBottom: 2 }}>
        <span style={LBL}>{label}</span>
        <span style={VAL(color)}>{used} / {max}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: C.bg3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

function InspectorSection({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: '0.5625rem', color: C.ink4, ...MONO, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6, borderBottom: `1px solid ${C.line1}`, paddingBottom: 4 }}>{title}</div>
      {children}
    </div>
  )
}

function ClientInspector({ metrics }) {
  const m = metrics || {}
  return (
    <>
      <InspectorSection title="Traffic">
        <div style={ROW}><span style={LBL}>requests/sec</span><span style={VAL()}>{m.rps ?? '—'}</span></div>
        <div style={ROW}><span style={LBL}>p99 latency</span><span style={VAL(m.latency_p99 > 400 ? C.crit : m.latency_p99 > 200 ? C.warn : C.ok)}>{m.latency_p99 != null ? `${m.latency_p99}ms` : '—'}</span></div>
        <div style={ROW}><span style={LBL}>error rate</span><span style={VAL(m.error_rate > 1.5 ? C.crit : m.error_rate > 0.5 ? C.warn : C.ok)}>{m.error_rate != null ? `${m.error_rate}%` : '—'}</span></div>
      </InspectorSection>
      <InspectorSection title="Request Flow">
        <div style={{ fontSize: '0.625rem', color: C.ink3, ...MONO, lineHeight: 1.7 }}>
          <div>→ HTTPS GET /r/:slug</div>
          <div style={{ paddingLeft: 12, color: C.ink4 }}>→ FastAPI :8080</div>
          <div style={{ paddingLeft: 24, color: C.ink4 }}>→ {m.redis_hit_ratio != null ? 'Redis lookup → miss → ' : ''}Postgres query</div>
          <div style={{ paddingLeft: 12, color: C.ink4 }}>← 302 redirect</div>
          <div>← follow Location header</div>
        </div>
      </InspectorSection>
    </>
  )
}

function AppInspector({ metrics }) {
  const m = metrics || {}
  return (
    <>
      <InspectorSection title="Process">
        <div style={ROW}><span style={LBL}>CPU</span><span style={VAL(m.app_cpu >= 70 ? C.crit : m.app_cpu >= 40 ? C.warn : C.ok)}>{m.app_cpu != null ? `${m.app_cpu}%` : '—'}</span></div>
        <div style={ROW}><span style={LBL}>throughput</span><span style={VAL()}>{m.rps ?? '—'} req/s</span></div>
        <div style={ROW}><span style={LBL}>error rate</span><span style={VAL(m.error_rate > 1.5 ? C.crit : m.error_rate > 0.5 ? C.warn : C.ok)}>{m.error_rate != null ? `${m.error_rate}%` : '—'}</span></div>
      </InspectorSection>
      <InspectorSection title="Connections">
        <div style={ROW}><span style={LBL}>DB pool active</span><span style={VAL()}>{m.db_connections_active ?? '—'}</span></div>
        <div style={ROW}><span style={LBL}>DB pool waiting</span><span style={VAL(m.db_connections_waiting > 0 ? C.warn : C.ink1)}>{m.db_connections_waiting ?? '—'}</span></div>
        <div style={ROW}><span style={LBL}>cache mode</span><span style={VAL()}>{m.redis_hit_ratio != null ? 'cache-aside' : 'direct'}</span></div>
      </InspectorSection>
    </>
  )
}

function PostgresInspector({ internals, loading }) {
  if (loading) return <div style={{ ...MONO, fontSize: '0.6875rem', color: C.ink4, padding: '8px 0' }}>loading internals…</div>
  if (!internals || internals.error) return <div style={{ ...MONO, fontSize: '0.6875rem', color: C.warn, padding: '8px 0' }}>{internals?.error || 'no data'}</div>
  const conn = internals.connections || {}
  return (
    <>
      <InspectorSection title="Connection Pool">
        <PoolBar used={conn.active ?? 0} max={conn.max ?? 100} label="active connections" />
        {conn.waiting > 0 && <div style={{ ...ROW, marginTop: -4 }}><span style={LBL}>waiting for connection</span><span style={VAL(C.warn)}>{conn.waiting}</span></div>}
      </InspectorSection>
      <InspectorSection title="Performance">
        <div style={ROW}><span style={LBL}>CPU</span><span style={VAL(internals.cpu_percent >= 70 ? C.crit : internals.cpu_percent >= 40 ? C.warn : C.ok)}>{internals.cpu_percent != null ? `${internals.cpu_percent}%` : '—'}</span></div>
        <div style={ROW}><span style={LBL}>index hit rate</span><span style={VAL(internals.index_hit_rate >= 0.99 ? C.ok : internals.index_hit_rate >= 0.9 ? C.warn : C.crit)}>{internals.index_hit_rate != null ? `${(internals.index_hit_rate * 100).toFixed(1)}%` : '—'}</span></div>
      </InspectorSection>
      {internals.active_queries?.length > 0 && (
        <InspectorSection title="Active Queries">
          {internals.active_queries.map((q, i) => (
            <div key={i} style={{ marginBottom: 6, padding: '4px 8px', background: C.bg3, borderRadius: 4, border: `1px solid ${C.line1}` }}>
              <div style={{ fontSize: '0.6rem', color: C.ink2, ...MONO, wordBreak: 'break-all', lineHeight: 1.4 }}>{q.query?.slice(0, 80)}{q.query?.length > 80 ? '…' : ''}</div>
              <div style={{ display: 'flex', gap: 12, marginTop: 3 }}>
                <span style={{ fontSize: '0.5625rem', color: C.ink4, ...MONO }}>×{q.count}</span>
                <span style={{ fontSize: '0.5625rem', color: q.avg_ms > 100 ? C.warn : C.ink4, ...MONO }}>{q.avg_ms}ms avg</span>
              </div>
            </div>
          ))}
        </InspectorSection>
      )}
    </>
  )
}

function RedisInspector({ internals, loading }) {
  if (loading) return <div style={{ ...MONO, fontSize: '0.6875rem', color: C.ink4, padding: '8px 0' }}>loading internals…</div>
  if (!internals || !internals.available) return <div style={{ ...MONO, fontSize: '0.6875rem', color: C.warn, padding: '8px 0' }}>{internals?.error || 'redis not running'}</div>
  return (
    <>
      <InspectorSection title="Memory">
        <PoolBar used={internals.memory_used_mb ?? 0} max={internals.memory_limit_mb ?? 64} label="memory" />
      </InspectorSection>
      <InspectorSection title="Performance">
        <div style={ROW}><span style={LBL}>hit ratio</span><span style={VAL(internals.hit_ratio >= 80 ? C.ok : internals.hit_ratio >= 50 ? C.warn : C.crit)}>{internals.hit_ratio != null ? `${internals.hit_ratio}%` : '—'}</span></div>
        <div style={ROW}><span style={LBL}>ops/sec</span><span style={VAL()}>{internals.commands_per_sec?.get ?? '—'}</span></div>
      </InspectorSection>
      {internals.keyspace?.length > 0 && (
        <InspectorSection title={`Keyspace (${internals.keyspace.length} shown)`}>
          <div style={{ maxHeight: 140, overflowY: 'auto' }}>
            {internals.keyspace.map((k, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: `1px solid ${C.line1}22` }}>
                <span style={{ fontSize: '0.6rem', color: C.ink2, ...MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{k.key}</span>
                <span style={{ fontSize: '0.6rem', ...MONO, color: k.ttl_seconds < 0 ? C.ink4 : k.ttl_seconds < 30 ? C.warn : C.ok, flexShrink: 0, marginLeft: 8 }}>
                  {k.ttl_seconds < 0 ? 'no TTL' : `${k.ttl_seconds}s`}
                </span>
              </div>
            ))}
          </div>
        </InspectorSection>
      )}
    </>
  )
}

/* ── Inspector ──────────────────────────────────────────────────── */
function Inspector({ node, onClose, onRename, sessionId, metrics }) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [internals, setInternals] = useState(null)
  const [loadingInternals, setLoadingInternals] = useState(false)

  useEffect(() => {
    setEditing(false)
    setDraftName(node?.data?.name || '')
    setInternals(null)

    if (!node || !sessionId) return
    const nodeId = node.id
    if (nodeId === 'postgres' || nodeId === 'redis') {
      setLoadingInternals(true)
      fetchInternals(sessionId, nodeId)
        .then(setInternals)
        .catch(() => setInternals({ error: 'fetch failed' }))
        .finally(() => setLoadingInternals(false))
    }
  }, [node?.id, sessionId])

  if (!node) return null
  const { name, port, state, status } = node.data
  const statusColor = { ok: C.ok, warn: C.warn, crit: C.crit }[status] || C.ink3

  const commitRename = () => {
    if (draftName.trim() && draftName !== name) onRename(node.id, draftName.trim())
    setEditing(false)
  }

  const renderBody = () => {
    switch (node.id) {
      case 'client':   return <ClientInspector metrics={metrics} />
      case 'app':      return <AppInspector metrics={metrics} />
      case 'postgres': return <PostgresInspector internals={internals} loading={loadingInternals} />
      case 'redis':    return <RedisInspector internals={internals} loading={loadingInternals} />
      default:         return null
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: C.bg1, maxHeight: '80vh' } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pr: 1, pb: 0.5 }}>
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: statusColor, flexShrink: 0 }} />
            <Box sx={{ ...MONO, color: C.ink1, fontWeight: 700, fontSize: '1rem' }}>{name}</Box>
            <Box sx={{ ...MONO, color: C.ink4, fontSize: '0.625rem' }}>{port}</Box>
            <Tooltip title="Rename">
              <IconButton onClick={() => { setDraftName(name); setEditing(true) }} size="small" sx={{ color: C.ink3 }}>
                <EditIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </Box>
        )}
        <IconButton onClick={onClose} size="small"><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>

      <Box sx={{ px: 3, py: 0.5, mb: 1 }}>
        <Box sx={{ display: 'inline-block', ...MONO, fontSize: '0.6rem', color: statusColor, background: `${statusColor}18`, border: `1px solid ${statusColor}44`, borderRadius: 1, px: 1, py: 0.2 }}>
          {state}
        </Box>
      </Box>

      <DialogContent sx={{ pt: 0 }}>
        {renderBody()}
      </DialogContent>
    </Dialog>
  )
}

/* ── Helpers for metric-driven nodes ───────────────────────────── */
function dbStatus(active, max) {
  if (active == null) return 'ok'
  const pct = active / max
  if (pct >= 0.9) return 'crit'
  if (pct >= 0.6) return 'warn'
  return 'ok'
}

function cpuStatus(cpu) {
  if (cpu == null) return 'ok'
  if (cpu >= 70) return 'crit'
  if (cpu >= 40) return 'warn'
  return 'ok'
}

function buildNodes(traffic, metrics, activeOptional = []) {
  const m = metrics || {}
  const rps = m.rps ?? 0
  const appCpu = m.app_cpu
  const dbActive = m.db_connections_active
  const dbMax = 20
  const hitRatio = m.redis_hit_ratio
  const hasRedisMetrics = hitRatio != null || m.redis_memory_mb != null
  const redisExpected = activeOptional.some(s => s.id === 'redis')

  const nodes = [
    { id: 'client', type: 'service', position: { x: 30, y: 80 },
      data: {
        name: 'Client', port: ':443',
        state: rps > 0 ? `${rps} req/s` : `${Math.round(traffic / 100) * 100} req/s`,
        status: (m.error_rate > 1.5 || m.latency_p99 > 400) ? 'crit' : (m.error_rate > 0.5 || m.latency_p99 > 200) ? 'warn' : 'ok',
        meta: [
          m.latency_p99 != null ? `p99 ${m.latency_p99}ms` : 'p99 —',
          m.error_rate != null ? (m.error_rate > 0 ? `${m.error_rate}% err` : '0% err') : 'err —',
        ],
      } },
    { id: 'app', type: 'service', position: { x: 290, y: 80 },
      data: { name: 'FastAPI', port: ':8080', state: appCpu != null ? `${appCpu}% cpu` : '…', status: cpuStatus(appCpu), meta: ['uvicorn', (hasRedisMetrics || redisExpected) ? 'cache-aside' : 'no cache'] } },
    { id: 'postgres', type: 'service', position: { x: 560, y: 80 },
      data: { name: 'Postgres', port: ':5432', state: dbActive != null ? `${dbActive}/${dbMax} conn` : '…', status: dbStatus(dbActive, dbMax), meta: ['primary', '10M rows'] } },
  ]

  if (hasRedisMetrics || redisExpected) {
    const isPending = redisExpected && !hasRedisMetrics
    nodes.push({ id: 'redis', type: 'service', position: { x: 290, y: 240 },
      data: {
        name: 'Redis', port: ':6379',
        state: isPending ? 'starting…' : (hitRatio != null ? `${hitRatio}% hit` : '…'),
        status: isPending ? 'pending' : (hitRatio != null && hitRatio >= 80 ? 'ok' : hitRatio != null ? 'warn' : 'ok'),
        meta: ['cache', hasRedisMetrics && m.redis_memory_mb != null ? `${m.redis_memory_mb}MB` : '64MB'],
      } })
  }

  return nodes
}

function buildEdges(metrics, activeOptional = []) {
  const m = metrics || {}
  const hasRedisMetrics = m.redis_hit_ratio != null || m.redis_memory_mb != null
  const redisExpected = activeOptional.some(s => s.id === 'redis')
  const showRedis = hasRedisMetrics || redisExpected
  const redisPending = redisExpected && !hasRedisMetrics
  const dbActive = m.db_connections_active
  const dbMax = 20
  const dbStat = dbStatus(dbActive, dbMax)
  const dbEdgeColor = dbStat === 'crit' ? C.crit : dbStat === 'warn' ? C.warn : C.line3

  const edges = [
    { id: 'c-a', source: 'client', target: 'app', type: 'custom', data: { label: 'HTTPS' }, style: { stroke: C.line3, strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed } },
  ]

  if (showRedis) {
    edges.push({ id: 'a-r', source: 'app', target: 'redis', type: 'custom',
      data: { label: redisPending ? 'connecting…' : 'cache lookup' },
      style: { stroke: redisPending ? C.ink4 : C.ok, strokeWidth: redisPending ? 1 : 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed } })
    edges.push({ id: 'a-p', source: 'app', target: 'postgres', type: 'custom', data: { label: 'cache miss' }, style: { stroke: dbEdgeColor, strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed } })
  } else {
    edges.push({ id: 'a-p', source: 'app', target: 'postgres', type: 'custom', data: { label: 'all queries' }, style: { stroke: dbEdgeColor, strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } })
  }

  return edges
}

function footerMessage(metrics) {
  if (!metrics) return { text: 'waiting for metrics…', color: C.ink4 }
  if (metrics.error) return { text: metrics.error, color: C.warn }
  const dbPct = (metrics.db_connections_active ?? 0) / 20
  if (dbPct >= 0.9) return { text: 'pool saturated', color: C.crit }
  if (dbPct >= 0.6) return { text: 'pool pressure building', color: C.warn }
  if (metrics.redis_hit_ratio != null && metrics.redis_hit_ratio >= 85) return { text: 'cache healthy', color: C.ok }
  if (metrics.redis_hit_ratio != null) return { text: 'cache warming up', color: C.warn }
  return { text: 'system nominal', color: C.ok }
}

export default function DiagramPanel({ traffic = 2340 }) {
  const { metrics, scenario, currentState, transitioning, onTransitionState, sessionId } = useContext(SessionCtx)
  const [inspectedId, setInspectedId] = useState(null)
  const [addAnchor, setAddAnchor] = useState(null)

  const addable = getAddableServices(scenario, currentState)
  const removable = getRemovableServices(scenario, currentState)

  const initNodes = buildNodes(traffic, metrics, removable)
  const initEdges = buildEdges(metrics, removable)
  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges)

  useEffect(() => {
    setNodes(prev => {
      const fresh = buildNodes(traffic, metrics, removable)
      return fresh.map(fn => {
        const existing = prev.find(p => p.id === fn.id)
        if (existing) return { ...existing, data: { ...existing.data, ...fn.data } }
        return fn
      })
    })
    setEdges(buildEdges(metrics, removable))
  }, [metrics, traffic, currentState])

  // History stack — only push on intentional structural changes
  const historyRef = useRef([{ nodes: initNodes, edges: initEdges }])
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
    if (isCoreSevice(scenario, id)) return
    const svc = removable.find(s => s.id === id)
    if (svc) {
      onTransitionState(svc.removeState)
      return
    }
    setNodes(curr => {
      const updated = curr.filter(n => n.id !== id)
      setEdges(currE => {
        const filtered = currE.filter(e => e.source !== id && e.target !== id)
        pushHistory(updated, filtered)
        return filtered
      })
      return updated
    })
  }, [setNodes, setEdges, pushHistory, scenario, removable, onTransitionState])

  const handleEdgeDelete = useCallback((id) => {
    setEdges(curr => {
      const updated = curr.filter(e => e.id !== id)
      pushHistory(nodes, updated)
      return updated
    })
  }, [setEdges, nodes, pushHistory])

  // Memoize decorated arrays — only re-decorate when nodes/edges or callback identity changes
  const removableIds = new Set(removable.map(s => s.id))
  const decoratedNodes = useMemo(
    () => nodes.map(n => ({
      ...n,
      data: { ...n.data, onDelete: handleNodeDelete, deletable: removableIds.has(n.id) },
    })),
    [nodes, handleNodeDelete, currentState]
  )
  const decoratedEdges = useMemo(
    () => edges.map(e => ({ ...e, data: { ...(e.data || {}), onDelete: handleEdgeDelete } })),
    [edges, handleEdgeDelete]
  )

  const onConnect = useCallback((connection) => {
    const newEdge = { ...connection, id: `e-${Date.now()}`, type: 'custom', data: { label: 'data' }, style: { stroke: C.line3, strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed } }
    const updated = addEdge(newEdge, edges)
    setEdges(updated)
    pushHistory(nodes, updated)
  }, [edges, nodes, setEdges, pushHistory])

  const onNodesDelete = useCallback((deleted) => {
    for (const n of deleted) {
      if (isCoreSevice(scenario, n.id)) return
      const svc = removable.find(s => s.id === n.id)
      if (svc) { onTransitionState(svc.removeState); return }
    }
    const ids = deleted.map(n => n.id)
    const updatedNodes = nodes.filter(n => !ids.includes(n.id))
    const updatedEdges = edges.filter(e => !ids.includes(e.source) && !ids.includes(e.target))
    pushHistory(updatedNodes, updatedEdges)
  }, [nodes, edges, pushHistory, scenario, removable, onTransitionState])

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
        {addable.length > 0 && (
          <>
            <Tooltip title="Add service to architecture">
              <span>
                <Button
                  size="small"
                  onClick={(e) => setAddAnchor(e.currentTarget)}
                  startIcon={transitioning ? <CircularProgress size={12} /> : <AddIcon />}
                  disabled={transitioning}
                  sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                >
                  Add
                </Button>
              </span>
            </Tooltip>
            <Menu anchorEl={addAnchor} open={Boolean(addAnchor)} onClose={() => setAddAnchor(null)}>
              {addable.map(svc => (
                <MenuItem
                  key={svc.id}
                  onClick={() => {
                    setAddAnchor(null)
                    onTransitionState(svc.addState)
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ fontFamily: '"JetBrains Mono"', fontSize: '0.8125rem' }}>{svc.name}</Box>
                    <Box sx={{ fontFamily: '"JetBrains Mono"', fontSize: '0.625rem', color: C.ink4 }}>{svc.port}</Box>
                  </Box>
                </MenuItem>
              ))}
            </Menu>
          </>
        )}
        <Tooltip title="Undo (⌘Z)"><span><Button size="small" onClick={undo} disabled={!canUndo} sx={{ minWidth: 'auto', p: 0.5 }}><UndoIcon sx={{ fontSize: '16px' }} /></Button></span></Tooltip>
        <Tooltip title="Redo (⌘⇧Z)"><span><Button size="small" onClick={redo} disabled={!canRedo} sx={{ minWidth: 'auto', p: 0.5 }}><RedoIcon sx={{ fontSize: '16px' }} /></Button></span></Tooltip>
        {transitioning && <Box sx={{ fontFamily: '"JetBrains Mono"', fontSize: '0.625rem', color: C.warn, display: 'flex', alignItems: 'center', gap: 0.75 }}><CircularProgress size={10} sx={{ color: C.warn }} /> switching infrastructure…</Box>}
        <Box sx={{ ml: 'auto', fontFamily: '"JetBrains Mono"', fontSize: '0.625rem', color: C.ink4 }}>
          {addable.length > 0 ? 'add service to fix · × to remove' : 'live infrastructure · click to inspect'}
        </Box>
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
        {(() => { const f = footerMessage(metrics); return (<>
          <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: f.color, ...(f.color === C.crit ? { animation: 'pulse 1.2s infinite' } : {}) }} />
          <Box sx={{ fontFamily: '"JetBrains Mono"', fontSize: '0.5625rem', color: f.color }}>{f.text}</Box>
        </>)})()}
      </Box>

      <Inspector
        node={inspectedId ? nodes.find(n => n.id === inspectedId) : null}
        onClose={() => setInspectedId(null)}
        onRename={handleRename}
        sessionId={sessionId}
        metrics={metrics}
      />
    </Box>
  )
}

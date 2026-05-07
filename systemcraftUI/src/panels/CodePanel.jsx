import { useState, useRef, useCallback, useEffect, useMemo, useContext } from 'react'
import { Box, Tooltip, IconButton, Modal } from '@mui/material'
import Editor from '@monaco-editor/react'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import SearchIcon from '@mui/icons-material/Search'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import TuneIcon from '@mui/icons-material/Tune'
import { C } from '../theme'
import { SessionCtx } from '../components/Session'
import { applyConfig } from '../lib/api'

let cssInjected = false
function injectMonacoCss() {
  if (cssInjected) return
  cssInjected = true
  const style = document.createElement('style')
  style.textContent = `
    .todo-line-highlight { background: rgba(251,191,36,0.07) !important; border-left: 2px solid #fbbf24 !important; }
    .todo-glyph {
      background: #fbbf24;
      border-radius: 50%;
      width: 8px !important;
      height: 8px !important;
      margin-top: 7px !important;
      margin-left: 3px !important;
      cursor: pointer;
    }
  `
  document.head.appendChild(style)
}

const EDITOR_THEMES = [
  { value: 'sc-dark', label: 'SystemCraft Dark' },
  { value: 'vs-dark', label: 'VS Dark' },
  { value: 'vs', label: 'VS Light' },
  { value: 'hc-black', label: 'High Contrast' },
]

const EDITOR_TYPES = [
  { value: 'default', label: 'Default' },
  { value: 'vim', label: 'Vim', soon: true },
  { value: 'emacs', label: 'Emacs', soon: true },
]

const DEFAULT_SETTINGS = {
  theme: 'sc-dark',
  fontSize: 13,
  tabSize: 2,
  wordWrap: 'off',
  minimap: false,
  editorType: 'default',
}

function loadSettings() {
  try {
    const s = localStorage.getItem('sc_editor_settings')
    return s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : DEFAULT_SETTINGS
  } catch { return DEFAULT_SETTINGS }
}

function saveSettings(s) {
  try { localStorage.setItem('sc_editor_settings', JSON.stringify(s)) } catch {}
}

const SC_DARK_THEME = {
  base: 'vs-dark', inherit: true,
  rules: [
    { token: 'comment', foreground: 'a0a8c4', fontStyle: 'italic' },
    { token: 'keyword', foreground: '818cf8' },
    { token: 'string', foreground: '34d399' },
    { token: 'number', foreground: 'fbbf24' },
    { token: 'type.identifier', foreground: '60a5fa' },
  ],
  colors: {
    'editor.background': '#1c1f2e',
    'editor.foreground': '#f0f2f8',
    'editorLineNumber.foreground': '#8088a8',
    'editorLineNumber.activeForeground': '#d4dcee',
    'editor.selectionBackground': '#303650',
    'editor.lineHighlightBackground': '#22263688',
    'editorCursor.foreground': '#60a5fa',
    'editorGutter.background': '#1c1f2e',
    'editorWidget.background': '#161922',
    'editorSuggestWidget.background': '#1c1f2e',
    'editorSuggestWidget.border': '#303650',
    'input.background': '#161922',
    'input.border': '#303650',
  },
}

const FILES = {
  'app/cache.py': {
    language: 'python',
    content: `import redis
import os
import random
import logging

logger = logging.getLogger(__name__)

redis_client = redis.Redis(
    host=os.getenv("REDIS_HOST", "redis"),
    port=6379,
    db=0,
    decode_responses=True,
    socket_connect_timeout=2,
    socket_timeout=2,
)

# TODO: TTL is fixed — every key expires at the same time.
# When cache fills and all 300s timers fire simultaneously,
# every concurrent request slams Postgres at once (thundering herd).
# How would you introduce variance so expiry is staggered?
CACHE_TTL = 300


def get_url(short_code: str):
    """Retrieve redirect URL from cache. Returns None on miss."""
    try:
        cached = redis_client.get(f"url:{short_code}")
        if cached:
            logger.debug("cache_hit key=%s", short_code)
        return cached
    except redis.RedisError as e:
        logger.warning("redis_error on get: %s", e)
        return None


def set_url(short_code: str, url: str) -> None:
    """Store URL in cache. TTL is fixed — see TODO above."""
    try:
        ttl = CACHE_TTL   # ← all keys get identical TTL → expire together
        redis_client.setex(f"url:{short_code}", ttl, url)
        logger.debug("cache_set key=%s ttl=%d", short_code, ttl)
    except redis.RedisError as e:
        logger.warning("redis_error on set: %s", e)


def invalidate_url(short_code: str) -> None:
    """Remove URL from cache on write/delete."""
    try:
        redis_client.delete(f"url:{short_code}")
    except redis.RedisError:
        pass


def get_stats() -> dict:
    """Return cache performance stats."""
    try:
        info = redis_client.info("stats")
        hits = info.get("keyspace_hits", 0)
        misses = info.get("keyspace_misses", 0)
        total = hits + misses
        return {
            "hits": hits,
            "misses": misses,
            "hit_ratio": round(hits / max(1, total), 4),
            "ops_per_sec": info.get("instantaneous_ops_per_sec", 0),
        }
    except redis.RedisError:
        return {"hits": 0, "misses": 0, "hit_ratio": 0, "ops_per_sec": 0}
`,
  },
  'app/main.py': {
    language: 'python',
    content: `from fastapi import FastAPI, HTTPException
from fastapi.responses import RedirectResponse
import databases
import os
from cache import get_url, set_url

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@postgres/urldb")

# TODO: DB_POOL_SIZE is set to 95 out of max_connections=100.
# This leaves almost no headroom. At traffic spikes, the pool
# saturates before CPU does. What would you change here?
DB_POOL_SIZE = 95

app = FastAPI()
database = databases.Database(DATABASE_URL, min_size=2, max_size=DB_POOL_SIZE)


@app.on_event("startup")
async def startup():
    await database.connect()


@app.on_event("shutdown")
async def shutdown():
    await database.disconnect()


@app.get("/{short_code}")
async def redirect(short_code: str):
    cached = get_url(short_code)
    if cached:
        return RedirectResponse(url=cached)

    query = "SELECT long_url FROM urls WHERE short_code = :code"
    row = await database.fetch_one(query=query, values={"code": short_code})
    if not row:
        raise HTTPException(status_code=404, detail="URL not found")

    set_url(short_code, row["long_url"])
    return RedirectResponse(url=row["long_url"])


@app.get("/health")
async def health():
    return {"status": "ok"}
`,
  },
  'postgres/postgresql.conf': {
    language: 'ini',
    content: `# PostgreSQL configuration — url_shortener / state0_baseline
# Engineered for connection exhaustion, not CPU saturation.

listen_addresses = '*'
port = 5432

# TODO: max_connections is intentionally low here.
# Combined with DB_POOL_SIZE=95 in the app, the connection
# pool saturates before CPU does — which is the intended failure mode.
# What is the proper fix: raise this limit or add a proxy?
max_connections = 100

shared_buffers = 128MB
effective_cache_size = 512MB
work_mem = 4MB
maintenance_work_mem = 64MB

log_min_duration_statement = 500
log_connections = on
log_disconnections = on
log_lock_waits = on

wal_level = replica
max_wal_size = 1GB
`,
  },
}

const FILE_TREE = [
  {
    name: 'app',
    children: [
      { name: 'cache.py', path: 'app/cache.py', hasTodo: true },
      { name: 'main.py', path: 'app/main.py', hasTodo: true },
    ],
  },
  {
    name: 'postgres',
    children: [
      { name: 'postgresql.conf', path: 'postgres/postgresql.conf', hasTodo: true },
    ],
  },
]

function getTodoLines(content) {
  return content.split('\n').reduce((acc, line, i) => {
    if (line.includes('# TODO:')) acc.push(i + 1)
    return acc
  }, [])
}

function FileTree({ activeFile, onSelect, applied }) {
  const [expanded, setExpanded] = useState({ app: true, postgres: true })

  return (
    <Box sx={{ py: 0.5 }}>
      {FILE_TREE.map(dir => (
        <Box key={dir.name}>
          <Box
            onClick={() => setExpanded(e => ({ ...e, [dir.name]: !e[dir.name] }))}
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.75,
              px: 1.5, py: 0.5, cursor: 'pointer',
              '&:hover': { bgcolor: C.bg3 },
            }}
          >
            <Box sx={{ fontSize: '0.5rem', color: C.ink4, transform: expanded[dir.name] ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', lineHeight: 1 }}>▶</Box>
            <FolderOpenIcon sx={{ fontSize: 12, color: C.warn + 'aa' }} />
            <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem', color: C.ink3 }}>{dir.name}</Box>
          </Box>
          {expanded[dir.name] && dir.children.map(file => (
            <Box
              key={file.path}
              onClick={() => onSelect(file.path)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.75,
                pl: 3.5, pr: 1.5, py: 0.5, cursor: 'pointer',
                bgcolor: activeFile === file.path ? C.accentSoft : 'transparent',
                borderRight: activeFile === file.path ? `2px solid ${C.accent}` : '2px solid transparent',
                '&:hover': { bgcolor: activeFile === file.path ? C.accentSoft : C.bg3 },
              }}
            >
              <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem', color: activeFile === file.path ? C.ink1 : C.ink3, flex: 1 }}>
                {file.name}
              </Box>
              {file.hasTodo && !applied && (
                <Box sx={{
                  fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5rem',
                  color: C.warn, bgcolor: C.warnSoft, border: `1px solid ${C.warn}33`,
                  borderRadius: 0.5, px: 0.5, lineHeight: 1.6,
                }}>
                  TODO
                </Box>
              )}
              {file.hasTodo && applied && (
                <Box sx={{ fontSize: '0.5625rem', color: C.ok }}>✓</Box>
              )}
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  )
}

export default function CodePanel({ onApply, onContextChange, onAiOpen }) {
  const { sessionId } = useContext(SessionCtx)
  const [activeFile, setActiveFile] = useState('app/cache.py')
  const [applied, setApplied] = useState(false)
  const [explorerOpen, setExplorerOpen] = useState(true)
  const [fileContents, setFileContents] = useState(() =>
    Object.fromEntries(Object.entries(FILES).map(([k, v]) => [k, v.content]))
  )
  const [todoLines, setTodoLines] = useState({})
  const [todoIndex, setTodoIndex] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState(loadSettings)

  const editorRef = useRef(null)
  const monacoRef = useRef(null)
  const decorationsRef = useRef(null)
  const tabsScrollRef = useRef(null)
  const [openTabs, setOpenTabs] = useState(['app/cache.py'])

  const file = FILES[activeFile]

  const openTab = useCallback((path) => {
    setOpenTabs(prev => prev.includes(path) ? prev : [...prev, path])
    setActiveFile(path)
    setTodoIndex(0)
  }, [])

  const closeTab = useCallback((path, e) => {
    e.stopPropagation()
    setOpenTabs(prev => {
      const next = prev.filter(p => p !== path)
      if (activeFile === path && next.length > 0) setActiveFile(next[next.length - 1])
      return next
    })
  }, [activeFile])

  const applyDecorations = useCallback(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return

    const content = fileContents[activeFile] || ''
    const lines = getTodoLines(content)
    setTodoLines(prev => ({ ...prev, [activeFile]: lines }))

    if (decorationsRef.current) decorationsRef.current.clear()

    if (lines.length > 0 && !applied) {
      decorationsRef.current = editor.createDecorationsCollection(
        lines.map(ln => ({
          range: new monaco.Range(ln, 1, ln + 3, 1),
          options: {
            isWholeLine: true,
            className: 'todo-line-highlight',
            glyphMarginClassName: 'todo-glyph',
            glyphMarginHoverMessage: { value: '**TODO** — this is the line to fix' },
          },
        }))
      )
    }
  }, [activeFile, fileContents, applied])

  const allTodos = useMemo(() => {
    return Object.entries(todoLines).flatMap(([f, lines]) =>
      lines.map(line => ({ file: f, line }))
    ).sort((a, b) => {
      const order = Object.keys(FILES)
      return order.indexOf(a.file) - order.indexOf(b.file) || a.line - b.line
    }).map((t, idx) => ({ ...t, globalIdx: idx }))
  }, [todoLines])

  const jumpToTodo = useCallback((direction = 'next') => {
    const editor = editorRef.current
    if (!editor || allTodos.length === 0) return

    let idx = todoIndex
    if (direction === 'next') idx = (todoIndex + 1) % allTodos.length
    else if (direction === 'prev') idx = (todoIndex - 1 + allTodos.length) % allTodos.length

    const todo = allTodos[idx]
    setTodoIndex(idx)
    setActiveFile(todo.file)
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.revealLineInCenter(todo.line)
        editorRef.current.setPosition({ lineNumber: todo.line, column: 1 })
        editorRef.current.focus()
      }
    }, 0)
  }, [allTodos, todoIndex])

  const openSearch = useCallback(() => {
    editorRef.current?.getAction('actions.find')?.run()
  }, [])

  const updateSetting = useCallback((key, value) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      saveSettings(next)
      return next
    })
  }, [])

  // Report active file context to Session-level AI panel
  useEffect(() => {
    if (onContextChange) {
      onContextChange({
        path: activeFile,
        content: fileContents[activeFile] || '',
        language: FILES[activeFile]?.language || 'text',
      })
    }
  }, [activeFile, onContextChange])

  function handleEditorWillMount(monaco) {
    injectMonacoCss()
    monaco.editor.defineTheme('sc-dark', SC_DARK_THEME)
  }

  function handleEditorDidMount(editor, monaco) {
    editorRef.current = editor
    monacoRef.current = monaco
    applyDecorations()
    setTimeout(() => jumpToTodo('current'), 100)
  }

  useEffect(() => {
    Object.entries(FILES).forEach(([path, f]) => {
      const lines = getTodoLines(f.content)
      setTodoLines(prev => ({ ...prev, [path]: lines }))
    })
  }, [])

  useEffect(() => {
    applyDecorations()
  }, [activeFile, applied, applyDecorations])

  async function handleApply() {
    const content = fileContents[activeFile] || ''
    if (sessionId) {
      try { await applyConfig(sessionId, activeFile, content) } catch {}
    }
    setApplied(true)
    setTodoIndex(0)
    if (decorationsRef.current) decorationsRef.current.clear()
    if (onApply) onApply()
  }

  const totalTodos = allTodos.length
  const hasTodo = totalTodos > 0 && !applied

  const scrollTabs = (dir) => {
    if (tabsScrollRef.current) tabsScrollRef.current.scrollLeft += dir * 120
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', bgcolor: C.bg1, overflow: 'hidden' }}>

      {/* File Explorer */}
      {explorerOpen && (
        <Box sx={{
          width: 160, flexShrink: 0,
          bgcolor: C.bg0,
          borderRight: `1px solid ${C.line1}`,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <Box sx={{ px: 1.5, py: 0.75, borderBottom: `1px solid ${C.line1}`, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem', color: C.ink4, letterSpacing: '0.06em', textTransform: 'uppercase', flex: 1 }}>Explorer</Box>
          </Box>
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            <FileTree activeFile={activeFile} onSelect={openTab} applied={applied} />
          </Box>
        </Box>
      )}

      {/* Editor area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {/* Toolbar */}
        <Box sx={{
          height: 34, flexShrink: 0,
          display: 'flex', alignItems: 'center',
          bgcolor: C.bg0, borderBottom: `1px solid ${C.line1}`,
          px: 0.5, gap: 0.5,
        }}>
          <Tooltip title="Toggle file explorer" arrow>
            <IconButton size="small" onClick={() => setExplorerOpen(e => !e)} sx={{ color: explorerOpen ? C.accent : C.ink4, p: 0.5 }}>
              <FolderOpenIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Search in file (Ctrl+F)" arrow>
            <IconButton size="small" onClick={openSearch} sx={{ color: C.ink4, p: 0.5, '&:hover': { color: C.ink2 } }}>
              <SearchIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Editor settings" arrow>
            <IconButton size="small" onClick={() => setSettingsOpen(true)} sx={{ color: C.ink4, p: 0.5, '&:hover': { color: C.ink2 } }}>
              <TuneIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          {hasTodo && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Tooltip title="Previous TODO" arrow>
                <Box
                  component="button"
                  onClick={() => jumpToTodo('prev')}
                  sx={{
                    fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem',
                    color: C.warn, bgcolor: C.warnSoft, border: `1px solid ${C.warn}44`,
                    borderRadius: 1, px: 0.75, py: 0.4, cursor: 'pointer',
                    display: 'flex', alignItems: 'center',
                    '&:hover': { bgcolor: 'rgba(251,191,36,0.18)' },
                  }}
                >
                  ← Prev
                </Box>
              </Tooltip>
              <Box sx={{
                fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem',
                color: C.warn, bgcolor: C.warnSoft, border: `1px solid ${C.warn}44`,
                borderRadius: 1, px: 0.75, py: 0.4,
              }}>
                {totalTodos > 0 ? todoIndex + 1 : 0}/{totalTodos}
              </Box>
              <Tooltip title="Next TODO" arrow>
                <Box
                  component="button"
                  onClick={() => jumpToTodo('next')}
                  sx={{
                    fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem',
                    color: C.warn, bgcolor: C.warnSoft, border: `1px solid ${C.warn}44`,
                    borderRadius: 1, px: 0.75, py: 0.4, cursor: 'pointer',
                    display: 'flex', alignItems: 'center',
                    '&:hover': { bgcolor: 'rgba(251,191,36,0.18)' },
                  }}
                >
                  Next →
                </Box>
              </Tooltip>
            </Box>
          )}
          {applied && (
            <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem', color: C.ok, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              ✓ fix applied
            </Box>
          )}

          {/* Tab scroll + tabs */}
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', overflow: 'hidden', ml: 0.5 }}>
            <IconButton size="small" onClick={() => scrollTabs(-1)} sx={{ color: C.ink4, p: 0.25, flexShrink: 0 }}>
              <ChevronLeftIcon sx={{ fontSize: 14 }} />
            </IconButton>
            <Box ref={tabsScrollRef} sx={{ display: 'flex', overflow: 'hidden', flex: 1, scrollBehavior: 'smooth' }}>
              {openTabs.map(path => {
                const fname = path.split('/').pop()
                const hasFTodo = getTodoLines(fileContents[path] || '').length > 0 && !applied
                return (
                  <Box
                    key={path}
                    onClick={() => setActiveFile(path)}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 0.75,
                      px: 1.5, py: 0, height: 34,
                      borderRight: `1px solid ${C.line1}`,
                      cursor: 'pointer',
                      bgcolor: activeFile === path ? C.bg1 : 'transparent',
                      color: activeFile === path ? C.ink1 : C.ink3,
                      position: 'relative', whiteSpace: 'nowrap', flexShrink: 0,
                      transition: 'color 0.15s',
                      '&:hover': { color: activeFile === path ? C.ink1 : C.ink2 },
                    }}
                  >
                    <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem' }}>{fname}</Box>
                    {hasFTodo && <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: C.warn, flexShrink: 0 }} />}
                    <Box
                      component="span"
                      onClick={(e) => closeTab(path, e)}
                      sx={{ fontSize: '0.75rem', color: C.ink4, lineHeight: 1, px: 0.25, '&:hover': { color: C.crit }, ml: 0.25 }}
                    >
                      ×
                    </Box>
                    {activeFile === path && <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, bgcolor: C.warn }} />}
                  </Box>
                )
              })}
            </Box>
            <IconButton size="small" onClick={() => scrollTabs(1)} sx={{ color: C.ink4, p: 0.25, flexShrink: 0 }}>
              <ChevronRightIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Box>
        </Box>

        {/* Breadcrumb */}
        <Box sx={{ px: 2, py: 0.5, bgcolor: C.bg1, borderBottom: `1px solid ${C.line1}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem', color: C.ink4 }}>
            {activeFile.split('/').join(' › ')}
          </Box>
          <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem', color: C.ink4 }}>
            {file?.language}
          </Box>
        </Box>

        {/* Editor + AI panel row */}
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

          {/* Monaco */}
          <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            {file && (
              <Editor
                height="100%"
                language={file.language}
                value={fileContents[activeFile]}
                theme={settings.theme}
                beforeMount={handleEditorWillMount}
                onMount={handleEditorDidMount}
                onChange={val => setFileContents(prev => ({ ...prev, [activeFile]: val || '' }))}
                options={{
                  fontSize: settings.fontSize,
                  fontFamily: '"JetBrains Mono", monospace',
                  tabSize: settings.tabSize,
                  lineNumbers: 'on',
                  glyphMargin: true,
                  minimap: { enabled: settings.minimap },
                  scrollBeyondLastLine: false,
                  wordWrap: settings.wordWrap,
                  folding: true,
                  renderLineHighlight: 'line',
                  lineDecorationsWidth: 2,
                  lineNumbersMinChars: 3,
                  padding: { top: 8, bottom: 8 },
                  smoothScrolling: true,
                  cursorBlinking: 'smooth',
                  bracketPairColorization: { enabled: true },
                  find: { autoFindInSelection: 'multiline' },
                }}
              />
            )}
          </Box>

        </Box>

        {/* Apply bar */}
        <Box sx={{
          px: 2, py: 1.25,
          borderTop: `1px solid ${C.line1}`,
          bgcolor: applied ? C.okSoft : C.bg1,
          flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 2,
          transition: 'background 0.3s',
        }}>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ fontSize: '0.875rem', fontWeight: 500, color: applied ? C.ok : C.ink2, lineHeight: 1.4 }}>
              {applied
                ? '✓ Config applied — container hot-reloading. Verify with TTL url:abc123 in the Redis terminal.'
                : hasTodo
                  ? 'Find the ⚠ TODO in the file. Edit inline, then click Apply to hot-reload the container.'
                  : 'Edit the file above, then click Apply to push changes into the container.'}
            </Box>
          </Box>
          <Box
            component="button"
            onClick={handleApply}
            disabled={applied}
            sx={{
              fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8125rem', fontWeight: 600,
              color: applied ? C.ok : C.bg0,
              bgcolor: applied ? 'transparent' : C.accent,
              border: `1px solid ${applied ? C.ok + '55' : C.accent}`,
              borderRadius: 1, px: 2.5, py: 1,
              cursor: applied ? 'default' : 'pointer',
              flexShrink: 0,
              transition: 'all 0.15s',
              '&:hover:not(:disabled)': { opacity: 0.88 },
            }}
          >
            {applied ? '✓ Applied' : 'Apply Changes →'}
          </Box>
        </Box>
      </Box>

      {/* Editor settings modal */}
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Box sx={{
          bgcolor: C.bg1, border: `1px solid ${C.line1}`, borderRadius: 2,
          p: 2.5, width: '90%', maxWidth: 420,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}>
          <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem', color: C.ink4, mb: 2, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Editor Settings
          </Box>

          {/* Theme */}
          <Box sx={{ mb: 2 }}>
            <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem', color: C.ink4, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Theme</Box>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {EDITOR_THEMES.map(t => (
                <Box
                  key={t.value}
                  component="button"
                  onClick={() => updateSetting('theme', t.value)}
                  sx={{
                    fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem',
                    px: 1.25, py: 0.6, borderRadius: 1, cursor: 'pointer',
                    border: `1px solid ${settings.theme === t.value ? C.accent : C.line2}`,
                    bgcolor: settings.theme === t.value ? C.accentSoft : 'transparent',
                    color: settings.theme === t.value ? C.accent : C.ink3,
                    transition: 'all 0.12s',
                    '&:hover': { borderColor: C.accentLine, color: C.ink2 },
                  }}
                >
                  {t.label}
                </Box>
              ))}
            </Box>
          </Box>

          {/* Editor type */}
          <Box sx={{ mb: 2 }}>
            <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem', color: C.ink4, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Keybindings</Box>
            <Box sx={{ display: 'flex', gap: 0.75 }}>
              {EDITOR_TYPES.map(t => (
                <Tooltip key={t.value} title={t.soon ? 'Requires monaco-vim / monaco-emacs package' : ''} arrow>
                  <Box
                    component="button"
                    onClick={() => !t.soon && updateSetting('editorType', t.value)}
                    sx={{
                      fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem',
                      px: 1.25, py: 0.6, borderRadius: 1,
                      cursor: t.soon ? 'not-allowed' : 'pointer',
                      border: `1px solid ${settings.editorType === t.value && !t.soon ? C.accent : C.line2}`,
                      bgcolor: settings.editorType === t.value && !t.soon ? C.accentSoft : 'transparent',
                      color: t.soon ? C.ink4 : (settings.editorType === t.value ? C.accent : C.ink3),
                      opacity: t.soon ? 0.5 : 1,
                      transition: 'all 0.12s',
                      display: 'flex', alignItems: 'center', gap: 0.5,
                      '&:hover:not(:disabled)': { borderColor: t.soon ? C.line2 : C.accentLine },
                    }}
                  >
                    {t.label}
                    {t.soon && <Box component="span" sx={{ fontSize: '0.5rem', color: C.ink4 }}>soon</Box>}
                  </Box>
                </Tooltip>
              ))}
            </Box>
          </Box>

          {/* Font size */}
          <Box sx={{ mb: 2 }}>
            <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem', color: C.ink4, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Font Size — {settings.fontSize}px
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
              {[10, 11, 12, 13, 14, 15, 16, 18, 20].map(sz => (
                <Box
                  key={sz}
                  component="button"
                  onClick={() => updateSetting('fontSize', sz)}
                  sx={{
                    fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem',
                    width: 30, height: 26, borderRadius: 1, cursor: 'pointer',
                    border: `1px solid ${settings.fontSize === sz ? C.accent : C.line2}`,
                    bgcolor: settings.fontSize === sz ? C.accentSoft : 'transparent',
                    color: settings.fontSize === sz ? C.accent : C.ink3,
                    transition: 'all 0.12s',
                    '&:hover': { borderColor: C.accentLine, color: C.ink2 },
                  }}
                >
                  {sz}
                </Box>
              ))}
            </Box>
          </Box>

          {/* Tab size */}
          <Box sx={{ mb: 2 }}>
            <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem', color: C.ink4, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tab Size</Box>
            <Box sx={{ display: 'flex', gap: 0.75 }}>
              {[2, 4].map(ts => (
                <Box
                  key={ts}
                  component="button"
                  onClick={() => updateSetting('tabSize', ts)}
                  sx={{
                    fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem',
                    px: 1.5, py: 0.6, borderRadius: 1, cursor: 'pointer',
                    border: `1px solid ${settings.tabSize === ts ? C.accent : C.line2}`,
                    bgcolor: settings.tabSize === ts ? C.accentSoft : 'transparent',
                    color: settings.tabSize === ts ? C.accent : C.ink3,
                    transition: 'all 0.12s',
                    '&:hover': { borderColor: C.accentLine, color: C.ink2 },
                  }}
                >
                  {ts} spaces
                </Box>
              ))}
            </Box>
          </Box>

          {/* Toggles */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 2 }}>
            {[
              { key: 'wordWrap', label: 'Word wrap', on: 'on', off: 'off', current: settings.wordWrap === 'on' },
              { key: 'minimap', label: 'Minimap', on: true, off: false, current: settings.minimap },
            ].map(({ key, label, on, off, current }) => (
              <Box key={key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5 }}>
                <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem', color: C.ink2 }}>{label}</Box>
                <Box
                  component="button"
                  onClick={() => updateSetting(key, current ? off : on)}
                  sx={{
                    width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
                    bgcolor: current ? C.accent : C.line2, border: 'none',
                    position: 'relative', transition: 'background 0.2s',
                    '&::after': {
                      content: '""', position: 'absolute',
                      top: 3, left: current ? 21 : 3,
                      width: 16, height: 16, borderRadius: '50%',
                      bgcolor: 'white', transition: 'left 0.2s',
                    },
                  }}
                />
              </Box>
            ))}
          </Box>

          {/* Reset + Done */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Box
              component="button"
              onClick={() => { setSettings(DEFAULT_SETTINGS); saveSettings(DEFAULT_SETTINGS) }}
              sx={{
                fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem',
                color: C.ink3, bgcolor: 'transparent', border: `1px solid ${C.line2}`,
                borderRadius: 1, px: 1.5, py: 0.75, cursor: 'pointer', flex: 1,
                '&:hover': { borderColor: C.line3, color: C.ink2 },
              }}
            >
              Reset defaults
            </Box>
            <Box
              component="button"
              onClick={() => setSettingsOpen(false)}
              sx={{
                fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem', fontWeight: 600,
                color: C.bg0, bgcolor: C.accent, border: 'none',
                borderRadius: 1, px: 2, py: 0.75, cursor: 'pointer', flex: 1,
                '&:hover': { opacity: 0.88 },
              }}
            >
              Done
            </Box>
          </Box>
        </Box>
      </Modal>
    </Box>
  )
}

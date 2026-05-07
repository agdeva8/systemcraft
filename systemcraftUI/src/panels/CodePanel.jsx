import { useState, useRef, useCallback, useEffect } from 'react'
import { Box, Chip, Tooltip, IconButton } from '@mui/material'
import Editor from '@monaco-editor/react'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import SearchIcon from '@mui/icons-material/Search'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import { C } from '../theme'

// Inject Monaco glyph + line highlight CSS once
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

const SC_DARK_THEME = {
  base: 'vs-dark', inherit: true,
  rules: [
    { token: 'comment', foreground: '4a5568', fontStyle: 'italic' },
    { token: 'keyword', foreground: '818cf8' },
    { token: 'string', foreground: '34d399' },
    { token: 'number', foreground: 'fbbf24' },
    { token: 'type.identifier', foreground: '60a5fa' },
  ],
  colors: {
    'editor.background': '#1c1f2e',
    'editor.foreground': '#e8eaf0',
    'editorLineNumber.foreground': '#3d4459',
    'editorLineNumber.activeForeground': '#9ba3b8',
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

export default function CodePanel({ onApply }) {
  const [activeFile, setActiveFile] = useState('app/cache.py')
  const [applied, setApplied] = useState(false)
  const [explorerOpen, setExplorerOpen] = useState(true)
  const [fileContents, setFileContents] = useState(() =>
    Object.fromEntries(Object.entries(FILES).map(([k, v]) => [k, v.content]))
  )
  const [todoLines, setTodoLines] = useState({})
  const editorRef = useRef(null)
  const monacoRef = useRef(null)
  const decorationsRef = useRef(null)
  const tabsScrollRef = useRef(null)
  const [openTabs, setOpenTabs] = useState(['app/cache.py'])

  const file = FILES[activeFile]

  const openTab = useCallback((path) => {
    setOpenTabs(prev => prev.includes(path) ? prev : [...prev, path])
    setActiveFile(path)
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

    if (decorationsRef.current) {
      decorationsRef.current.clear()
    }

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

  const jumpToTodo = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const lines = todoLines[activeFile] || getTodoLines(fileContents[activeFile] || '')
    if (lines.length > 0) {
      editor.revealLineInCenter(lines[0])
      editor.setPosition({ lineNumber: lines[0], column: 1 })
      editor.focus()
    }
  }, [activeFile, todoLines, fileContents])

  const openSearch = useCallback(() => {
    const editor = editorRef.current
    if (editor) {
      editor.getAction('actions.find')?.run()
    }
  }, [])

  function handleEditorWillMount(monaco) {
    injectMonacoCss()
    monaco.editor.defineTheme('sc-dark', SC_DARK_THEME)
  }

  function handleEditorDidMount(editor, monaco) {
    editorRef.current = editor
    monacoRef.current = monaco
    applyDecorations()
    // Jump to first TODO on mount
    setTimeout(jumpToTodo, 100)
  }

  useEffect(() => {
    applyDecorations()
  }, [activeFile, applied, applyDecorations])

  function handleApply() {
    setApplied(true)
    if (decorationsRef.current) decorationsRef.current.clear()
    if (onApply) onApply()
  }

  const activeTodoLines = todoLines[activeFile] || []
  const hasTodo = activeTodoLines.length > 0 && !applied

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
          {hasTodo && (
            <Tooltip title="Jump to TODO comment" arrow>
              <Box
                component="button"
                onClick={jumpToTodo}
                sx={{
                  fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem',
                  color: C.warn, bgcolor: C.warnSoft, border: `1px solid ${C.warn}44`,
                  borderRadius: 1, px: 1.25, py: 0.4, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 0.5,
                  '&:hover': { bgcolor: 'rgba(251,191,36,0.18)' },
                }}
              >
                ⚠ Jump to TODO
              </Box>
            </Tooltip>
          )}
          {applied && (
            <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem', color: C.ok, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              ✓ fix applied
            </Box>
          )}

          {/* Tab scroll arrows + tabs */}
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', overflow: 'hidden', ml: 0.5 }}>
            <IconButton size="small" onClick={() => scrollTabs(-1)} sx={{ color: C.ink4, p: 0.25, flexShrink: 0 }}>
              <ChevronLeftIcon sx={{ fontSize: 14 }} />
            </IconButton>
            <Box
              ref={tabsScrollRef}
              sx={{ display: 'flex', overflow: 'hidden', flex: 1, scrollBehavior: 'smooth' }}
            >
              {openTabs.map(path => {
                const fname = path.split('/').pop()
                const fileTodos = getTodoLines(fileContents[path] || '')
                const hasFTodo = fileTodos.length > 0 && !applied
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
                      position: 'relative',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      transition: 'color 0.15s',
                      '&:hover': { color: activeFile === path ? C.ink1 : C.ink2 },
                    }}
                  >
                    <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem' }}>{fname}</Box>
                    {hasFTodo && (
                      <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: C.warn, flexShrink: 0 }} />
                    )}
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

        {/* Monaco editor */}
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {file && (
            <Editor
              height="100%"
              language={file.language}
              value={fileContents[activeFile]}
              theme="sc-dark"
              beforeMount={handleEditorWillMount}
              onMount={handleEditorDidMount}
              onChange={val => setFileContents(prev => ({ ...prev, [activeFile]: val || '' }))}
              options={{
                fontSize: 13,
                fontFamily: '"JetBrains Mono", monospace',
                lineNumbers: 'on',
                glyphMargin: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'off',
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
    </Box>
  )
}

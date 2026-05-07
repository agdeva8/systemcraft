const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001'

export async function fetchCatalog() {
  const res = await fetch(`${API_BASE}/api/catalog`)
  if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`)
  return res.json()
}

export async function createSession({ scenario, boot_state = null, concept_target = null }) {
  const res = await fetch(`${API_BASE}/api/session/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario, boot_state, concept_target }),
  })
  if (!res.ok) throw new Error(`session create failed: ${res.status}`)
  return res.json()
}

export async function destroySession(sessionId, useBeacon = false) {
  const url = `${API_BASE}/api/session/${sessionId}`
  if (useBeacon) {
    try {
      fetch(url, { method: 'DELETE', keepalive: true })
    } catch {}
    return
  }
  await fetch(url, { method: 'DELETE' })
}

export async function applyState(session_id, state) {
  const res = await fetch(`${API_BASE}/api/session/${session_id}/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  })
  return res.json()
}

export async function setTraffic(session_id, virtual_users) {
  const res = await fetch(`${API_BASE}/api/session/${session_id}/traffic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ virtual_users }),
  })
  return res.json()
}

export async function sendDiagnose(session_id, message, context) {
  const res = await fetch(`${API_BASE}/api/session/${session_id}/diagnose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context }),
  })
  return res.json()
}

export function streamAssist(session_id, message, history, code_context, terminal_context, { onToken, onDone, onError }) {
  const controller = new AbortController()
  ;(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/session/${session_id}/assist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, code_context, terminal_context }),
        signal: controller.signal,
      })
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.error) { onError?.(data.error); return }
            if (data.done) { onDone?.(); return }
            if (data.token) onToken?.(data.token)
          } catch {}
        }
      }
      onDone?.()
    } catch (err) {
      if (err.name !== 'AbortError') onError?.(err.message)
    }
  })()
  return () => controller.abort()
}

export async function fetchCheatsheet(session_id, service) {
  const res = await fetch(`${API_BASE}/api/session/${session_id}/cheatsheet/${service}`)
  return res.json()
}

export async function fetchCodefile(session_id, filename) {
  const res = await fetch(`${API_BASE}/api/session/${session_id}/codefile/${encodeURIComponent(filename)}`)
  return res.json()
}

export async function applyConfig(session_id, filename, content) {
  const res = await fetch(`${API_BASE}/api/session/${session_id}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, content }),
  })
  return res.json()
}

export async function fetchInternals(session_id, datastore) {
  const res = await fetch(`${API_BASE}/api/session/${session_id}/internals/${datastore}`)
  return res.json()
}

export function metricsEventSource(session_id) {
  return new EventSource(`${API_BASE}/api/session/${session_id}/metrics`)
}

export function logsEventSource(session_id) {
  return new EventSource(`${API_BASE}/api/session/${session_id}/logs`)
}

export async function fetchScaleConfig() {
  const res = await fetch(`${API_BASE}/api/config/scale`)
  if (!res.ok) return { vu_scale_factor: 10, max_actual_vus: 200, rps_per_vu: 15, display_scale: 10 }
  return res.json()
}

export function createHeartbeatWs(sessionId) {
  const wsBase = API_BASE.replace(/^http/, 'ws')
  const url = `${wsBase}/api/session/${sessionId}/heartbeat`
  let ws = null
  let pingInterval = null
  let retries = 0
  let destroyed = false

  function connect() {
    if (destroyed) return
    ws = new WebSocket(url)

    ws.onopen = () => {
      retries = 0
      pingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send('ping')
        }
      }, 10000)
    }

    ws.onclose = () => {
      clearInterval(pingInterval)
      if (!destroyed && retries < 5) {
        retries++
        setTimeout(connect, 2000)
      }
    }

    ws.onerror = () => {}
  }

  connect()

  return {
    getWs: () => ws,
    cleanup: () => {
      destroyed = true
      clearInterval(pingInterval)
      if (ws && ws.readyState <= WebSocket.OPEN) {
        ws.close()
      }
    },
  }
}

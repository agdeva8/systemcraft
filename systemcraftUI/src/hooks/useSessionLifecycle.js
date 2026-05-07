import { useState, useEffect, useRef, useCallback } from 'react'
import { createHeartbeatWs, destroySession } from '../lib/api'

export function useSessionLifecycle(sessionId) {
  const [isConnected, setIsConnected] = useState(false)
  const heartbeatRef = useRef(null)
  const hiddenTimerRef = useRef(null)

  useEffect(() => {
    if (!sessionId) return

    const hb = createHeartbeatWs(sessionId)
    heartbeatRef.current = hb

    const checkConnection = setInterval(() => {
      const ws = hb.getWs()
      setIsConnected(ws && ws.readyState === WebSocket.OPEN)
    }, 3000)

    const handleBeforeUnload = () => {
      destroySession(sessionId, true)
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenTimerRef.current = setTimeout(() => {
          destroySession(sessionId, true)
        }, 60000)
      } else {
        if (hiddenTimerRef.current) {
          clearTimeout(hiddenTimerRef.current)
          hiddenTimerRef.current = null
        }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(checkConnection)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (hiddenTimerRef.current) clearTimeout(hiddenTimerRef.current)
      if (heartbeatRef.current) heartbeatRef.current.cleanup()
    }
  }, [sessionId])

  return { isConnected }
}

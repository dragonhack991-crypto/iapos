'use client'

import { useEffect, useRef } from 'react'

interface SessionGuardProps {
  timeoutMinutes?: number
}

export default function SessionGuard({ timeoutMinutes = 60 }: SessionGuardProps) {
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    const timeoutMs = timeoutMinutes * 60 * 1000

    async function handleTimeout() {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'timeout' }),
          keepalive: true,
        })
      } finally {
        window.location.replace('/login?reason=timeout')
      }
    }

    function resetTimer() {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
      timeoutRef.current = window.setTimeout(() => {
        void handleTimeout()
      }, timeoutMs)
    }

    const events: Array<keyof WindowEventMap> = [
      'click',
      'keydown',
      'mousemove',
      'touchstart',
      'scroll',
    ]

    for (const eventName of events) {
      window.addEventListener(eventName, resetTimer, { passive: true })
    }
    resetTimer()

    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
      for (const eventName of events) {
        window.removeEventListener(eventName, resetTimer)
      }
    }
  }, [timeoutMinutes])

  return null
}

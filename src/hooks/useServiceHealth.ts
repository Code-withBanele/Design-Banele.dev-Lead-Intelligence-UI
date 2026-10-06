import { useCallback, useEffect, useMemo, useState } from "react"

import { getSystemHealth } from "@/services/api/system"

import type { SystemHealthResponse } from "@/types"

export function useServiceHealth() {
  const [health, setHealth] = useState<SystemHealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const nextHealth = await getSystemHealth()
      setHealth(nextHealth)
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Unable to reach the backend health endpoint."
      setError(message)
      setHealth(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()

    const intervalId = window.setInterval(() => {
      void refresh()
    }, 30000)

    return () => window.clearInterval(intervalId)
  }, [refresh])

  return useMemo(
    () => ({
      health,
      loading,
      error,
      refresh,
    }),
    [error, health, loading, refresh],
  )
}

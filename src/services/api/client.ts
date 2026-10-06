export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api"

export const apiClient = {
  baseUrl: API_BASE_URL,

  headers: {
    "Content-Type": "application/json",
  },
}

export async function fetchJson<T>(
  input: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${apiClient.baseUrl}${input}`, {
    ...init,
    headers: {
      ...apiClient.headers,
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error((payload as { message?: string }).message ?? "Request failed.")
  }

  return (await response.json()) as T
}

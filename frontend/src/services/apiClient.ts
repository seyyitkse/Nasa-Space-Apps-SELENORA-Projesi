import axios, { AxiosError } from 'axios'

import type { ApiErrorBody } from '@/types/api'

/**
 * Single HTTP client. The base URL is public configuration only — the frontend
 * never holds API keys (DeepSeek/NASA credentials live in the backend).
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 20_000,
  headers: { Accept: 'application/json' },
})

export class ApiError extends Error {
  readonly status: number | null
  readonly code: string
  readonly details: unknown
  readonly requestId: string | null

  constructor(opts: {
    message: string
    status: number | null
    code: string
    details?: unknown
    requestId?: string | null
  }) {
    super(opts.message)
    this.name = 'ApiError'
    this.status = opts.status
    this.code = opts.code
    this.details = opts.details
    this.requestId = opts.requestId ?? null
  }

  get isNetwork() {
    return this.status === null
  }
  get isNotImplemented() {
    return this.status === 501
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  if (err instanceof AxiosError) {
    const body = (err.response?.data as { error?: ApiErrorBody } | undefined)?.error
    if (body) {
      return new ApiError({
        message: body.message,
        status: err.response?.status ?? null,
        code: body.code,
        details: body.details,
        requestId: body.request_id,
      })
    }
    if (!err.response) {
      return new ApiError({
        message: 'The SELENORA API is unreachable. Is the backend running on port 8000?',
        status: null,
        code: 'NETWORK_ERROR',
      })
    }
    return new ApiError({
      message: err.message,
      status: err.response.status,
      code: 'HTTP_ERROR',
    })
  }
  return new ApiError({ message: String(err), status: null, code: 'UNKNOWN' })
}

api.interceptors.response.use(
  (r) => r,
  (err: unknown) => Promise.reject(toApiError(err)),
)

import { CookieJar } from 'tough-cookie'
import { $fetch, FetchError } from 'ofetch'

interface IClientData {
  email: string
  down: number
  up: number
  online: boolean
}
const jar = new CookieJar()

interface IXuiResponse {
  success: boolean
  msg: string
  obj: unknown
}

interface IXuiCsrfResponse extends IXuiResponse {
  obj: string
}

interface IXuiStatsResponse extends IXuiResponse {
  obj: {
    clientStats: {
      email: string
      down: number
      up: number
    }[]
  }[]
}

interface IXuiOnlinesResponse extends IXuiResponse {
  obj: string[]
}

const loginUrl = new URL('./login', process.env.XUI_ORIGIN)
const csrfUrl = new URL('./csrf-token', process.env.XUI_ORIGIN)
const statsUrl = new URL('./panel/api/inbounds/list', process.env.XUI_ORIGIN)
const onlinesUrl = new URL('./panel/api/clients/onlines', process.env.XUI_ORIGIN)

const globalHeaders: Record<string, string> = {}
if (process.env.XUI_BASIC_AUTH) {
  globalHeaders['Authorization'] = `Basic ${btoa(process.env.XUI_BASIC_AUTH)}`
}
if (process.env.XUI_WEB_DOMAIN) {
  globalHeaders['Host'] = process.env.XUI_WEB_DOMAIN
}

const REQUEST_TIMEOUT_MS = 15_000
const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 1_000

/** Sleep helper. */
function sleep (ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Capture any Set-Cookie headers from a response into the cookie jar. */
function captureCookies (responseHeaders: Headers, url: string): void {
  for (const cookie of responseHeaders.getSetCookie()) {
    jar.setCookieSync(cookie, url)
  }
}

/** Build headers including the current cookie jar for the given URL. */
function headersWithCookies (url: string, extra?: Record<string, string>): Record<string, string> {
  return {
    ...globalHeaders,
    'Cookie': jar.getCookieStringSync(url),
    ...extra
  }
}

/**
 * Obtain a CSRF token from GET /csrf-token (public endpoint).
 * This creates an anonymous session and stores the CSRF token in it.
 */
async function fetchCsrfToken (): Promise<string> {
  const resp = await $fetch<IXuiCsrfResponse>(csrfUrl.href, {
    method: 'GET',
    headers: { ...globalHeaders },
    timeout: REQUEST_TIMEOUT_MS,
    onResponse ({ response }) {
      captureCookies(response.headers, csrfUrl.href)
    }
  })

  if (!resp.success || !resp.obj) {
    throw new Error(`3X-UI CSRF token request failed: ${resp.msg}`)
  }

  return resp.obj as string
}

/** Login to 3x-ui: obtain CSRF token, then POST credentials with the token. */
async function login (): Promise<{ csrfToken: string }> {
  jar.removeAllCookiesSync()

  // Step 1: GET /csrf-token — creates a session and returns the CSRF token
  const csrfToken = await fetchCsrfToken()

  // Step 2: POST /login with the CSRF token in the header
  const resp = await $fetch<IXuiResponse>(loginUrl.href, {
    method: 'POST',
    body: JSON.stringify({
      username: process.env.XUI_USERNAME,
      password: process.env.XUI_PASSWORD
    }),
    headers: {
      ...headersWithCookies(loginUrl.href, {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      })
    },
    timeout: REQUEST_TIMEOUT_MS,
    onResponse ({ response }) {
      captureCookies(response.headers, loginUrl.href)
    }
  })

  if (!resp.success) {
    throw new Error(`3X-UI login failed: ${resp.msg}`)
  }

  return { csrfToken }
}

/**
 * Retry a function with exponential backoff.
 * Only retries on network errors and 5xx responses — not on auth/logic errors.
 */
async function withRetry<T> (fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const isRetryable =
        err instanceof FetchError &&
        (err.statusCode == null || err.statusCode >= 500)

      if (!isRetryable || attempt === MAX_RETRIES) {
        throw err
      }

      const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)
      console.error(
        `${label} failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms: ${err}`
      )
      await sleep(delay)
    }
  }
  // Unreachable, but satisfies TypeScript
  throw new Error(`${label}: exhausted retries`)
}

export class XuiApiError extends Error {
  constructor (message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'XuiApiError'
  }
}

export async function getClientStats (): Promise<IClientData[]> {
  const { csrfToken } = await withRetry(login, '3X-UI login').catch(err => {
    throw new XuiApiError('Login failed', err)
  })

  const cookieStr = jar.getCookieStringSync(statsUrl.href)
  if (!cookieStr) {
    throw new XuiApiError('No session cookie after login — check XUI_WEB_DOMAIN if webDomain is set in 3x-ui')
  }

  // GET /list — no CSRF token needed (safe method)
  const statsResp = await withRetry(
    () => $fetch<IXuiStatsResponse>(statsUrl.href, {
      headers: { ...globalHeaders, 'Cookie': cookieStr },
      timeout: REQUEST_TIMEOUT_MS
    }),
    '3X-UI inbounds/list'
  ).catch(err => {
    throw new XuiApiError('Failed to fetch inbounds', err)
  })

  // POST /onlines — reuse the CSRF token from the authenticated session
  const onlineCookieStr = jar.getCookieStringSync(onlinesUrl.href)
  const onlinesResp = await withRetry(
    () => $fetch<IXuiOnlinesResponse>(onlinesUrl.href, {
      method: 'POST',
      headers: {
        ...globalHeaders,
        'Cookie': onlineCookieStr,
        'X-CSRF-Token': csrfToken
      },
      timeout: REQUEST_TIMEOUT_MS
    }),
    '3X-UI inbounds/onlines'
  ).catch(err => {
    throw new XuiApiError('Failed to fetch onlines', err)
  })

  if (!statsResp.success || !onlinesResp.success) {
    throw new XuiApiError(
      `API returned failure: stats=${statsResp.success} onlines=${onlinesResp.success}`
    )
  }

  return statsResp.obj.flatMap(e =>
    e.clientStats.map(cs => ({
      email: cs.email,
      down: cs.down,
      up: cs.up,
      online: onlinesResp.obj.includes(cs.email)
    }))
  )
}

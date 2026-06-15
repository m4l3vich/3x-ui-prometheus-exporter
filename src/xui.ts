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
      lastOnline: number
    }[]
  }[]
}

const loginUrl = new URL('./login', process.env.XUI_ORIGIN)
const csrfUrl = new URL('./csrf-token', process.env.XUI_ORIGIN)
const statsUrl = new URL('./panel/api/inbounds/list', process.env.XUI_ORIGIN)

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

/** 20-second grace period — matches 3x-ui's onlineGracePeriodMs. */
const ONLINE_GRACE_MS = 20_000

function sleep (ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function captureCookies (responseHeaders: Headers, url: string): void {
  for (const cookie of responseHeaders.getSetCookie()) {
    jar.setCookieSync(cookie, url)
  }
}

function headersWithCookies (url: string, extra?: Record<string, string>): Record<string, string> {
  return {
    ...globalHeaders,
    'Cookie': jar.getCookieStringSync(url),
    ...extra
  }
}

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

async function login (): Promise<{ csrfToken: string }> {
  jar.removeAllCookiesSync()

  const csrfToken = await fetchCsrfToken()

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
  throw new Error(`${label}: exhausted retries`)
}

export class XuiApiError extends Error {
  constructor (message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'XuiApiError'
  }
}

export async function getClientStats (): Promise<IClientData[]> {
  await withRetry(login, '3X-UI login').catch(err => {
    throw new XuiApiError('Login failed', err)
  })

  const cookieStr = jar.getCookieStringSync(statsUrl.href)
  if (!cookieStr) {
    throw new XuiApiError('No session cookie after login — check XUI_WEB_DOMAIN if webDomain is set in 3x-ui')
  }

  const statsResp = await withRetry(
    () => $fetch<IXuiStatsResponse>(statsUrl.href, {
      headers: { ...globalHeaders, 'Cookie': cookieStr },
      timeout: REQUEST_TIMEOUT_MS
    }),
    '3X-UI inbounds/list'
  ).catch(err => {
    throw new XuiApiError('Failed to fetch inbounds', err)
  })

  if (!statsResp.success) {
    throw new XuiApiError('API returned failure fetching inbounds')
  }

  const now = Date.now()

  return statsResp.obj.flatMap(ib =>
    ib.clientStats.map(cs => ({
      email: cs.email,
      down: cs.down,
      up: cs.up,
      online: (cs.lastOnline > 0) && (now - cs.lastOnline < ONLINE_GRACE_MS)
    }))
  )
}

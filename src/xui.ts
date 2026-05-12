import { CookieJar } from 'tough-cookie'
import { $fetch } from 'ofetch'

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
const onlinesUrl = new URL('./panel/api/inbounds/onlines', process.env.XUI_ORIGIN)

const globalHeaders: Record<string, string> = {}
if (process.env.XUI_BASIC_AUTH) {
  globalHeaders['Authorization'] = `Basic ${btoa(process.env.XUI_BASIC_AUTH)}`
}
if (process.env.XUI_WEB_DOMAIN) {
  globalHeaders['Host'] = process.env.XUI_WEB_DOMAIN
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
 * Returns both the token and the updated cookie string.
 */
async function fetchCsrfToken (): Promise<{ csrfToken: string; cookieStr: string }> {
  const resp = await $fetch<IXuiCsrfResponse>(csrfUrl.href, {
    method: 'GET',
    headers: { ...globalHeaders },
    onResponse ({ response }) {
      captureCookies(response.headers, csrfUrl.href)
    }
  })

  if (!resp.success || !resp.obj) {
    throw new Error(`3X-UI CSRF token request failed: ${resp.msg}`)
  }

  return {
    csrfToken: resp.obj as string,
    cookieStr: jar.getCookieStringSync(csrfUrl.href)
  }
}

/** Login to 3x-ui: obtain CSRF token, then POST credentials with the token. */
async function login (): Promise<{ csrfToken: string }> {
  jar.removeAllCookiesSync()

  // Step 1: GET /csrf-token — creates a session and returns the CSRF token
  const { csrfToken } = await fetchCsrfToken()

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
    onResponse ({ response }) {
      captureCookies(response.headers, loginUrl.href)
    }
  })

  if (!resp.success) {
    throw new Error(`3X-UI login failed: ${resp.msg}`)
  }

  return { csrfToken }
}

export async function getClientStats (): Promise<IClientData[]> {
  // Login — returns the CSRF token that was stored in our authenticated session
  const { csrfToken } = await login()

  const cookieStr = jar.getCookieStringSync(statsUrl.href)
  if (!cookieStr) {
    throw new Error('No session cookie after login — check XUI_WEB_DOMAIN if webDomain is set in 3x-ui')
  }

  // GET /list — no CSRF token needed (safe method)
  const statsResp = await $fetch<IXuiStatsResponse>(statsUrl.href, {
    headers: { ...globalHeaders, 'Cookie': cookieStr }
  })

  // POST /onlines — reuse the CSRF token from the authenticated session
  const onlineCookieStr = jar.getCookieStringSync(onlinesUrl.href)
  const onlinesResp = await $fetch<IXuiOnlinesResponse>(onlinesUrl.href, {
    method: 'POST',
    headers: {
      ...globalHeaders,
      'Cookie': onlineCookieStr,
      'X-CSRF-Token': csrfToken
    }
  })

  if (!statsResp.success || !onlinesResp.success) {
    console.error('Failed to get client stats: 3X-UI inbound request failed', { statsResp, onlinesResp })
    return []
  }

  return statsResp.obj.flatMap(e =>
    e.clientStats.map(e => ({
      email: e.email,
      down: e.down,
      up: e.up,
      online: onlinesResp.obj.includes(e.email)
    }))
  )
}

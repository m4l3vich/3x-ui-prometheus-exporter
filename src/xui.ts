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
const statsUrl = new URL('./panel/api/inbounds/list', process.env.XUI_ORIGIN)
const onlinesUrl = new URL('./panel/api/inbounds/onlines', process.env.XUI_ORIGIN)

const globalHeaders: HeadersInit = {}
if (process.env.XUI_BASIC_AUTH) {
  globalHeaders['Authorization'] = `Basic ${btoa(process.env.XUI_BASIC_AUTH)}`
}
if (process.env.XUI_WEB_DOMAIN) {
  globalHeaders['Host'] = process.env.XUI_WEB_DOMAIN
}

async function login (): Promise<void> {
  jar.removeAllCookiesSync()

  const resp = await $fetch<IXuiResponse>(loginUrl.href, {
    method: 'POST',
    body: JSON.stringify({
      username: process.env.XUI_USERNAME,
      password: process.env.XUI_PASSWORD
    }),
    headers: {
      ...globalHeaders,
      'Content-Type': 'application/json'
    },
    onResponse ({ response }) {
      for (const cookie of response.headers.getSetCookie()) {
        jar.setCookieSync(cookie, loginUrl.href)
      }
    }
  })

  if (!resp.success) {
    throw new Error(`3X-UI login failed: ${resp.msg}`)
  }
}

export async function getClientStats (): Promise<IClientData[]> {
  await login()

  const cookieStr = jar.getCookieStringSync(statsUrl.href)
  if (!cookieStr) {
    throw new Error('No session cookie after login — check XUI_WEB_DOMAIN if webDomain is set in 3x-ui')
  }

  const statsResp = await $fetch<IXuiStatsResponse>(statsUrl.href, {
    headers: { ...globalHeaders, 'Cookie': cookieStr }
  })

  await login()

  const onlineCookieStr = jar.getCookieStringSync(onlinesUrl.href)
  const onlinesResp = await $fetch<IXuiOnlinesResponse>(onlinesUrl.href, {
    method: 'POST',
    headers: { ...globalHeaders, 'Cookie': onlineCookieStr }
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

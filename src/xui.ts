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

async function login () {
  jar.removeAllCookiesSync()

  return await $fetch<IXuiResponse>(loginUrl.href, {
    method: 'POST',
    body: JSON.stringify({
      username: process.env.XUI_USERNAME,
      password: process.env.XUI_PASSWORD,
      loginSecret: process.env.XUI_LOGIN_SECRET
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
}

export async function getClientStats (): Promise<IClientData[]> {
  await login()
  const statsResp = await $fetch<IXuiStatsResponse>(statsUrl.href, {
    headers: { ...globalHeaders, 'Cookie': jar.getCookieStringSync(statsUrl.href) }
  })

  await login()
  const onlinesResp = await $fetch<IXuiOnlinesResponse>(onlinesUrl.href, {
    method: 'POST',
    headers: { ...globalHeaders, 'Cookie': jar.getCookieStringSync(onlinesUrl.href) }
  })

  if (!statsResp.success || !onlinesResp.success) {
    console.error('Failed to get client stats: 3X-UI inbound request failed', { statsResp, onlinesResp })
    return process.exit(1)
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
import { Registry, Counter, Gauge } from 'prom-client'
import { getClientStats } from './xui'

export const registry = new Registry()

const downBytes = new Counter({
  name: 'down_bytes_total',
  help: 'Bytes sent to the peer',
  registers: [registry],
  labelNames: ['email'] as const
})

const upBytes = new Counter({
  name: 'up_bytes_total',
  help: 'Bytes received from the peer',
  registers: [registry],
  labelNames: ['email'] as const
})

const isOnline = new Gauge({
  name: 'is_online',
  help: 'Is the peer online',
  registers: [registry],
  labelNames: ['email'] as const
})

// counters in prom-client SUCK
const counterCacheUp: Record<string, number> = {}
const counterCacheDown: Record<string, number> = {} 

export async function collectMetrics () {
  const clients = await getClientStats()

  for (const client of clients) {
    const upDelta = client.up - (counterCacheUp[client.email] ?? 0)
    upBytes.inc({ email: client.email }, upDelta)
    counterCacheUp[client.email] = client.up

    const downDelta = client.up - (counterCacheDown[client.email] ?? 0)
    downBytes.inc({ email: client.email }, downDelta)
    counterCacheDown[client.email] = client.down

    isOnline.set({ email: client.email }, client.online ? 1 : 0)
  }

  return registry
}
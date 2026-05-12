import { Registry, Counter, Gauge } from 'prom-client'
import { getClientStats, XuiApiError } from './xui'

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

const scrapeErrors = new Counter({
  name: 'scrape_errors_total',
  help: 'Number of scrape attempts that failed',
  registers: [registry]
})

// prom-client Counter.inc() silently ignores negative deltas, so we cache
// the last absolute value per client to compute positive-only deltas.
const counterCacheUp: Record<string, number> = {}
const counterCacheDown: Record<string, number> = {}

export async function collectMetrics (): Promise<Registry> {
  let clients
  try {
    clients = await getClientStats()
  } catch (err) {
    scrapeErrors.inc()
    if (err instanceof XuiApiError) {
      console.error(`Scrape failed: ${err.message}`, err.cause ?? '')
    } else {
      console.error('Scrape failed:', err)
    }
    // Return registry as-is — previous metric values are preserved,
    // Prometheus will see no update for this interval.
    return registry
  }

  // Track which emails are present in this scrape so we can clean up
  const activeEmails = new Set<string>()

  for (const client of clients) {
    activeEmails.add(client.email)

    const upDelta = client.up - (counterCacheUp[client.email] ?? 0)
    counterCacheUp[client.email] = client.up
    // Only increment on positive delta (counter reset or fresh client)
    if (upDelta > 0) {
      upBytes.inc({ email: client.email }, upDelta)
    } else if (upDelta < 0) {
      // 3x-ui counter was reset — set the counter to the new absolute value
      counterCacheUp[client.email] = client.up
    }

    const downDelta = client.down - (counterCacheDown[client.email] ?? 0)
    counterCacheDown[client.email] = client.down
    if (downDelta > 0) {
      downBytes.inc({ email: client.email }, downDelta)
    } else if (downDelta < 0) {
      counterCacheDown[client.email] = client.down
    }

    isOnline.set({ email: client.email }, client.online ? 1 : 0)
  }

  // Clean up stale clients from caches so memory doesn't grow forever
  for (const email of Object.keys(counterCacheUp)) {
    if (!activeEmails.has(email)) {
      delete counterCacheUp[email]
      delete counterCacheDown[email]
      isOnline.set({ email }, 0)
    }
  }

  return registry
}

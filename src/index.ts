import 'dotenv/config'
import Fastify from 'fastify'
import { collectMetrics } from './metrics'

const fastify = Fastify()

// Liveness check — always returns 200 as long as the process is up
fastify.get('/health', async () => ({ status: 'ok' }))

fastify.get('/metrics', async (_, reply) => {
  const registry = await collectMetrics()

  reply.header('Content-Type', registry.contentType)
  return registry.metrics()
})

// Global error handler — ensures Prometheus always gets a usable response
fastify.setErrorHandler((err, _request, reply) => {
  console.error('Unhandled error in /metrics:', err)
  reply.status(500).type('text/plain').send('# Error: scrape failed\n')
})

const port = Number(process.env.PORT) || 3000
const host = process.env.HOST || '0.0.0.0'

fastify.listen({ port, host })
console.log(`Listening on ${host}:${port}`)

import Fastify from 'fastify'
import { collectMetrics } from './metrics'

const fastify = Fastify()

fastify.get('/metrics', async (_, reply) => {
  const registry = await collectMetrics()

  reply.header('Content-Type', registry.contentType)
  return registry.metrics()
})

fastify.listen({ port: 3000, host: '0.0.0.0' })
console.log('Listening on 0.0.0.0:3000')
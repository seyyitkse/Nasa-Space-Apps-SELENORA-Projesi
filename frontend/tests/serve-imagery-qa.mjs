// Loopback-only acceptance harness. No fault switches in the production build.
import { createServer } from 'vite'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
const faults = resolve('../data/cache/phase5f2_qa')
const server = await createServer({ plugins: [{ name: 'imagery-qa-faults', configureServer(vite) {
  vite.middlewares.use((request, response, next) => {
    if ((existsSync(resolve(faults, 'api-offline')) && request.url?.startsWith('/api/')) ||
        (existsSync(resolve(faults, 'lroc-offline')) && (request.url?.startsWith('/lunar-overview/lroc-wac-') || request.url?.startsWith('/api/v1/maps/tiles/lroc-')))) {
      response.statusCode = 503
      response.setHeader('Content-Type', 'text/plain')
      response.setHeader('Cache-Control', 'no-store')
      response.end('Controlled Phase 5F.2 acceptance-test outage')
    } else next()
  })
} }] })
await server.listen()
server.printUrls()

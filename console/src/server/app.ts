import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { z, ZodError } from 'zod';
import { activityInput, activityUpdate, lotInput, movementInput, patientInput, productInput, uuid, type Actor } from '../shared/contracts.js';
import { authenticator, requireRole } from './platform/auth.js';
import type { Config } from './platform/config.js';
import { DomainError, invariant } from './platform/errors.js';
import type { Repository } from './platform/repository.js';

declare module 'fastify' { interface FastifyRequest { actor: Actor } }
export async function buildApp(config: Config, repo: Repository, verify = authenticator(config)) {
  // Do not log URL query strings, request bodies, credentials, or patient data.
  const app = Fastify({ bodyLimit: 32768, logger: false, requestTimeout: 30000, trustProxy: false });
  await app.register(helmet, { contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'", 'https://login.microsoftonline.com'], frameSrc: ['https://login.microsoftonline.com'],
    objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"],
  } } });
  await app.register(rateLimit, { max: 180, timeWindow: '1 minute' });
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (config.mode === 'demo') {
      invariant(['127.0.0.1', 'localhost', '[::1]'].includes(req.hostname), 'demo_host', 'Demo access is local only.', 403);
      if (req.headers.origin) invariant(['localhost','127.0.0.1','[::1]'].includes(new URL(req.headers.origin).hostname), 'demo_origin', 'Demo access is local only.', 403);
    }
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'validation', message: error.issues.map(i => `${i.path.join('.') || 'Request'}: ${i.message}`).join(' '), requestId: req.id });
    if (error instanceof DomainError) return reply.code(error.status).send({ code: error.code, message: error.message, requestId: req.id });
    if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode < 500) return reply.code(error.statusCode).send({ code: 'request', message: 'The request could not be accepted.', requestId: req.id });
    console.error(JSON.stringify({ event: 'request_failed', requestId: req.id, errorType: error instanceof Error ? error.name : 'Unknown' }));
    return reply.code(503).send({ code: 'unavailable', message: 'The operation could not be confirmed. Retry with the same request; do not assume it saved.', requestId: req.id });
  });
  app.get('/api/health', async () => ({ status: 'ok' }));
  app.get('/api/config', async () => ({ mode: config.mode, clinicTimezone: config.timezone, ...(config.mode === 'sql' ? { tenantId: config.tenantId, webClientId: config.webClientId, apiScope: `api://${config.apiClientId}/access_as_user` } : {}) }));
  await app.register(async api => {
    api.addHook('preHandler', async req => { req.actor = await verify(req.headers.authorization); });
    api.get('/session', async req => ({ actor: req.actor }));
    api.get('/overview', async req => repo.overview(req.actor));
    const command = (req: import('fastify').FastifyRequest) => ({ key: uuid.parse(req.headers['idempotency-key']), actor: req.actor });
    api.post('/patients', async (req, reply) => { requireRole(req.actor, 'operate'); return reply.code(201).send(await repo.createPatient(patientInput.parse(req.body), command(req))); });
    api.post('/activities', async (req, reply) => { requireRole(req.actor, 'operate'); return reply.code(201).send(await repo.createActivity(activityInput.parse(req.body), command(req))); });
    api.patch('/activities/:id', async req => { requireRole(req.actor, 'operate'); return repo.updateActivity(z.object({ id: uuid }).parse(req.params).id, activityUpdate.parse(req.body), command(req)); });
    api.post('/products', async (req, reply) => { requireRole(req.actor, 'inventory'); return reply.code(201).send(await repo.createProduct(productInput.parse(req.body), command(req))); });
    api.post('/lots', async (req, reply) => { requireRole(req.actor, 'inventory'); return reply.code(201).send(await repo.createLot(lotInput.parse(req.body), command(req))); });
    api.post('/movements', async (req, reply) => {
      const input = movementInput.parse(req.body);
      requireRole(req.actor, ['receive','adjust','reverse','waste'].includes(input.kind) ? 'inventory' : 'operate');
      return reply.code(201).send(await repo.postMovement(input, command(req)));
    });
  }, { prefix: '/api/v1' });
  app.addHook('onClose', async () => repo.close());
  return app;
}

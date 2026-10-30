import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';

import escalationHandler, { runEscalationSweep } from '../api/cron/escalations.js';
import notificationSubscriptionHandler from '../api/notifications/subscriptions.js';
import sessionsHandler from '../api/sessions.js';
import sessionHandler from '../api/sessions/[code].js';
import actionHandler from '../api/sessions/[code]/actions.js';
import attachmentHandler from '../api/sessions/[code]/attachments.js';
import cancellationHandler from '../api/sessions/[code]/cancel.js';
import pinHandler from '../api/sessions/[code]/pin.js';
import staffActivationHandler from '../api/staff/activate.js';
import staffBootstrapHandler from '../api/staff/bootstrap.js';
import staffInvitationHandler from '../api/staff/invitations.js';
import staffIdentityHandler from '../api/staff/me.js';
import staffDirectoryHandler from '../api/staff/directory.js';
import staffAttendanceHandler from '../api/staff/attendance.js';
import type { ApiRequest, ApiResponse } from '../src/lib/vercel-api.js';

type ApiHandler = (request: ApiRequest, response: ApiResponse) => Promise<unknown> | unknown;

const port = Number.parseInt(process.env.PORT ?? '10000', 10);
const host = '0.0.0.0';
const distDirectory = resolve(process.cwd(), 'dist');
const bodyLimitBytes = 4 * 1024 * 1024;
const escalationIntervalMs = 30_000;

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
};

function addResponseHelpers(response: ServerResponse): ApiResponse {
  const apiResponse = response as ApiResponse;
  apiResponse.status = (code: number) => {
    apiResponse.statusCode = code;
    return apiResponse;
  };
  apiResponse.json = (value: unknown) => {
    if (apiResponse.writableEnded) return;
    if (apiResponse.statusCode === 204) {
      apiResponse.end();
      return;
    }
    if (!apiResponse.headersSent) apiResponse.setHeader('Content-Type', 'application/json; charset=utf-8');
    apiResponse.end(JSON.stringify(value));
  };
  return apiResponse;
}

async function readBody(request: IncomingMessage) {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > bodyLimitBytes) throw Object.assign(new Error('Request body is too large.'), { statusCode: 413 });
    chunks.push(buffer);
  }
  if (!chunks.length) return undefined;
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!(request.headers['content-type'] ?? '').includes('application/json')) return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw Object.assign(new Error('Request body is not valid JSON.'), { statusCode: 400 });
  }
}

function apiRoute(pathname: string): { handler: ApiHandler; query?: Record<string, string> } | null {
  if (pathname === '/api/sessions') return { handler: sessionsHandler };
  if (pathname === '/api/cron/escalations') return { handler: escalationHandler };
  if (pathname === '/api/notifications/subscriptions') return { handler: notificationSubscriptionHandler };
  if (pathname === '/api/staff/activate') return { handler: staffActivationHandler };
  if (pathname === '/api/staff/bootstrap') return { handler: staffBootstrapHandler };
  if (pathname === '/api/staff/invitations') return { handler: staffInvitationHandler };
  if (pathname === '/api/staff/me') return { handler: staffIdentityHandler };
  if (pathname === '/api/staff/directory') return { handler: staffDirectoryHandler };
  if (pathname === '/api/staff/attendance') return { handler: staffAttendanceHandler };

  const match = pathname.match(/^\/api\/sessions\/([^/]+)(?:\/(actions|attachments|cancel|pin))?$/);
  if (!match) return null;
  const handlers: Record<string, ApiHandler> = {
    actions: actionHandler,
    attachments: attachmentHandler,
    cancel: cancellationHandler,
    pin: pinHandler,
  };
  return { handler: match[2] ? handlers[match[2]] : sessionHandler, query: { code: decodeURIComponent(match[1]) } };
}

function setSecurityHeaders(response: ServerResponse) {
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
}

function sendFile(request: IncomingMessage, response: ServerResponse, filePath: string) {
  response.statusCode = 200;
  response.setHeader('Content-Type', contentTypes[extname(filePath).toLowerCase()] ?? 'application/octet-stream');
  if (filePath.includes(`${sep}assets${sep}`)) response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  else if (filePath.endsWith(`${sep}sw.js`) || filePath.endsWith(`${sep}push-sw.js`)) response.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  else response.setHeader('Cache-Control', 'no-cache');
  if (request.method === 'HEAD') return response.end();
  createReadStream(filePath).on('error', () => {
    if (!response.headersSent) response.statusCode = 500;
    response.end();
  }).pipe(response);
}

const server = createServer(async (request, response) => {
  setSecurityHeaders(response);
  const url = new URL(request.url ?? '/', 'http://rapidlink.local');

  if (url.pathname === '/healthz') {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    return response.end(JSON.stringify({ status: 'ok' }));
  }

  const route = apiRoute(url.pathname);
  if (url.pathname.startsWith('/api/')) {
    const apiResponse = addResponseHelpers(response);
    if (!route) return apiResponse.status(404).json({ message: 'API route not found.' });
    try {
      const apiRequest = request as ApiRequest;
      apiRequest.body = await readBody(request);
      apiRequest.query = Object.fromEntries(url.searchParams.entries());
      if (route.query) Object.assign(apiRequest.query, route.query);
      await route.handler(apiRequest, apiResponse);
      if (!apiResponse.writableEnded) apiResponse.end();
    } catch (error) {
      if (apiResponse.writableEnded) return;
      const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 500;
      apiResponse.status(Number.isInteger(statusCode) ? statusCode : 500).json({
        message: statusCode < 500 && error instanceof Error ? error.message : 'Unexpected server error.',
      });
    }
    return;
  }

  if (!['GET', 'HEAD'].includes(request.method ?? '')) {
    response.statusCode = 405;
    response.setHeader('Allow', 'GET, HEAD');
    return response.end('Method not allowed.');
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    response.statusCode = 400;
    return response.end('Invalid path.');
  }
  const candidate = resolve(distDirectory, decodedPath.replace(/^\/+/, ''));
  const safeCandidate = candidate === distDirectory || candidate.startsWith(`${distDirectory}${sep}`);
  const requestedFile = safeCandidate && existsSync(candidate) && statSync(candidate).isFile() ? candidate : null;
  const fallback = resolve(distDirectory, 'index.html');
  if (requestedFile) return sendFile(request, response, requestedFile);
  if (existsSync(fallback)) return sendFile(request, response, fallback);
  response.statusCode = 503;
  response.end('Frontend build is unavailable.');
});

let escalationRunning = false;
async function processEscalations() {
  if (escalationRunning) return;
  escalationRunning = true;
  try {
    await runEscalationSweep();
  } catch (error) {
    console.error('Escalation sweep failed.', error instanceof Error ? error.message : 'Unknown error');
  } finally {
    escalationRunning = false;
  }
}

const interval = setInterval(() => void processEscalations(), escalationIntervalMs);
interval.unref();

server.listen(port, host, () => {
  console.log(`RapidLink listening on ${host}:${port}`);
  void processEscalations();
});

function shutDown(signal: string) {
  console.log(`${signal} received; shutting down.`);
  clearInterval(interval);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 25_000).unref();
}

process.once('SIGTERM', () => shutDown('SIGTERM'));
process.once('SIGINT', () => shutDown('SIGINT'));

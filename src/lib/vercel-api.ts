import type { IncomingMessage, ServerResponse } from 'node:http';

export interface ApiRequest extends IncomingMessage {
  body?: unknown;
  query: Record<string, string | string[] | undefined>;
}

export interface ApiResponse extends ServerResponse {
  status(code: number): ApiResponse;
  json(value: unknown): void;
}

export function firstQuery(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function bodyAs<T>(request: ApiRequest): T | null {
  try {
    return (typeof request.body === 'string' ? JSON.parse(request.body) : request.body) as T;
  } catch {
    return null;
  }
}

export function methodNotAllowed(response: ApiResponse, allowed: string) {
  response.setHeader('Allow', allowed);
  return response.status(405).json({ message: 'Method not allowed.' });
}

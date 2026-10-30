import { staffIdentity } from '../../src/lib/auth-server.js';
import { methodNotAllowed, type ApiRequest, type ApiResponse } from '../../src/lib/vercel-api.js';

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'GET') return methodNotAllowed(response, 'GET');
  const identity = await staffIdentity(request);
  if (!identity) return response.status(401).json({ message: 'An active staff account is required.' });
  return response.status(200).json({ staff: identity });
}

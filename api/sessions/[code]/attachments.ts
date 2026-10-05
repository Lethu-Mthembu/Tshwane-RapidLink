import { normalizeRoomCode } from '../../../src/features/emergency/session-service.js';
import { supabaseConfigured, uploadAttachment } from '../../../src/lib/supabase-server.js';
import { bodyAs, firstQuery, methodNotAllowed, type ApiRequest, type ApiResponse } from '../../../src/lib/vercel-api.js';

const allowedImages = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface AttachmentBody { name?: string; mimeType?: string; dataUrl?: string }

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
  if (!supabaseConfigured) return response.status(503).json({ message: 'Remote attachments are not configured.' });
  const body = bodyAs<AttachmentBody>(request);
  if (!body?.name || !body.mimeType || !body.dataUrl || (!allowedImages.has(body.mimeType) && !body.mimeType.startsWith('audio/'))) {
    return response.status(400).json({ message: 'Unsupported attachment.' });
  }
  const match = body.dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match || match[1] !== body.mimeType) return response.status(400).json({ message: 'Invalid attachment data.' });
  const bytes = Uint8Array.from(Buffer.from(match[2], 'base64'));
  if (bytes.byteLength > 2 * 1024 * 1024) return response.status(413).json({ message: 'Attachments must be 2 MB or smaller.' });
  try {
    const code = normalizeRoomCode(firstQuery(request.query.code) ?? '');
    return response.status(200).json(await uploadAttachment(code, { name: body.name, type: body.mimeType, bytes }));
  } catch {
    return response.status(502).json({ message: 'The attachment could not be uploaded.' });
  }
}

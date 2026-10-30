interface SendInvitationInput {
  to: string;
  role: 'admin' | 'supervisor' | 'responder';
  activationUrl: string;
  stationName?: string;
  service?: string;
  idempotencyKey: string;
}

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM_EMAIL ?? 'RapidLink Access <access@trainmate.nemasites.com>';

export const resendConfigured = Boolean(apiKey);

export async function sendStaffInvitation(input: SendInvitationInput) {
  if (!apiKey) throw new Error('Invitation email delivery is not configured.');
  const scope = input.stationName && input.service
    ? `<p>Your access is restricted to <strong>${input.stationName}</strong> for the <strong>${input.service}</strong> service.</p>`
    : '';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'idempotency-key': input.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: 'Activate your RapidLink staff account',
      html: `<h1>RapidLink staff invitation</h1><p>You have been invited as a ${input.role}.</p>${scope}<p><a href="${input.activationUrl}">Activate your account</a></p><p>This single-use link expires in 24 hours.</p>`,
      text: `You have been invited to RapidLink as a ${input.role}. Activate your account within 24 hours: ${input.activationUrl}`,
    }),
  });
  if (!response.ok) {
    const reason = await response.text().catch(() => '');
    throw new Error(`Invitation email delivery failed (${response.status})${reason ? `: ${reason.slice(0, 180)}` : ''}`);
  }
  return response.json() as Promise<{ id: string }>;
}

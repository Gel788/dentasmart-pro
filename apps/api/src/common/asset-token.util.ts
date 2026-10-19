import { createHmac, timingSafeEqual } from 'crypto';

/** Files are opened by <img src> and fetch() without headers, so the URL carries a read-only key scoped to one clinic. */
const ASSET_TTL_MS = 24 * 60 * 60 * 1000;

function secret() {
  return process.env.ASSET_SECRET || process.env.JWT_SECRET || 'dev-secret-change-me';
}

function sign(body: string) {
  return createHmac('sha256', secret()).update(`asset:${body}`).digest('base64url');
}

export function issueAssetToken(organizationId: string): string {
  const body = `${organizationId}.${Date.now() + ASSET_TTL_MS}`;
  return `${body}.${sign(body)}`;
}

/** Returns the clinic the key was issued for, or null when it is forged or expired. */
export function verifyAssetToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [organizationId, expires, signature] = parts;
  const expected = Buffer.from(sign(`${organizationId}.${expires}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (!(Number(expires) > Date.now())) return null;
  return organizationId;
}

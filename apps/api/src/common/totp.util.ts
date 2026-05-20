import { createHmac, randomBytes } from 'crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(): string {
  const buf = randomBytes(20);
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    out += BASE32[buf[i] % 32];
  }
  return out;
}

function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').toUpperCase();
  let bits = '';
  for (const c of clean) {
    const val = BASE32.indexOf(c);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secret: string, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const key = base32Decode(secret);
  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

export function verifyTotp(secret: string, token: string): boolean {
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let w = -1; w <= 1; w++) {
    if (hotp(secret, counter + w) === token) return true;
  }
  return false;
}

import crypto from 'node:crypto';
import { cookies } from 'next/headers';

const ADMIN_COOKIE_NAME = 'exam_admin_token';

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || 'admin123456';
}

function getSessionSecret(): string {
  return process.env.ADMIN_SESSION_SECRET || 'open-exam-dev-session-secret-change-me';
}

function signPayload(payload: string): string {
  return crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('hex');
}

export function verifyAdminPassword(input: string): boolean {
  const expected = Buffer.from(getAdminPassword(), 'utf8');
  const actual = Buffer.from(input || '', 'utf8');
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function createAdminToken(): string {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
  const payload = `admin:${exp}`;
  const sig = signPayload(payload);
  return `${payload}.${sig}`;
}

export function verifyAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expectedSig = signPayload(payload);
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  const [, expStr] = payload.split(':');
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  return true;
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  return verifyAdminToken(token);
}

export function getAdminCookieOptions() {
  return {
    name: ADMIN_COOKIE_NAME,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  };
}

import { NextResponse } from 'next/server';
import { getAdminCookieOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  const opts = getAdminCookieOptions();
  res.cookies.set(opts.name, '', { ...opts, maxAge: 0 });
  return res;
}

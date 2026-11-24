import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminToken,
  getAdminCookieOptions,
  verifyAdminPassword,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { password?: string };
    const password = typeof body.password === 'string' ? body.password : '';
    if (!verifyAdminPassword(password)) {
      return NextResponse.json({ error: '管理密码不正确' }, { status: 401 });
    }

    const token = createAdminToken();
    const res = NextResponse.json({ ok: true });
    const opts = getAdminCookieOptions();
    res.cookies.set(opts.name, token, opts);
    return res;
  } catch {
    return NextResponse.json({ error: '登录请求异常' }, { status: 400 });
  }
}

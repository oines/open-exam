import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import { getCollegeDirectory, saveCollegeDirectory } from '@/lib/db';
import type { CollegeDirectory } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: '未登录管理后台' }, { status: 401 });
  }
  return NextResponse.json({ collegeDirectory: getCollegeDirectory() });
}

export async function PUT(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: '未登录管理后台' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { collegeDirectory?: CollegeDirectory };
    if (!body.collegeDirectory || typeof body.collegeDirectory !== 'object') {
      return NextResponse.json({ error: '院系班级数据格式不正确' }, { status: 400 });
    }
    const saved = saveCollegeDirectory(body.collegeDirectory);
    if (Object.keys(saved).length === 0) {
      return NextResponse.json({ error: '至少需要包含 1 个有效学院及班级' }, { status: 400 });
    }
    return NextResponse.json({ collegeDirectory: saved });
  } catch {
    return NextResponse.json({ error: '保存院系名录失败' }, { status: 400 });
  }
}

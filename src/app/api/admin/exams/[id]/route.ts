import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import { deleteExam, getExamById, updateExam } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: '未登录管理后台' }, { status: 401 });
  }
  const { id } = await context.params;
  const examId = Number(id);
  if (!Number.isFinite(examId)) {
    return NextResponse.json({ error: '无效的活动 ID' }, { status: 400 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const updated = updateExam(examId, {
      title: typeof body.title === 'string' ? body.title : undefined,
      subtitle: typeof body.subtitle === 'string' ? body.subtitle : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      is_default: typeof body.is_default === 'boolean' ? body.is_default : undefined,
      is_open: typeof body.is_open === 'boolean' ? body.is_open : undefined,
      draw_count: body.draw_count !== undefined ? Number(body.draw_count) : undefined,
      duration_minutes:
        body.duration_minutes !== undefined ? Number(body.duration_minutes) : undefined,
      pass_score: body.pass_score !== undefined ? Number(body.pass_score) : undefined,
      max_violations:
        body.max_violations !== undefined ? Number(body.max_violations) : undefined,
      show_explanations:
        typeof body.show_explanations === 'boolean' ? body.show_explanations : undefined,
      allow_retake:
        typeof body.allow_retake === 'boolean' ? body.allow_retake : undefined,
      require_college_class:
        typeof body.require_college_class === 'boolean'
          ? body.require_college_class
          : undefined,
      require_password:
        typeof body.require_password === 'boolean' ? body.require_password : undefined,
      access_password:
        typeof body.access_password === 'string' ? body.access_password : undefined,
    });
    if (!updated) {
      return NextResponse.json({ error: '未找到该活动' }, { status: 404 });
    }
    return NextResponse.json({ exam: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '更新活动配置失败';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: '未登录管理后台' }, { status: 401 });
  }
  const { id } = await context.params;
  const examId = Number(id);
  if (!Number.isFinite(examId) || !getExamById(examId)) {
    return NextResponse.json({ error: '未找到该活动' }, { status: 404 });
  }

  try {
    deleteExam(examId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '删除活动失败';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

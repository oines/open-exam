import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import { getExamById, listQuestionsByExam, replaceExamQuestions } from '@/lib/db';
import { validateImportedQuestions } from '@/lib/question-import';

export const dynamic = 'force-dynamic';

export async function GET(
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
  return NextResponse.json({ questions: listQuestionsByExam(examId) });
}

export async function POST(
  request: NextRequest,
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
    const body = (await request.json()) as { questions?: unknown };
    const check = validateImportedQuestions(body.questions);
    if (!check.ok || !check.questions) {
      return NextResponse.json({ error: check.error || '题库校验失败' }, { status: 400 });
    }

    const count = replaceExamQuestions(examId, check.questions);
    return NextResponse.json({ ok: true, importedCount: count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '导入题库失败';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

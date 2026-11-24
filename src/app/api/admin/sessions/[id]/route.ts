import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import {
  deleteSession,
  ensureSessionFreshness,
  getExamById,
  getQuestionsByIds,
  getSessionById,
  overrideCheatingStatus,
} from '@/lib/db';
import { computeBreakdowns, computeSessionPassed, gradeQuestions } from '@/lib/grading';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: '未登录管理后台' }, { status: 401 });
  }
  const { id } = await context.params;
  const raw = getSessionById(id);
  if (!raw) {
    return NextResponse.json({ error: '未找到该考生记录' }, { status: 404 });
  }
  const session = ensureSessionFreshness(raw);
  const exam = getExamById(session.exam_id);
  const questions = getQuestionsByIds(session.question_ids);
  const graded = gradeQuestions(questions, session.answers);
  const breakdowns = computeBreakdowns(graded.review);

  return NextResponse.json({
    session,
    exam,
    passed: exam ? computeSessionPassed(session, exam.pass_score) : false,
    breakdowns,
    review: graded.review,
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: '未登录管理后台' }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    const body = (await request.json()) as {
      restoreValid?: boolean;
      note?: string;
    };
    const updated = overrideCheatingStatus(
      id,
      Boolean(body.restoreValid),
      String(body.note || ''),
    );
    if (!updated) {
      return NextResponse.json({ error: '未找到该考生记录' }, { status: 404 });
    }
    return NextResponse.json({ session: updated });
  } catch {
    return NextResponse.json({ error: '更新复核状态失败' }, { status: 400 });
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
  const ok = deleteSession(id);
  if (!ok) {
    return NextResponse.json({ error: '未找到该考生记录' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import {
  ensureSessionFreshness,
  getExamById,
  getQuestionsByIds,
  getSessionById,
  saveSessionProgress,
  stripExamSecrets,
} from '@/lib/db';
import {
  computeBreakdowns,
  computeSessionPassed,
  gradeQuestions,
  stripQuestionSecrets,
} from '@/lib/grading';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const rawSession = getSessionById(id);
  if (!rawSession) {
    return NextResponse.json({ error: '未找到该场考试记录' }, { status: 404 });
  }

  const session = ensureSessionFreshness(rawSession);
  const exam = getExamById(session.exam_id);
  if (!exam) {
    return NextResponse.json({ error: '关联的考试活动不存在' }, { status: 404 });
  }

  const publicExam = stripExamSecrets(exam);
  const questions = getQuestionsByIds(session.question_ids);

  if (session.status === 'in_progress') {
    return NextResponse.json({
      serverNow: new Date().toISOString(),
      exam: publicExam,
      session,
      questions: questions.map(stripQuestionSecrets),
    });
  }

  // Finalized exam: compute detailed breakdowns & optional review
  const graded = gradeQuestions(questions, session.answers);
  const breakdowns = computeBreakdowns(graded.review);
  const passed = computeSessionPassed(session, exam.pass_score);

  return NextResponse.json({
    serverNow: new Date().toISOString(),
    exam: publicExam,
    session,
    passed,
    breakdowns,
    review: exam.show_explanations ? graded.review : null,
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const body = (await request.json()) as {
      answers?: Record<string, string[]>;
      flagged_ids?: number[];
    };

    const updated = saveSessionProgress(id, body);
    if (!updated) {
      return NextResponse.json({ error: '考试记录不存在' }, { status: 404 });
    }

    return NextResponse.json({
      locked: updated.status !== 'in_progress',
      status: updated.status,
      savedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: '保存作答进度失败' }, { status: 400 });
  }
}

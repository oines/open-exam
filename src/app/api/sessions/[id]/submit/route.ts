import { NextRequest, NextResponse } from 'next/server';
import { finalizeSession, getSessionById, saveSessionProgress } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const current = getSessionById(id);
  if (!current) {
    return NextResponse.json({ error: '考试记录不存在' }, { status: 404 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      answers?: Record<string, string[]>;
      flagged_ids?: number[];
      reason?: 'manual' | 'timeout';
    };

    if (current.status === 'in_progress' && (body.answers || body.flagged_ids)) {
      saveSessionProgress(id, {
        answers: body.answers,
        flagged_ids: body.flagged_ids,
      });
    }

    const finalStatus = body.reason === 'timeout' ? 'timeout_submitted' : 'submitted';
    const finalized = finalizeSession(id, finalStatus);

    return NextResponse.json({
      session: finalized,
    });
  } catch {
    return NextResponse.json({ error: '交卷失败，请稍后重试' }, { status: 500 });
  }
}

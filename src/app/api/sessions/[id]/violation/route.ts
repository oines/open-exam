import { NextRequest, NextResponse } from 'next/server';
import { getExamById, recordSessionViolation } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const body = (await request.json()) as {
      action?: 'leave' | 'return';
      reason?: 'visibility_hidden' | 'window_blur' | 'fullscreen_exit';
      answers?: Record<string, string[]>;
      flagged_ids?: number[];
    };

    const action = body.action === 'return' ? 'return' : 'leave';
    const result = recordSessionViolation(id, {
      action,
      reason: body.reason,
      answers: body.answers,
      flagged_ids: body.flagged_ids,
    });

    if (!result.session) {
      return NextResponse.json({ error: '考试记录不存在' }, { status: 404 });
    }

    const exam = getExamById(result.session.exam_id);
    return NextResponse.json({
      locked: result.locked || result.session.status !== 'in_progress',
      deduplicated: result.deduplicated,
      status: result.session.status,
      violation_count: result.session.violation_count,
      max_violations: exam?.max_violations ?? 3,
      violations: result.session.violations,
    });
  } catch {
    return NextResponse.json({ error: '切屏上报失败' }, { status: 400 });
  }
}

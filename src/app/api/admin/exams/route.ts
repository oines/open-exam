import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import { createExam, getCollegeDirectory, listExams } from '@/lib/db';
import { validateImportedQuestions } from '@/lib/question-import';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: '未登录管理后台' }, { status: 401 });
  }
  return NextResponse.json({
    exams: listExams(),
    collegeDirectory: getCollegeDirectory(),
  });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: '未登录管理后台' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const title = String(body.title || '').trim();
    const slug = String(body.slug || '').trim();
    if (!title || !slug) {
      return NextResponse.json({ error: '请填写活动名称和访问标识（slug）' }, { status: 400 });
    }

    let validatedQuestions;
    if (body.questions !== undefined) {
      const check = validateImportedQuestions(body.questions);
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
      validatedQuestions = check.questions;
    }

    const exam = createExam({
      slug,
      title,
      subtitle: String(body.subtitle || ''),
      description: String(body.description || ''),
      is_default: Boolean(body.is_default),
      is_open: body.is_open !== false,
      draw_count: Number(body.draw_count ?? 40),
      duration_minutes: Number(body.duration_minutes ?? 30),
      pass_score: Number(body.pass_score ?? 60),
      max_violations: Number(body.max_violations ?? 3),
      show_explanations: body.show_explanations !== false,
      allow_retake: Boolean(body.allow_retake),
      require_college_class: body.require_college_class !== false,
      require_password: Boolean(body.require_password),
      access_password: typeof body.access_password === 'string' ? body.access_password : '',
      questions: validatedQuestions,
    });

    return NextResponse.json({ exam }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '创建活动失败';
    if (msg.includes('UNIQUE')) {
      return NextResponse.json({ error: '该访问标识（slug）已存在，请换一个' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

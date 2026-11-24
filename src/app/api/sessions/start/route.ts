import { NextRequest, NextResponse } from 'next/server';
import {
  getCollegeDirectory,
  getDefaultExam,
  getExamBySlug,
  startOrResumeSession,
  verifyExamAccessPassword,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
    const studentName = typeof body.student_name === 'string' ? body.student_name.trim() : '';
    const studentId = typeof body.student_id === 'string' ? body.student_id.trim() : '';
    const college = typeof body.college === 'string' ? body.college.trim() : '';
    const className = typeof body.class_name === 'string' ? body.class_name.trim() : '';
    const accessPassword =
      typeof body.access_password === 'string' ? body.access_password.trim() : '';

    const exam = slug ? getExamBySlug(slug) : getDefaultExam();
    if (!exam) {
      return NextResponse.json({ error: '未找到对应的考试' }, { status: 404 });
    }

    if (exam.require_password) {
      if (!accessPassword) {
        return NextResponse.json({ error: '请输入考试密码' }, { status: 403 });
      }
      if (!verifyExamAccessPassword(exam, accessPassword)) {
        return NextResponse.json({ error: '考试密码错误' }, { status: 403 });
      }
    }

    if (!studentName || studentName.length > 40) {
      return NextResponse.json({ error: '请填写正确的姓名' }, { status: 400 });
    }
    if (!studentId || studentId.length < 3 || studentId.length > 40) {
      return NextResponse.json({ error: '请填写正确的学号' }, { status: 400 });
    }

    if (exam.require_college_class) {
      const directory = getCollegeDirectory();
      if (!college || !directory[college]) {
        return NextResponse.json({ error: '请选择所属学院' }, { status: 400 });
      }
      if (!className || !directory[college].includes(className)) {
        return NextResponse.json({ error: '请选择所属班级' }, { status: 400 });
      }
    }

    const forwarded = request.headers.get('x-forwarded-for') || '';
    const ipAddress = forwarded.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local';
    const userAgent = request.headers.get('user-agent') || '';

    const result = startOrResumeSession({
      exam,
      student_name: studentName,
      student_id: studentId,
      college,
      class_name: className,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    return NextResponse.json({
      sessionId: result.session.id,
      status: result.session.status,
      resumed: result.resumed,
      alreadyFinished: result.alreadyFinished,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '开启考试失败，请重试';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

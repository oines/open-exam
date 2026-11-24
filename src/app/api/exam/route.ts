import { NextRequest, NextResponse } from 'next/server';
import {
  getCollegeDirectory,
  getDefaultExam,
  getExamBySlug,
  stripExamSecrets,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug')?.trim();
  const exam = slug ? getExamBySlug(slug) : getDefaultExam();

  if (!exam) {
    return NextResponse.json({ error: '未找到对应的考试活动' }, { status: 404 });
  }

  const collegeDirectory = getCollegeDirectory();
  return NextResponse.json({
    exam: stripExamSecrets(exam),
    collegeDirectory,
  });
}

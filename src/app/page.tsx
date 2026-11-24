import { ExamEntryClient } from '@/components/ExamEntryClient';
import { getCollegeDirectory, getDefaultExam, stripExamSecrets } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const exam = getDefaultExam();
  const collegeDirectory = getCollegeDirectory();

  if (!exam) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f3ee] p-6">
        <div className="exam-surface max-w-md rounded-[3px] p-8 text-center">
          <h1 className="text-lg font-semibold">暂无考试</h1>
          <p className="mt-2 text-sm text-[#57534a]">请管理员在 /admin 创建考试。</p>
        </div>
      </div>
    );
  }

  return <ExamEntryClient exam={stripExamSecrets(exam)} collegeDirectory={collegeDirectory} />;
}

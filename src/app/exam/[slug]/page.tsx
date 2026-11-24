import { notFound } from 'next/navigation';
import { ExamEntryClient } from '@/components/ExamEntryClient';
import { getCollegeDirectory, getExamBySlug, stripExamSecrets } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function ExamSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const exam = getExamBySlug(slug);
  if (!exam) {
    notFound();
  }
  const collegeDirectory = getCollegeDirectory();

  return <ExamEntryClient exam={stripExamSecrets(exam)} collegeDirectory={collegeDirectory} />;
}

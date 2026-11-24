import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import {
  ensureSessionFreshness,
  getExamById,
  listQuestionsByExam,
  listSessionsByExam,
} from '@/lib/db';
import { computeSessionPassed, isAnswerCorrect } from '@/lib/grading';

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
  const exam = Number.isFinite(examId) ? getExamById(examId) : null;
  if (!exam) {
    return NextResponse.json({ error: '未找到该考试活动' }, { status: 404 });
  }

  const questions = listQuestionsByExam(examId);
  const questionById = new Map(questions.map((q) => [q.id, q]));

  const rawSessions = listSessionsByExam(examId);
  const sessions = rawSessions.map(ensureSessionFreshness);

  const completed = sessions.filter((s) => s.status !== 'in_progress');
  const inProgressCount = sessions.length - completed.length;
  const activeCheated = completed.filter((s) => s.is_cheated && !s.cheat_overridden);
  const passedList = completed.filter((s) => computeSessionPassed(s, exam.pass_score));

  const effectiveScores = completed.map((s) => s.effective_score);
  const rawScores = completed.map((s) => s.raw_score);
  const durations = completed
    .map((s) => s.duration_sec)
    .filter((d): d is number => typeof d === 'number' && d > 0);

  const avg = (nums: number[]) =>
    nums.length > 0
      ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
      : 0;

  // Score distribution (effective score)
  const buckets = [
    { label: '0-59', min: 0, max: 59.99, count: 0 },
    { label: '60-69', min: 60, max: 69.99, count: 0 },
    { label: '70-79', min: 70, max: 79.99, count: 0 },
    { label: '80-89', min: 80, max: 89.99, count: 0 },
    { label: '90-100', min: 90, max: 100.01, count: 0 },
  ];
  for (const score of effectiveScores) {
    const b = buckets.find((x) => score >= x.min && score <= x.max);
    if (b) b.count += 1;
  }

  // Question & subject statistics across all completed sessions
  const qStatsMap = new Map<number, { appearances: number; correct: number }>();
  const subjectMap = new Map<string, { total: number; correct: number }>();

  for (const q of questions) {
    qStatsMap.set(q.id, { appearances: 0, correct: 0 });
    if (!subjectMap.has(q.subject)) {
      subjectMap.set(q.subject, { total: 0, correct: 0 });
    }
  }

  for (const s of completed) {
    for (const qid of s.question_ids) {
      const q = questionById.get(qid);
      if (!q) continue;
      const selected = s.answers[String(qid)] ?? [];
      const ok = isAnswerCorrect(selected, q.answer);

      const qStat = qStatsMap.get(qid)!;
      qStat.appearances += 1;
      if (ok) qStat.correct += 1;

      const subStat = subjectMap.get(q.subject) ?? { total: 0, correct: 0 };
      subStat.total += 1;
      if (ok) subStat.correct += 1;
      subjectMap.set(q.subject, subStat);
    }
  }

  const subjectStats = Array.from(subjectMap.entries()).map(([subject, st]) => ({
    subject,
    total: st.total,
    correct: st.correct,
    accuracy: st.total > 0 ? Math.round((st.correct / st.total) * 1000) / 10 : 0,
  }));

  const questionStats = questions.map((q) => {
    const st = qStatsMap.get(q.id) ?? { appearances: 0, correct: 0 };
    const wrong = st.appearances - st.correct;
    const errorRate =
      st.appearances > 0 ? Math.round((wrong / st.appearances) * 1000) / 10 : 0;
    return {
      ...q,
      appearances: st.appearances,
      correctCount: st.correct,
      wrongCount: wrong,
      errorRate,
    };
  });

  // College participation summary
  const collegeMap = new Map<string, { total: number; passed: number; cheated: number }>();
  for (const s of completed) {
    const key = s.college || '未填学院';
    const cur = collegeMap.get(key) ?? { total: 0, passed: 0, cheated: 0 };
    cur.total += 1;
    if (computeSessionPassed(s, exam.pass_score)) cur.passed += 1;
    if (s.is_cheated && !s.cheat_overridden) cur.cheated += 1;
    collegeMap.set(key, cur);
  }
  const collegeStats = Array.from(collegeMap.entries())
    .map(([college, st]) => ({
      college,
      ...st,
      passRate: st.total > 0 ? Math.round((st.passed / st.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({
    exam,
    summary: {
      totalParticipants: sessions.length,
      completedCount: completed.length,
      inProgressCount,
      passedCount: passedList.length,
      passRate:
        completed.length > 0
          ? Math.round((passedList.length / completed.length) * 1000) / 10
          : 0,
      cheatedCount: activeCheated.length,
      cheatRate:
        completed.length > 0
          ? Math.round((activeCheated.length / completed.length) * 1000) / 10
          : 0,
      avgEffectiveScore: avg(effectiveScores),
      avgRawScore: avg(rawScores),
      maxScore: effectiveScores.length > 0 ? Math.max(...effectiveScores) : 0,
      minScore: effectiveScores.length > 0 ? Math.min(...effectiveScores) : 0,
      avgDurationSec: Math.round(avg(durations)),
    },
    scoreDistribution: buckets.map(({ label, count }) => ({ label, count })),
    subjectStats,
    collegeStats,
    sessions: sessions.map((s) => ({
      id: s.id,
      student_name: s.student_name,
      student_id: s.student_id,
      college: s.college,
      class_name: s.class_name,
      status: s.status,
      violation_count: s.violation_count,
      is_cheated: s.is_cheated,
      cheat_overridden: s.cheat_overridden,
      override_note: s.override_note,
      raw_score: s.raw_score,
      effective_score: s.effective_score,
      correct_count: s.correct_count,
      total_questions: s.total_questions,
      passed: s.status !== 'in_progress' && computeSessionPassed(s, exam.pass_score),
      started_at: s.started_at,
      submitted_at: s.submitted_at,
      duration_sec: s.duration_sec,
    })),
    questionStats,
  });
}

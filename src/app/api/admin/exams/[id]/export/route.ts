import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import {
  ensureSessionFreshness,
  getExamById,
  listQuestionsByExam,
  listSessionsByExam,
} from '@/lib/db';
import { computeSessionPassed, formatOptionKeys, isAnswerCorrect, TYPE_LABELS } from '@/lib/grading';

export const dynamic = 'force-dynamic';

function csvCell(val: unknown): string {
  const str = String(val ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', { hour12: false });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: '未登录管理后台' }, { status: 401 });
  }

  const { id } = await context.params;
  const examId = Number(id);
  const exam = Number.isFinite(examId) ? getExamById(examId) : null;
  if (!exam) {
    return NextResponse.json({ error: '未找到该活动' }, { status: 404 });
  }

  const type = request.nextUrl.searchParams.get('type') || 'submissions';
  const questions = listQuestionsByExam(examId);
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const sessions = listSessionsByExam(examId).map(ensureSessionFreshness);

  let lines: string[] = [];
  let filename = '';

  if (type === 'questions') {
    const completed = sessions.filter((s) => s.status !== 'in_progress');
    const qStats = new Map<number, { appearances: number; correct: number }>();
    for (const q of questions) qStats.set(q.id, { appearances: 0, correct: 0 });
    for (const s of completed) {
      for (const qid of s.question_ids) {
        const q = questionById.get(qid);
        if (!q) continue;
        const st = qStats.get(qid)!;
        st.appearances += 1;
        if (isAnswerCorrect(s.answers[String(qid)] ?? [], q.answer)) st.correct += 1;
      }
    }

    const header = ['题号', '科目', '题型', '题干', '标准答案', '抽中次数', '答对次数', '答错次数', '错误率(%)', '考点解析'];
    lines = [header.map(csvCell).join(',')];

    const sorted = [...questions].sort((a, b) => {
      const sa = qStats.get(a.id)!;
      const sb = qStats.get(b.id)!;
      const ea = sa.appearances > 0 ? (sa.appearances - sa.correct) / sa.appearances : -1;
      const eb = sb.appearances > 0 ? (sb.appearances - sb.correct) / sb.appearances : -1;
      return eb - ea;
    });

    for (const q of sorted) {
      const st = qStats.get(q.id)!;
      const wrong = st.appearances - st.correct;
      const errRate = st.appearances > 0 ? ((wrong / st.appearances) * 100).toFixed(1) : '0.0';
      lines.push(
        [
          q.code,
          q.subject,
          TYPE_LABELS[q.type],
          q.prompt,
          formatOptionKeys(q.answer, q.type),
          st.appearances,
          st.correct,
          wrong,
          errRate,
          q.explanation,
        ]
          .map(csvCell)
          .join(','),
      );
    }
    filename = `${exam.slug}-question-stats.csv`;
  } else {
    const subjects = Array.from(new Set(questions.map((q) => q.subject)));
    const header = [
      '姓名',
      '学号',
      '学院',
      '班级',
      '状态',
      '有效成绩',
      '原始卷面分',
      '是否及格',
      '答对题数',
      '总题数',
      ...subjects.map((s) => `${s}正确率`),
      '切屏次数',
      '是否作弊',
      '人工复核备注',
      '用时(秒)',
      '开考时间',
      '交卷时间',
    ];
    lines = [header.map(csvCell).join(',')];

    const statusLabel: Record<string, string> = {
      in_progress: '作答中',
      submitted: '正常交卷',
      timeout_submitted: '超时自动交卷',
      cheated_submitted: '切屏作弊强制交卷',
    };

    for (const s of sessions) {
      const perSubject = new Map<string, { total: number; correct: number }>();
      for (const qid of s.question_ids) {
        const q = questionById.get(qid);
        if (!q) continue;
        const cur = perSubject.get(q.subject) ?? { total: 0, correct: 0 };
        cur.total += 1;
        if (isAnswerCorrect(s.answers[String(qid)] ?? [], q.answer)) cur.correct += 1;
        perSubject.set(q.subject, cur);
      }

      const passed = s.status !== 'in_progress' && computeSessionPassed(s, exam.pass_score);
      const cheatStatus = !s.is_cheated
        ? '正常'
        : s.cheat_overridden
          ? '作弊已复核恢复'
          : '作弊无效';

      lines.push(
        [
          s.student_name,
          `\t${s.student_id}`, // preserve long student IDs in Excel without scientific notation
          s.college,
          s.class_name,
          statusLabel[s.status] || s.status,
          s.status === 'in_progress' ? '' : s.effective_score,
          s.status === 'in_progress' ? '' : s.raw_score,
          s.status === 'in_progress' ? '' : passed ? '及格' : '未及格',
          s.correct_count,
          s.total_questions,
          ...subjects.map((sub) => {
            const st = perSubject.get(sub);
            if (!st || st.total === 0) return '-';
            return `${st.correct}/${st.total} (${Math.round((st.correct / st.total) * 100)}%)`;
          }),
          s.violation_count,
          cheatStatus,
          s.override_note,
          s.duration_sec ?? '',
          formatDateTime(s.started_at),
          formatDateTime(s.submitted_at),
        ]
          .map(csvCell)
          .join(','),
      );
    }
    filename = `${exam.slug}-submissions.csv`;
  }

  const csvBody = '\uFEFF' + lines.join('\r\n');
  return new NextResponse(csvBody, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

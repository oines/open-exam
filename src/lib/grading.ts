import crypto from 'node:crypto';
import type {
  BreakdownStat,
  ExamSessionRecord,
  PublicQuestion,
  QuestionRecord,
  QuestionType,
  ReviewItem,
} from '@/lib/types';

const TYPE_ORDER: Record<QuestionType, number> = {
  single: 0,
  multiple: 1,
  judge: 2,
};

export const TYPE_LABELS: Record<QuestionType, string> = {
  single: '单选题',
  multiple: '多选题',
  judge: '判断题',
};

/**
 * Pure uniform random draw (Fisher-Yates using crypto.randomInt) without replacement,
 * then grouped cleanly by question type (single -> multiple -> judge) for exam readability.
 */
export function drawRandomQuestions(
  pool: QuestionRecord[],
  count: number,
): QuestionRecord[] {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  const drawn = copy.slice(0, Math.min(count, copy.length));
  return drawn.sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);
}

export function stripQuestionSecrets(q: QuestionRecord): PublicQuestion {
  return {
    id: q.id,
    code: q.code,
    subject: q.subject,
    type: q.type,
    prompt: q.prompt,
    options: q.options,
  };
}

export function normalizeKeys(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  const unique = new Set<string>();
  for (const item of keys) {
    if (typeof item === 'string' && item.trim()) {
      unique.add(item.trim().toUpperCase());
    }
  }
  return Array.from(unique).sort();
}

export function isAnswerCorrect(selected: string[], correct: string[]): boolean {
  const a = normalizeKeys(selected);
  const b = normalizeKeys(correct);
  if (a.length === 0 || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function gradeQuestions(
  questions: QuestionRecord[],
  answers: Record<string, string[]>,
) {
  let correctCount = 0;
  const totalQuestions = questions.length;
  const review: ReviewItem[] = [];

  for (const q of questions) {
    const selected = normalizeKeys(answers[String(q.id)] ?? []);
    const correctAnswer = normalizeKeys(q.answer);
    const ok = isAnswerCorrect(selected, correctAnswer);
    if (ok) correctCount += 1;
    review.push({
      question_id: q.id,
      code: q.code,
      subject: q.subject,
      type: q.type,
      prompt: q.prompt,
      options: q.options,
      selected,
      correct_answer: correctAnswer,
      is_correct: ok,
      explanation: q.explanation,
    });
  }

  const rawScore =
    totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 1000) / 10 : 0;

  return {
    correctCount,
    totalQuestions,
    rawScore,
    totalScore: 100,
    review,
  };
}

export function computeBreakdowns(review: ReviewItem[]): {
  bySubject: BreakdownStat[];
  byType: BreakdownStat[];
} {
  const subjectMap = new Map<string, { total: number; correct: number }>();
  const typeMap = new Map<QuestionType, { total: number; correct: number }>();

  for (const item of review) {
    const s = subjectMap.get(item.subject) ?? { total: 0, correct: 0 };
    s.total += 1;
    if (item.is_correct) s.correct += 1;
    subjectMap.set(item.subject, s);

    const t = typeMap.get(item.type) ?? { total: 0, correct: 0 };
    t.total += 1;
    if (item.is_correct) t.correct += 1;
    typeMap.set(item.type, t);
  }

  const bySubject: BreakdownStat[] = Array.from(subjectMap.entries()).map(
    ([label, stat]) => ({
      label,
      total: stat.total,
      correct: stat.correct,
      accuracy: stat.total > 0 ? Math.round((stat.correct / stat.total) * 1000) / 10 : 0,
    }),
  );

  const orderedTypes: QuestionType[] = ['single', 'multiple', 'judge'];
  const byType: BreakdownStat[] = orderedTypes
    .filter((k) => typeMap.has(k))
    .map((k) => {
      const stat = typeMap.get(k)!;
      return {
        label: TYPE_LABELS[k],
        total: stat.total,
        correct: stat.correct,
        accuracy: stat.total > 0 ? Math.round((stat.correct / stat.total) * 1000) / 10 : 0,
      };
    });

  return { bySubject, byType };
}

export function formatOptionKeys(keys: string[], type: QuestionType): string {
  if (keys.length === 0) return '未作答';
  if (type === 'judge') {
    return keys[0] === 'T' ? '正确' : keys[0] === 'F' ? '错误' : keys.join('');
  }
  return keys.join('');
}

export function computeSessionPassed(
  session: Pick<ExamSessionRecord, 'is_cheated' | 'cheat_overridden' | 'effective_score'>,
  passScore: number,
): boolean {
  if (session.is_cheated && !session.cheat_overridden) return false;
  return session.effective_score >= passScore;
}

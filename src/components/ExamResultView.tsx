'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertOctagon,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import type {
  BreakdownStat,
  ExamConfig,
  ExamSessionRecord,
  QuestionType,
  ReviewItem,
} from '@/lib/types';

const TYPE_LABELS: Record<QuestionType, string> = {
  single: '单选',
  multiple: '多选',
  judge: '判断',
};

function formatAnswerKeys(keys: string[], type: QuestionType): string {
  if (keys.length === 0) return '未作答';
  if (type === 'judge') {
    return keys[0] === 'T' ? '正确' : keys[0] === 'F' ? '错误' : keys.join('');
  }
  return keys.join('、');
}

function formatDuration(sec: number | null): string {
  if (!sec || sec < 0) return '--';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} 分 ${String(s).padStart(2, '0')} 秒`;
}

function formatTime(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('zh-CN', { hour12: false });
}

interface ExamResultViewProps {
  exam: ExamConfig;
  session: ExamSessionRecord;
  passed: boolean;
  breakdowns: {
    bySubject: BreakdownStat[];
    byType: BreakdownStat[];
  };
  review: ReviewItem[] | null;
}

export function ExamResultView({
  exam,
  session,
  passed,
  breakdowns,
  review,
}: ExamResultViewProps) {
  const [filter, setFilter] = useState<'all' | 'wrong' | 'correct'>('all');

  const activeCheatInvalid = session.is_cheated && !session.cheat_overridden;

  const wrongCount = useMemo(
    () => (review ? review.filter((r) => !r.is_correct).length : 0),
    [review],
  );
  const correctCount = useMemo(
    () => (review ? review.filter((r) => r.is_correct).length : session.correct_count),
    [review, session.correct_count],
  );

  const filteredReview = useMemo(() => {
    if (!review) return [];
    if (filter === 'wrong') return review.filter((r) => !r.is_correct);
    if (filter === 'correct') return review.filter((r) => r.is_correct);
    return review;
  }, [review, filter]);

  const statusText =
    session.status === 'cheated_submitted'
      ? '切屏作弊自动交卷'
      : session.status === 'timeout_submitted'
        ? '超时自动交卷'
        : '正常交卷';

  return (
    <div className="min-h-screen bg-[#f5f3ee] text-[#1a1917]">
      <header className="border-b border-[#dcd5c7] bg-[#fdfcf9]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
          <span className="text-sm font-semibold text-[#1a1917]">{exam.title}</span>
          <Link
            href={`/exam/${exam.slug}`}
            className="inline-flex items-center gap-1.5 text-xs text-[#57534a] transition-colors hover:text-[#1a1917]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回首页
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        {activeCheatInvalid && (
          <div className="flex items-start gap-3 rounded-[3px] border border-[#b4281e] bg-[#faeae8] p-4 text-[#b4281e]">
            <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-1 text-sm">
              <div className="font-semibold">
                切屏 {session.violation_count} 次（超过上限 {exam.max_violations} 次），已判作弊并自动交卷
              </div>
              <p className="text-xs text-[#b4281e]/90">
                本次成绩无效（记 0 分）。如有误判请联系管理员查看切屏记录。
              </p>
            </div>
          </div>
        )}

        {session.is_cheated && session.cheat_overridden && (
          <div className="flex items-start gap-3 rounded-[3px] border border-[#1b6647]/40 bg-[#e8f3ed] p-4 text-[#1b6647]">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="text-xs leading-5">
              <strong>管理员已恢复本次成绩有效</strong>
              {session.override_note ? `（${session.override_note}）` : ''}
            </div>
          </div>
        )}

        <section className="exam-surface rounded-[3px] p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-6 border-b border-[#dcd5c7] pb-6 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-xl font-bold text-[#1a1917]">
                {session.student_name}
                <span className="font-mono-num ml-3 text-base font-normal text-[#57534a]">
                  {session.student_id}
                </span>
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#57534a]">
                {session.college && <span>{session.college}</span>}
                {session.class_name && <span>{session.class_name}</span>}
                <span>{statusText}</span>
              </div>
            </div>

            <div className="flex items-center gap-5">
              <div className="text-right">
                <div className="text-xs text-[#8c867a]">
                  {activeCheatInvalid ? '成绩（作废）' : '得分'}
                </div>
                <div
                  className={`font-mono-num text-4xl font-bold leading-none sm:text-5xl ${
                    activeCheatInvalid
                      ? 'text-[#b4281e]'
                      : passed
                        ? 'text-[#1b6647]'
                        : 'text-[#a65c08]'
                  }`}
                >
                  {session.effective_score}
                  <span className="text-base font-normal text-[#8c867a]"> / 100</span>
                </div>
              </div>

              <div
                className={`rounded-[2px] border px-3 py-1 text-xs font-semibold ${
                  activeCheatInvalid
                    ? 'border-[#b4281e] bg-[#faeae8] text-[#b4281e]'
                    : passed
                      ? 'border-[#1b6647] bg-[#e8f3ed] text-[#1b6647]'
                      : 'border-[#a65c08] bg-[#fbf2e4] text-[#a65c08]'
                }`}
              >
                {activeCheatInvalid ? '作弊无效' : passed ? '及格' : '未及格'}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-[2px] border border-[#dcd5c7] bg-[#f5f3ee]/60 p-3.5">
              <div className="text-xs text-[#8c867a]">答对</div>
              <div className="font-mono-num mt-1 text-lg font-bold text-[#1a1917]">
                {session.correct_count}
                <span className="text-xs font-normal text-[#8c867a]">
                  {' '}
                  / {session.total_questions} 题
                </span>
              </div>
            </div>
            <div className="rounded-[2px] border border-[#dcd5c7] bg-[#f5f3ee]/60 p-3.5">
              <div className="flex items-center gap-1 text-xs text-[#8c867a]">
                <Clock className="h-3 w-3" />
                用时
              </div>
              <div className="font-mono-num mt-1 text-lg font-bold text-[#1a1917]">
                {formatDuration(session.duration_sec)}
              </div>
            </div>
            <div className="rounded-[2px] border border-[#dcd5c7] bg-[#f5f3ee]/60 p-3.5">
              <div className="flex items-center gap-1 text-xs text-[#8c867a]">
                <ShieldAlert className="h-3 w-3" />
                切屏
              </div>
              <div
                className={`font-mono-num mt-1 text-lg font-bold ${
                  session.violation_count > exam.max_violations
                    ? 'text-[#b4281e]'
                    : session.violation_count > 0
                      ? 'text-[#a65c08]'
                      : 'text-[#1b6647]'
                }`}
              >
                {session.violation_count}
                <span className="text-xs font-normal text-[#8c867a]">
                  {' '}
                  / {exam.max_violations} 次
                </span>
              </div>
            </div>
            <div className="rounded-[2px] border border-[#dcd5c7] bg-[#f5f3ee]/60 p-3.5">
              <div className="text-xs text-[#8c867a]">及格线</div>
              <div className="font-mono-num mt-1 text-lg font-bold text-[#1a1917]">
                {exam.pass_score}
                <span className="text-xs font-normal text-[#8c867a]"> 分</span>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="exam-surface rounded-[3px] p-6">
            <h2 className="mb-4 text-xs font-semibold text-[#57534a]">各科正确率</h2>
            <div className="space-y-3.5">
              {breakdowns.bySubject.map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-[#1a1917]">{item.label}</span>
                    <span className="font-mono-num text-[#57534a]">
                      {item.correct} / {item.total}（{item.accuracy}%）
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-[2px] bg-[#eeeae1]">
                    <div
                      className="h-full bg-[#1b4965]"
                      style={{ width: `${item.accuracy}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="exam-surface rounded-[3px] p-6">
            <h2 className="mb-4 text-xs font-semibold text-[#57534a]">各题型正确率</h2>
            <div className="space-y-3.5">
              {breakdowns.byType.map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-[#1a1917]">{item.label}</span>
                    <span className="font-mono-num text-[#57534a]">
                      {item.correct} / {item.total}（{item.accuracy}%）
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-[2px] bg-[#eeeae1]">
                    <div
                      className="h-full bg-[#1a1917]"
                      style={{ width: `${item.accuracy}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {session.violations.length > 0 && (
              <div className="mt-5 border-t border-[#dcd5c7] pt-3.5">
                <div className="mb-2 text-xs font-medium text-[#b4281e]">
                  切屏记录（{session.violations.length} 次）
                </div>
                <div className="space-y-1 text-xs text-[#57534a]">
                  {session.violations.map((v) => (
                    <div key={v.index} className="font-mono-num flex justify-between">
                      <span>
                        第 {v.index} 次 · {formatTime(v.left_at)}
                      </span>
                      <span>
                        {v.duration_sec !== null && v.duration_sec !== undefined
                          ? `离开 ${v.duration_sec}s`
                          : '强制交卷'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {review ? (
          <section className="exam-surface rounded-[3px] p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#dcd5c7] pb-4">
              <h2 className="text-base font-semibold text-[#1a1917]">答题详情与解析</h2>
              <div className="flex rounded-[3px] border border-[#dcd5c7] bg-[#f5f3ee] p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className={`rounded-[2px] px-3 py-1 font-medium transition-colors ${
                    filter === 'all'
                      ? 'bg-[#1a1917] text-[#fdfcf9]'
                      : 'text-[#57534a] hover:text-[#1a1917]'
                  }`}
                >
                  全部 ({review.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('wrong')}
                  className={`rounded-[2px] px-3 py-1 font-medium transition-colors ${
                    filter === 'wrong'
                      ? 'bg-[#b4281e] text-[#fdfcf9]'
                      : 'text-[#57534a] hover:text-[#1a1917]'
                  }`}
                >
                  错题 ({wrongCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('correct')}
                  className={`rounded-[2px] px-3 py-1 font-medium transition-colors ${
                    filter === 'correct'
                      ? 'bg-[#1b6647] text-[#fdfcf9]'
                      : 'text-[#57534a] hover:text-[#1a1917]'
                  }`}
                >
                  答对 ({correctCount})
                </button>
              </div>
            </div>

            {filteredReview.length === 0 ? (
              <div className="py-10 text-center text-sm text-[#8c867a]">没有符合条件的题目</div>
            ) : (
              <div className="divide-y divide-[#dcd5c7]">
                {filteredReview.map((item, idx) => (
                  <article key={item.question_id} className="py-5 first:pt-1 last:pb-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono-num font-bold text-[#1a1917]">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="rounded-[2px] border border-[#dcd5c7] bg-[#f5f3ee] px-1.5 py-0.5 text-[11px] text-[#57534a]">
                        {TYPE_LABELS[item.type]}
                      </span>
                      <span className="rounded-[2px] border border-[#1b4965]/25 bg-[#eaf1f5] px-1.5 py-0.5 text-[11px] font-medium text-[#1b4965]">
                        {item.subject}
                      </span>
                      <span className="font-mono-num text-[11px] text-[#8c867a]">
                        题号 {item.code}
                      </span>
                      {item.is_correct ? (
                        <span className="ml-auto inline-flex items-center gap-1 font-medium text-[#1b6647]">
                          <CheckCircle2 className="h-3.5 w-3.5" /> 正确
                        </span>
                      ) : (
                        <span className="ml-auto inline-flex items-center gap-1 font-medium text-[#b4281e]">
                          <XCircle className="h-3.5 w-3.5" /> 错误
                        </span>
                      )}
                    </div>

                    <p className="text-sm font-medium leading-7 text-[#1a1917]">{item.prompt}</p>

                    <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                      {item.options.map((opt) => {
                        const isCorrectOpt = item.correct_answer.includes(opt.key);
                        const isSelectedOpt = item.selected.includes(opt.key);
                        let style = 'border-[#dcd5c7] bg-[#fdfcf9] text-[#57534a]';
                        if (isCorrectOpt) {
                          style = 'border-[#1b6647]/50 bg-[#e8f3ed] text-[#1b6647] font-medium';
                        } else if (isSelectedOpt && !isCorrectOpt) {
                          style = 'border-[#b4281e]/50 bg-[#faeae8] text-[#b4281e] font-medium';
                        }
                        return (
                          <div
                            key={opt.key}
                            className={`flex items-start gap-2 rounded-[2px] border px-3 py-2 text-xs leading-5 ${style}`}
                          >
                            <span className="font-mono-num font-bold">
                              {item.type === 'judge' ? (opt.key === 'T' ? '√' : '×') : `${opt.key}.`}
                            </span>
                            <span className="flex-1">{opt.label}</span>
                            {isSelectedOpt && (
                              <span className="shrink-0 text-[10px] opacity-80">已选</span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
                      <span>
                        你的答案：
                        <strong
                          className={`font-mono-num ${
                            item.is_correct ? 'text-[#1b6647]' : 'text-[#b4281e]'
                          }`}
                        >
                          {formatAnswerKeys(item.selected, item.type)}
                        </strong>
                      </span>
                      <span>
                        正确答案：
                        <strong className="font-mono-num text-[#1b6647]">
                          {formatAnswerKeys(item.correct_answer, item.type)}
                        </strong>
                      </span>
                    </div>

                    {item.explanation && (
                      <div className="mt-2.5 rounded-[2px] border-l-2 border-[#1b4965] bg-[#f5f3ee] px-3 py-2 text-xs leading-6 text-[#57534a]">
                        <strong className="text-[#1a1917]">解析：</strong>
                        {item.explanation}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="exam-surface rounded-[3px] p-6 text-center text-sm text-[#57534a]">
            本场考试未开放答案与解析查看。
          </section>
        )}
      </main>
    </div>
  );
}

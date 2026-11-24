'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  LayoutGrid,
  Send,
  ShieldAlert,
  X,
} from 'lucide-react';
import type {
  ExamConfig,
  ExamSessionRecord,
  PublicQuestion,
  QuestionType,
} from '@/lib/types';

const SECTION_META: Record<QuestionType, { title: string; badge: string; hint: string }> = {
  single: { title: '一、单项选择题', badge: '单选题', hint: '每题仅 1 个正确答案' },
  multiple: { title: '二、多项选择题', badge: '多选题', hint: '每题 2 个及以上正确答案，全对得分' },
  judge: { title: '三、判断题', badge: '判断题', hint: '判断正误' },
};

function formatCountdown(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface ExamHallClientProps {
  exam: ExamConfig;
  initialSession: ExamSessionRecord;
  questions: PublicQuestion[];
  serverNow: string;
  onFinalized: () => void;
}

export function ExamHallClient({
  exam,
  initialSession,
  questions,
  serverNow,
  onFinalized,
}: ExamHallClientProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>(
    initialSession.answers || {},
  );
  const [flaggedIds, setFlaggedIds] = useState<number[]>(initialSession.flagged_ids || []);
  const [sheetFilter, setSheetFilter] = useState<'all' | 'unanswered' | 'flagged'>('all');
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // Sync & submission state
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('saved');
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Anti-cheat state
  const [violationCount, setViolationCount] = useState(initialSession.violation_count);
  const [warningModal, setWarningModal] = useState<{
    open: boolean;
    count: number;
    reasonText: string;
  }>({ open: false, count: 0, reasonText: '' });
  const [cheatedLockOverlay, setCheatedLockOverlay] = useState(false);

  // Refs for stable event listeners & anti-debounce
  const answersRef = useRef(answers);
  const flaggedRef = useRef(flaggedIds);
  const lockedRef = useRef(false);
  const awayRef = useRef(false);
  const lastLeaveMsRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    flaggedRef.current = flaggedIds;
  }, [flaggedIds]);

  // Countdown based on server clock offset
  const clockOffsetMs = useMemo(
    () => new Date(serverNow).getTime() - Date.now(),
    [serverNow],
  );
  const expiresMs = useMemo(
    () => new Date(initialSession.expires_at).getTime(),
    [initialSession.expires_at],
  );

  const [remainingSec, setRemainingSec] = useState<number>(() =>
    Math.max(0, Math.ceil((expiresMs - (Date.now() + clockOffsetMs)) / 1000)),
  );

  const perQuestionPoints =
    questions.length > 0 ? Math.round((100 / questions.length) * 100) / 100 : 2.5;

  const answeredCount = useMemo(
    () => questions.filter((q) => (answers[String(q.id)]?.length ?? 0) > 0).length,
    [questions, answers],
  );
  const unansweredCount = questions.length - answeredCount;

  // Persist draft to server
  const flushSave = useCallback(async () => {
    if (lockedRef.current) return;
    setSaveState('saving');
    try {
      const res = await fetch(`/api/sessions/${initialSession.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: answersRef.current,
          flagged_ids: flaggedRef.current,
        }),
      });
      const data = (await res.json()) as { locked?: boolean };
      if (data.locked) {
        lockedRef.current = true;
        onFinalized();
        return;
      }
      setSaveState(res.ok ? 'saved' : 'error');
    } catch {
      setSaveState('error');
    }
  }, [initialSession.id, onFinalized]);

  const scheduleSave = useCallback(() => {
    setSaveState('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void flushSave();
    }, 350);
  }, [flushSave]);

  // Submit handler (manual or timeout)
  const handleSubmit = useCallback(
    async (reason: 'manual' | 'timeout') => {
      if (lockedRef.current) return;
      lockedRef.current = true;
      setSubmitting(true);
      setConfirmSubmitOpen(false);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      try {
        await fetch(`/api/sessions/${initialSession.id}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            answers: answersRef.current,
            flagged_ids: flaggedRef.current,
            reason,
          }),
        });
      } finally {
        onFinalized();
      }
    },
    [initialSession.id, onFinalized],
  );

  // Server-calibrated countdown interval
  useEffect(() => {
    const timer = setInterval(() => {
      if (lockedRef.current) return;
      const nowServer = Date.now() + clockOffsetMs;
      const left = Math.max(0, Math.ceil((expiresMs - nowServer) / 1000));
      setRemainingSec(left);
      if (left <= 0) {
        void handleSubmit('timeout');
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [clockOffsetMs, expiresMs, handleSubmit]);

  // Anti-cheat violation reporter
  const reportLeave = useCallback(
    async (reason: 'visibility_hidden' | 'window_blur') => {
      if (lockedRef.current) return;
      const now = Date.now();
      // Merge visibilitychange + blur fired within 850ms of the same Alt+Tab / tab switch
      if (awayRef.current || now - lastLeaveMsRef.current < 850) {
        return;
      }
      awayRef.current = true;
      lastLeaveMsRef.current = now;

      // Flush latest draft immediately before recording leave
      void flushSave();

      try {
        const res = await fetch(`/api/sessions/${initialSession.id}/violation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'leave', reason }),
          keepalive: true,
        });
        const data = (await res.json()) as {
          locked?: boolean;
          violation_count?: number;
          deduplicated?: boolean;
        };

        if (typeof data.violation_count === 'number') {
          setViolationCount(data.violation_count);
        }

        if (data.locked) {
          lockedRef.current = true;
          setWarningModal({ open: false, count: 0, reasonText: '' });
          setCheatedLockOverlay(true);
          setTimeout(() => {
            onFinalized();
          }, 2200);
          return;
        }

        if (!data.deduplicated && typeof data.violation_count === 'number') {
          setWarningModal({
            open: true,
            count: data.violation_count,
            reasonText:
              reason === 'visibility_hidden'
                ? '检测到切换浏览器标签页或最小化窗口'
                : '检测到离开考试窗口焦点（切至其他应用或副屏）',
          });
        }
      } catch {
        // Ignore transient network failure; next event or heartbeat re-syncs
      }
    },
    [flushSave, initialSession.id, onFinalized],
  );

  const reportReturn = useCallback(async () => {
    if (lockedRef.current || !awayRef.current) return;
    awayRef.current = false;
    try {
      await fetch(`/api/sessions/${initialSession.id}/violation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'return' }),
      });
    } catch {
      // non-blocking
    }
  }, [initialSession.id]);

  // Attach anti-cheat listeners
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        void reportLeave('visibility_hidden');
      } else {
        void reportReturn();
      }
    };

    const onBlur = () => {
      void reportLeave('window_blur');
    };

    const onFocus = () => {
      if (!document.hidden) {
        void reportReturn();
      }
    };

    const preventAction = (e: Event) => {
      e.preventDefault();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (lockedRef.current) return;
      const key = e.key.toLowerCase();
      // Block common copy / print / save / view-source shortcuts
      if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'p', 's', 'u'].includes(key)) {
        e.preventDefault();
        return;
      }

      // Skip shortcuts when modal open
      if (warningModal.open || confirmSubmitOpen) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentIndex((i) => Math.min(questions.length - 1, i + 1));
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('contextmenu', preventAction);
    document.addEventListener('copy', preventAction);
    document.addEventListener('cut', preventAction);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('contextmenu', preventAction);
      document.removeEventListener('copy', preventAction);
      document.removeEventListener('cut', preventAction);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [reportLeave, reportReturn, warningModal.open, confirmSubmitOpen, questions.length]);

  const currentQuestion = questions[currentIndex];
  const currentSelected = currentQuestion ? answers[String(currentQuestion.id)] ?? [] : [];
  const isFlagged = currentQuestion ? flaggedIds.includes(currentQuestion.id) : false;

  const toggleOption = (q: PublicQuestion, optKey: string) => {
    if (lockedRef.current) return;
    setAnswers((prev) => {
      const qid = String(q.id);
      const existing = prev[qid] ?? [];
      let next: string[];
      if (q.type === 'multiple') {
        next = existing.includes(optKey)
          ? existing.filter((k) => k !== optKey)
          : [...existing, optKey].sort();
      } else {
        next = [optKey];
      }
      const updated = { ...prev, [qid]: next };
      if (next.length === 0) delete updated[qid];
      answersRef.current = updated;
      return updated;
    });
    scheduleSave();
  };

  const toggleFlag = (qId: number) => {
    if (lockedRef.current) return;
    setFlaggedIds((prev) => {
      const next = prev.includes(qId) ? prev.filter((id) => id !== qId) : [...prev, qId];
      flaggedRef.current = next;
      return next;
    });
    scheduleSave();
  };

  // Group questions by type for the Answer Sheet Matrix
  const sections = useMemo(() => {
    const order: QuestionType[] = ['single', 'multiple', 'judge'];
    return order
      .map((type) => ({
        type,
        meta: SECTION_META[type],
        items: questions
          .map((q, index) => ({ q, index }))
          .filter(({ q }) => q.type === type),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [questions]);

  const isLowTime = remainingSec <= 180;

  return (
    <div className="exam-no-select min-h-screen bg-[#f5f3ee] text-[#1a1917]">
      {/* Sticky Precision Exam Top Bar */}
      <header className="sticky top-0 z-30 border-b border-[#dcd5c7] bg-[#fdfcf9]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {/* Exam & Candidate info */}
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-[#1a1917]">{exam.title}</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[11px] text-[#57534a]">
              <span className="font-medium text-[#1a1917]">{initialSession.student_name}</span>
              <span className="font-mono-num">{initialSession.student_id}</span>
              {initialSession.class_name && (
                <span className="hidden sm:inline">{initialSession.class_name}</span>
              )}
              <span className="text-[#8c867a]">
                ·{' '}
                {saveState === 'saving'
                  ? '保存中...'
                  : saveState === 'error'
                    ? '保存失败'
                    : '已保存'}
              </span>
            </div>
          </div>

          {/* Right HUD: Integrity Pips + Timer + Submit */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Integrity / Tab-switch indicator */}
            <div
              className={`flex items-center gap-2 rounded-[3px] border px-2.5 py-1.5 text-xs ${
                violationCount >= exam.max_violations
                  ? 'border-[#b4281e] bg-[#faeae8] text-[#b4281e]'
                  : violationCount > 0
                    ? 'border-[#a65c08]/40 bg-[#fbf2e4] text-[#a65c08]'
                    : 'border-[#dcd5c7] bg-[#f5f3ee] text-[#57534a]'
              }`}
              title={`切屏超过 ${exam.max_violations} 次将直接判作弊并强制交卷`}
            >
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">切屏</span>
              <span className="font-mono-num font-bold">
                {violationCount} / {exam.max_violations}
              </span>
              <div className="hidden items-center gap-1 md:flex">
                {Array.from({ length: Math.max(1, exam.max_violations) }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-2 w-2 rounded-[1px] ${
                      i < violationCount
                        ? violationCount >= exam.max_violations
                          ? 'bg-[#b4281e]'
                          : 'bg-[#a65c08]'
                        : 'bg-[#dcd5c7]'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Countdown */}
            <div
              className={`font-mono-num flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1.5 text-sm font-bold ${
                isLowTime
                  ? 'border-[#b4281e] bg-[#faeae8] text-[#b4281e]'
                  : 'border-[#dcd5c7] bg-[#f5f3ee] text-[#1a1917]'
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              {formatCountdown(remainingSec)}
            </div>

            {/* Mobile sheet trigger */}
            <button
              type="button"
              onClick={() => setMobileSheetOpen(true)}
              className="inline-flex items-center gap-1 rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] px-2.5 py-1.5 text-xs font-medium text-[#1a1917] lg:hidden"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="font-mono-num">
                {answeredCount}/{questions.length}
              </span>
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => setConfirmSubmitOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-[3px] bg-[#1a1917] px-3.5 py-1.5 text-xs font-medium text-[#fdfcf9] transition-colors hover:bg-[#1b4965] disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              交卷
            </button>
          </div>
        </div>
      </header>

      {/* Main Two-Column Exam Workspace */}
      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-12 lg:items-start">
        {/* Left: Question Sheet (8 cols) */}
        <section className="lg:col-span-8">
          {currentQuestion && (
            <div className="exam-surface flex min-h-[520px] flex-col justify-between rounded-[3px] p-6 sm:p-8">
              <div>
                {/* Question Meta Ledger */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#dcd5c7] pb-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono-num text-base font-bold text-[#1a1917]">
                      第 {String(currentIndex + 1).padStart(2, '0')}
                      <span className="text-xs font-normal text-[#8c867a]">
                        {' '}
                        / {String(questions.length).padStart(2, '0')} 题
                      </span>
                    </span>
                    <span
                      className={`rounded-[2px] border px-2 py-0.5 text-xs font-medium ${
                        currentQuestion.type === 'multiple'
                          ? 'border-[#a65c08]/40 bg-[#fbf2e4] text-[#a65c08]'
                          : 'border-[#1b4965]/30 bg-[#eaf1f5] text-[#1b4965]'
                      }`}
                    >
                      {SECTION_META[currentQuestion.type].badge}
                    </span>
                    <span className="rounded-[2px] border border-[#dcd5c7] bg-[#f5f3ee] px-2 py-0.5 text-xs text-[#57534a]">
                      {currentQuestion.subject}
                    </span>
                    <span className="font-mono-num text-xs text-[#8c867a]">
                      {perQuestionPoints} 分
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleFlag(currentQuestion.id)}
                    className={`inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 text-xs font-medium transition-colors ${
                      isFlagged
                        ? 'border-[#a65c08] bg-[#fbf2e4] text-[#a65c08]'
                        : 'border-[#dcd5c7] bg-[#fdfcf9] text-[#57534a] hover:border-[#1a1917] hover:text-[#1a1917]'
                    }`}
                  >
                    <Flag className="h-3.5 w-3.5" />
                    {isFlagged ? '已标疑' : '标记待复查'}
                  </button>
                </div>

                {/* Hint for multi-choice */}
                <div className="mt-3 text-[11px] text-[#8c867a]">
                  {SECTION_META[currentQuestion.type].hint}
                </div>

                {/* Question Prompt */}
                <h2 className="mt-3 text-lg font-medium leading-8 text-[#1a1917] sm:text-[19px]">
                  {currentQuestion.prompt}
                </h2>

                {/* Options List */}
                <div className="mt-6 space-y-3">
                  {currentQuestion.options.map((opt) => {
                    const selected = currentSelected.includes(opt.key);
                    const isMulti = currentQuestion.type === 'multiple';
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => toggleOption(currentQuestion, opt.key)}
                        className={`group flex w-full items-start gap-3.5 rounded-[3px] border px-4 py-3.5 text-left transition-colors ${
                          selected
                            ? 'border-[#1b4965] bg-[#eaf1f5] text-[#1a1917]'
                            : 'border-[#dcd5c7] bg-[#fdfcf9] text-[#1a1917] hover:border-[#1a1917] hover:bg-[#f5f3ee]/60'
                        }`}
                      >
                        {/* Distinct geometry: square for multiple, circle for single/judge */}
                        <span
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border text-xs font-bold transition-colors ${
                            isMulti ? 'rounded-[2px]' : 'rounded-full'
                          } ${
                            selected
                              ? 'border-[#1b4965] bg-[#1b4965] text-[#fdfcf9]'
                              : 'border-[#bfb7a6] bg-[#fdfcf9] text-[#57534a] group-hover:border-[#1a1917]'
                          }`}
                        >
                          {selected && isMulti ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : currentQuestion.type === 'judge' ? (
                            opt.key === 'T' ? (
                              '√'
                            ) : (
                              '×'
                            )
                          ) : (
                            opt.key
                          )}
                        </span>
                        <span className="flex-1 text-sm leading-6 sm:text-[15px]">
                          {isMulti && (
                            <span className="font-mono-num mr-1.5 font-semibold text-[#57534a]">
                              {opt.key}.
                            </span>
                          )}
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bottom Navigation Footer */}
              <div className="mt-8 flex items-center justify-between border-t border-[#dcd5c7] pt-5">
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  className="inline-flex items-center gap-1.5 rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] px-4 py-2 text-xs font-medium text-[#1a1917] transition-colors hover:border-[#1a1917] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                  上一题
                </button>

                <span className="hidden text-[11px] text-[#8c867a] sm:inline">
                  支持键盘 ← / → 快速切换题目
                </span>

                {currentIndex < questions.length - 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))
                    }
                    className="inline-flex items-center gap-1.5 rounded-[3px] bg-[#1a1917] px-4 py-2 text-xs font-medium text-[#fdfcf9] transition-colors hover:bg-[#1b4965]"
                  >
                    下一题
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmSubmitOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-[3px] bg-[#1b6647] px-4 py-2 text-xs font-medium text-[#fdfcf9] transition-colors hover:bg-[#155238]"
                  >
                    <Send className="h-3.5 w-3.5" />
                    提交试卷
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Right: Answer Sheet Matrix (Desktop 4 cols) */}
        <aside className="hidden lg:col-span-4 lg:block">
          <div className="exam-surface sticky top-20 rounded-[3px] p-5">
            <AnswerSheetContent
              sections={sections}
              answers={answers}
              flaggedIds={flaggedIds}
              currentIndex={currentIndex}
              answeredCount={answeredCount}
              totalCount={questions.length}
              sheetFilter={sheetFilter}
              onChangeFilter={setSheetFilter}
              onSelectIndex={setCurrentIndex}
              onRequestSubmit={() => setConfirmSubmitOpen(true)}
            />
          </div>
        </aside>
      </main>

      {/* Mobile Answer Sheet Drawer */}
      {mobileSheetOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/45 lg:hidden">
          <div className="max-h-[82vh] w-full overflow-y-auto rounded-t-[4px] border-t border-[#1a1917] bg-[#fdfcf9] p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">答题卡</span>
              <button
                type="button"
                onClick={() => setMobileSheetOpen(false)}
                className="p-1 text-[#57534a]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <AnswerSheetContent
              sections={sections}
              answers={answers}
              flaggedIds={flaggedIds}
              currentIndex={currentIndex}
              answeredCount={answeredCount}
              totalCount={questions.length}
              sheetFilter={sheetFilter}
              onChangeFilter={setSheetFilter}
              onSelectIndex={(idx) => {
                setCurrentIndex(idx);
                setMobileSheetOpen(false);
              }}
              onRequestSubmit={() => {
                setMobileSheetOpen(false);
                setConfirmSubmitOpen(true);
              }}
            />
          </div>
        </div>
      )}

      {/* Manual Submit Confirmation Modal */}
      {confirmSubmitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-[3px] border border-[#1a1917] bg-[#fdfcf9] p-6 shadow-xl">
            <h3 className="text-base font-semibold text-[#1a1917]">确认交卷？</h3>
            <p className="mt-2 text-sm leading-6 text-[#57534a]">
              已作答{' '}
              <strong className="font-mono-num text-[#1a1917]">{answeredCount}</strong> /{' '}
              <strong className="font-mono-num text-[#1a1917]">{questions.length}</strong> 题
              {unansweredCount > 0 ? (
                <>
                  ，还有{' '}
                  <strong className="font-mono-num text-[#b4281e]">
                    {unansweredCount} 题未答
                  </strong>
                  ，交卷后不可修改。
                </>
              ) : (
                '，交卷后将立即计算成绩。'
              )}
            </p>
            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmSubmitOpen(false)}
                className="rounded-[3px] border border-[#bfb7a6] px-4 py-2 text-xs font-medium text-[#1a1917] hover:border-[#1a1917]"
              >
                继续检查
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleSubmit('manual')}
                className="rounded-[3px] bg-[#1a1917] px-4 py-2 text-xs font-medium text-[#fdfcf9] hover:bg-[#1b4965] disabled:opacity-50"
              >
                {submitting ? '提交中...' : '确认交卷'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab-Switch Warning Modal (1..max_violations) */}
      {warningModal.open && !cheatedLockOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-[3px] border border-[#b4281e] bg-[#fdfcf9] p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#b4281e]" />
              <div>
                <h3 className="text-base font-semibold text-[#b4281e]">
                  切屏警告（第 {warningModal.count} / {exam.max_violations} 次）
                </h3>
                <p className="mt-1.5 text-xs leading-5 text-[#57534a]">
                  {warningModal.reasonText}，本次切屏已记录。
                </p>
                <div className="mt-3 rounded-[2px] border border-[#b4281e]/30 bg-[#faeae8] p-2.5 text-xs font-medium text-[#b4281e]">
                  {warningModal.count >= exam.max_violations
                    ? '已达切屏上限，下一次离开页面将直接判作弊并强制交卷。'
                    : `切屏超过 ${exam.max_violations} 次（第 ${exam.max_violations + 1} 次）将判作弊并强制交卷。`}
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setWarningModal({ open: false, count: 0, reasonText: '' })}
                className="rounded-[3px] bg-[#b4281e] px-4 py-2 text-xs font-medium text-[#fdfcf9] hover:bg-[#961f17]"
              >
                返回答题
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Irreversible Cheating Lock Overlay (> max_violations) */}
      {cheatedLockOverlay && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1a1917]/85 p-4">
          <div className="w-full max-w-md rounded-[3px] border border-[#b4281e] bg-[#fdfcf9] p-7 text-center shadow-2xl">
            <AlertOctagon className="mx-auto h-9 w-9 text-[#b4281e]" />
            <h3 className="mt-3 text-lg font-semibold text-[#b4281e]">
              切屏超限，已强制交卷
            </h3>
            <p className="mt-2 text-sm leading-6 text-[#57534a]">
              累计切屏{' '}
              <strong className="font-mono-num text-[#b4281e]">{violationCount}</strong>{' '}
              次（超过上限 {exam.max_violations} 次），已禁止继续作答并自动提交。
            </p>
            <div className="mt-4 text-xs text-[#8c867a]">正在跳转至结果页...</div>
          </div>
        </div>
      )}
    </div>
  );
}

interface AnswerSheetContentProps {
  sections: {
    type: QuestionType;
    meta: { title: string; badge: string; hint: string };
    items: { q: PublicQuestion; index: number }[];
  }[];
  answers: Record<string, string[]>;
  flaggedIds: number[];
  currentIndex: number;
  answeredCount: number;
  totalCount: number;
  sheetFilter: 'all' | 'unanswered' | 'flagged';
  onChangeFilter: (f: 'all' | 'unanswered' | 'flagged') => void;
  onSelectIndex: (idx: number) => void;
  onRequestSubmit: () => void;
}

function AnswerSheetContent({
  sections,
  answers,
  flaggedIds,
  currentIndex,
  answeredCount,
  totalCount,
  sheetFilter,
  onChangeFilter,
  onSelectIndex,
  onRequestSubmit,
}: AnswerSheetContentProps) {
  const pct = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#1a1917]">答题卡</span>
        <span className="font-mono-num text-xs text-[#57534a]">
          已答 {answeredCount} / {totalCount}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-[1px] bg-[#eeeae1]">
        <div
          className="h-full bg-[#1b4965] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Filter pills */}
      <div className="mt-3 flex gap-1 rounded-[2px] border border-[#dcd5c7] bg-[#f5f3ee] p-0.5 text-[11px]">
        {(
          [
            { key: 'all', label: '全部' },
            { key: 'unanswered', label: `未答 (${totalCount - answeredCount})` },
            { key: 'flagged', label: `标疑 (${flaggedIds.length})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChangeFilter(tab.key)}
            className={`flex-1 rounded-[2px] py-1 font-medium transition-colors ${
              sheetFilter === tab.key
                ? 'bg-[#1a1917] text-[#fdfcf9]'
                : 'text-[#57534a] hover:text-[#1a1917]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Section Grids */}
      <div className="mt-4 max-h-[50vh] space-y-4 overflow-y-auto pr-1">
        {sections.map((sec) => {
          const visibleItems = sec.items.filter(({ q }) => {
            const isAns = (answers[String(q.id)]?.length ?? 0) > 0;
            const isFlg = flaggedIds.includes(q.id);
            if (sheetFilter === 'unanswered') return !isAns;
            if (sheetFilter === 'flagged') return isFlg;
            return true;
          });

          if (visibleItems.length === 0) return null;

          return (
            <div key={sec.type}>
              <div className="mb-2 flex items-center justify-between text-[11px] text-[#57534a]">
                <span className="font-medium">{sec.meta.title}</span>
                <span className="font-mono-num text-[#8c867a]">{sec.items.length} 题</span>
              </div>
              <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-6">
                {visibleItems.map(({ q, index }) => {
                  const isAns = (answers[String(q.id)]?.length ?? 0) > 0;
                  const isFlg = flaggedIds.includes(q.id);
                  const isCur = index === currentIndex;

                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => onSelectIndex(index)}
                      className={`font-mono-num relative flex h-8 items-center justify-center rounded-[2px] border text-xs font-medium transition-colors ${
                        isCur
                          ? 'border-[#1b4965] bg-[#1b4965] text-[#fdfcf9] ring-2 ring-[#1b4965]/25'
                          : isAns
                            ? 'border-[#1a1917] bg-[#1a1917] text-[#fdfcf9]'
                            : 'border-[#dcd5c7] bg-[#fdfcf9] text-[#57534a] hover:border-[#1a1917]'
                      }`}
                    >
                      {index + 1}
                      {isFlg && (
                        <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-[#e09f3e]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-between border-t border-[#dcd5c7] pt-3 text-[11px] text-[#8c867a]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-[1px] bg-[#1a1917]" /> 已答
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-[1px] border border-[#dcd5c7] bg-[#fdfcf9]" />{' '}
          未答
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-[#e09f3e]" /> 标疑
        </span>
      </div>

      <button
        type="button"
        onClick={onRequestSubmit}
        className="mt-4 w-full rounded-[3px] border border-[#1a1917] bg-[#fdfcf9] py-2 text-xs font-semibold text-[#1a1917] transition-colors hover:bg-[#1a1917] hover:text-[#fdfcf9]"
      >
        提交试卷
      </button>
    </div>
  );
}

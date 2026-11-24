'use client';

import { useEffect, useState } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  ShieldCheck,
  Trash2,
  X,
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

function fmtKeys(keys: string[], type: QuestionType): string {
  if (keys.length === 0) return '未答';
  if (type === 'judge') return keys[0] === 'T' ? '正确' : '错误';
  return keys.join('');
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { hour12: false });
}

interface SessionAuditModalProps {
  sessionId: string;
  onClose: () => void;
  onUpdated: () => void;
}

interface AuditData {
  session: ExamSessionRecord;
  exam: ExamConfig;
  passed: boolean;
  breakdowns: { bySubject: BreakdownStat[]; byType: BreakdownStat[] };
  review: ReviewItem[];
}

export function SessionAuditModal({
  sessionId,
  onClose,
  onUpdated,
}: SessionAuditModalProps) {
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [onlyWrong, setOnlyWrong] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}`, { cache: 'no-store' });
      if (res.ok) {
        const json = (await res.json()) as AuditData;
        setData(json);
        setNote(json.session.override_note || '');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleOverride = async (restoreValid: boolean) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restoreValid, note }),
      });
      if (res.ok) {
        await load();
        onUpdated();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('确认删除该考生的考试记录？删除后该学号可重新参加本场考试。')) return;
    const res = await fetch(`/api/admin/sessions/${sessionId}`, { method: 'DELETE' });
    if (res.ok) {
      onUpdated();
      onClose();
    }
  };

  const visibleReview = data
    ? onlyWrong
      ? data.review.filter((r) => !r.is_correct)
      : data.review
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[3px] border border-[#1a1917] bg-[#fdfcf9] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#dcd5c7] bg-[#f5f3ee] px-6 py-4">
          <h3 className="text-base font-semibold text-[#1a1917]">
            {data
              ? `${data.session.student_name}（${data.session.student_id}）`
              : '加载中...'}
          </h3>
          <div className="flex items-center gap-2">
            {data && (
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center gap-1 rounded-[3px] border border-[#b4281e]/40 px-2.5 py-1.5 text-xs text-[#b4281e] hover:bg-[#faeae8]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除并允许重考
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-[3px] border border-[#dcd5c7] p-1.5 text-[#57534a] hover:border-[#1a1917] hover:text-[#1a1917]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {loading || !data ? (
            <div className="py-12 text-center text-sm text-[#8c867a]">加载中...</div>
          ) : (
            <>
              {/* Candidate Meta + Score Grid */}
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-[2px] border border-[#dcd5c7] bg-[#f5f3ee]/60 p-3">
                  <div className="text-[11px] text-[#8c867a]">院系 / 班级</div>
                  <div className="mt-1 text-xs font-medium text-[#1a1917]">
                    {data.session.college || '--'}
                  </div>
                  <div className="text-xs text-[#57534a]">{data.session.class_name || '--'}</div>
                </div>
                <div className="rounded-[2px] border border-[#dcd5c7] bg-[#f5f3ee]/60 p-3">
                  <div className="text-[11px] text-[#8c867a]">有效分 / 原始分</div>
                  <div className="font-mono-num mt-1 text-lg font-bold text-[#1a1917]">
                    {data.session.effective_score}
                    <span className="ml-1.5 text-xs font-normal text-[#8c867a]">
                      (原 {data.session.raw_score})
                    </span>
                  </div>
                </div>
                <div className="rounded-[2px] border border-[#dcd5c7] bg-[#f5f3ee]/60 p-3">
                  <div className="text-[11px] text-[#8c867a]">切屏次数</div>
                  <div
                    className={`font-mono-num mt-1 text-lg font-bold ${
                      data.session.violation_count > data.exam.max_violations
                        ? 'text-[#b4281e]'
                        : data.session.violation_count > 0
                          ? 'text-[#a65c08]'
                          : 'text-[#1b6647]'
                    }`}
                  >
                    {data.session.violation_count} / {data.exam.max_violations}
                  </div>
                </div>
                <div className="rounded-[2px] border border-[#dcd5c7] bg-[#f5f3ee]/60 p-3">
                  <div className="text-[11px] text-[#8c867a]">IP / 提交时间</div>
                  <div className="font-mono-num mt-1 text-xs text-[#1a1917]">
                    {data.session.ip_address || '--'}
                  </div>
                  <div className="font-mono-num text-[11px] text-[#57534a]">
                    {fmtDateTime(data.session.submitted_at)}
                  </div>
                </div>
              </div>

              {/* Cheating Override Box */}
              {data.session.is_cheated && (
                <div className="rounded-[3px] border border-[#b4281e]/40 bg-[#faeae8]/50 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#b4281e]">
                    <AlertOctagon className="h-4 w-4" />
                    作弊复核（当前：
                    {data.session.cheat_overridden ? '已恢复有效' : '作弊无效，记 0 分'}）
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="填写复核说明（可选）"
                      className="flex-1 rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] px-3 py-1.5 text-xs focus:border-[#1b4965] focus:outline-none"
                    />
                    {data.session.cheat_overridden ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleOverride(false)}
                        className="rounded-[3px] bg-[#b4281e] px-3.5 py-1.5 text-xs font-medium text-[#fdfcf9] hover:bg-[#961f17] disabled:opacity-50"
                      >
                        撤销复核
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleOverride(true)}
                        className="inline-flex items-center justify-center gap-1 rounded-[3px] bg-[#1b6647] px-3.5 py-1.5 text-xs font-medium text-[#fdfcf9] hover:bg-[#145036] disabled:opacity-50"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        恢复成绩 ({data.session.raw_score} 分)
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Violation Timeline */}
              <div>
                <h4 className="mb-2 text-xs font-semibold text-[#57534a]">
                  切屏记录（{data.session.violations.length} 次）
                </h4>
                {data.session.violations.length === 0 ? (
                  <div className="rounded-[2px] border border-[#dcd5c7] bg-[#f5f3ee]/40 px-3 py-2.5 text-xs text-[#1b6647]">
                    无切屏记录
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-[2px] border border-[#dcd5c7]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#f5f3ee] text-[#57534a]">
                        <tr>
                          <th className="px-3 py-2 font-medium">序号</th>
                          <th className="px-3 py-2 font-medium">触发来源</th>
                          <th className="px-3 py-2 font-medium">离开时间</th>
                          <th className="px-3 py-2 font-medium">返回时间</th>
                          <th className="px-3 py-2 font-medium">离开时长</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#dcd5c7] bg-[#fdfcf9]">
                        {data.session.violations.map((v) => (
                          <tr key={v.index}>
                            <td className="font-mono-num px-3 py-2 font-semibold">#{v.index}</td>
                            <td className="px-3 py-2">
                              {v.reason === 'visibility_hidden'
                                ? '切换标签/最小化'
                                : v.reason === 'window_blur'
                                  ? '窗口失焦'
                                  : '退出全屏'}
                            </td>
                            <td className="font-mono-num px-3 py-2">{fmtDateTime(v.left_at)}</td>
                            <td className="font-mono-num px-3 py-2">
                              {v.returned_at ? fmtDateTime(v.returned_at) : '—'}
                            </td>
                            <td className="font-mono-num px-3 py-2 font-medium text-[#b4281e]">
                              {v.duration_sec !== null && v.duration_sec !== undefined
                                ? `${v.duration_sec} 秒`
                                : v.index > data.exam.max_violations
                                  ? '触发强制锁卷'
                                  : '未返回'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Per-Question Snapshot */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-[#57534a]">
                    答题明细（答对 {data.session.correct_count} / {data.session.total_questions}）
                  </h4>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[#57534a]">
                    <input
                      type="checkbox"
                      checked={onlyWrong}
                      onChange={(e) => setOnlyWrong(e.target.checked)}
                      className="accent-[#1b4965]"
                    />
                    仅显示错题
                  </label>
                </div>

                <div className="divide-y divide-[#dcd5c7] rounded-[2px] border border-[#dcd5c7] bg-[#fdfcf9]">
                  {visibleReview.map((item, idx) => (
                    <div key={item.question_id} className="px-4 py-3 text-xs">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 leading-5">
                          <span className="font-mono-num mr-2 font-bold text-[#8c867a]">
                            #{String(idx + 1).padStart(2, '0')}
                          </span>
                          <span className="mr-1.5 rounded-[2px] bg-[#eaf1f5] px-1.5 py-0.5 text-[10px] font-medium text-[#1b4965]">
                            {item.subject}
                          </span>
                          <span className="mr-1.5 text-[11px] text-[#8c867a]">
                            [{TYPE_LABELS[item.type]}]
                          </span>
                          <span className="text-[#1a1917]">{item.prompt}</span>
                        </div>
                        {item.is_correct ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1b6647]" />
                        ) : (
                          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#b4281e]" />
                        )}
                      </div>
                      <div className="font-mono-num mt-1.5 flex gap-4 text-[11px] text-[#57534a]">
                        <span>
                          考生选：
                          <strong className={item.is_correct ? 'text-[#1b6647]' : 'text-[#b4281e]'}>
                            {fmtKeys(item.selected, item.type)}
                          </strong>
                        </span>
                        <span>
                          标答：<strong className="text-[#1b6647]">{fmtKeys(item.correct_answer, item.type)}</strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

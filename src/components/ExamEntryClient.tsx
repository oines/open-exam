'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { CollegeClassSelector } from '@/components/CollegeClassSelector';
import type { CollegeDirectory, ExamConfig } from '@/lib/types';

interface ExamEntryClientProps {
  exam: ExamConfig;
  collegeDirectory: CollegeDirectory;
}

export function ExamEntryClient({ exam, collegeDirectory }: ExamEntryClientProps) {
  const router = useRouter();
  const [studentName, setStudentName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [college, setCollege] = useState('');
  const [classNameValue, setClassNameValue] = useState('');
  const [accessPassword, setAccessPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const totalPool = exam.question_count ?? 0;
  const actualDraw = Math.min(exam.draw_count, totalPool || exam.draw_count);
  const perQuestionPoints =
    actualDraw > 0 ? Math.round((100 / actualDraw) * 100) / 100 : 2.5;

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!studentName.trim()) {
      setError('请填写姓名');
      return;
    }
    if (!studentId.trim()) {
      setError('请填写学号');
      return;
    }
    if (exam.require_college_class && (!college || !classNameValue)) {
      setError('请选择学院和班级');
      return;
    }
    if (exam.require_password && !accessPassword.trim()) {
      setError('请输入考试密码');
      return;
    }
    if (!agreed) {
      setError('请先勾选确认考试规则');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: exam.slug,
          student_name: studentName.trim(),
          student_id: studentId.trim(),
          college,
          class_name: classNameValue,
          access_password: accessPassword.trim(),
        }),
      });
      const data = (await res.json()) as {
        sessionId?: string;
        error?: string;
      };
      if (!res.ok || !data.sessionId) {
        setError(data.error || '进入考试失败，请重试');
        setSubmitting(false);
        return;
      }

      router.push(`/session/${data.sessionId}`);
    } catch {
      setError('网络异常，请重试');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f3ee] text-[#1a1917]">
      <header className="border-b border-[#dcd5c7] bg-[#fdfcf9]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
          <span className="text-sm font-semibold text-[#1a1917]">在线考试</span>
          <Link
            href="/admin"
            className="text-xs text-[#57534a] transition-colors hover:text-[#1a1917]"
          >
            管理后台
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 lg:py-14">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
          {/* Left: Exam Info & Rules */}
          <section className="lg:col-span-7">
            <div className="exam-surface rounded-[3px] p-7 sm:p-8">
              <div className="mb-3 flex items-center gap-2.5">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 text-xs font-medium ${
                    exam.is_open
                      ? 'border-[#1b6647]/30 bg-[#e8f3ed] text-[#1b6647]'
                      : 'border-[#b4281e]/30 bg-[#faeae8] text-[#b4281e]'
                  }`}
                >
                  {exam.is_open ? '进行中' : '已暂停'}
                </span>
                {exam.subtitle && (
                  <span className="text-xs text-[#57534a]">{exam.subtitle}</span>
                )}
              </div>

              <h1 className="text-2xl font-bold tracking-tight text-[#1a1917]">
                {exam.title}
              </h1>
              {exam.description && (
                <p className="mt-2.5 text-sm leading-6 text-[#57534a]">{exam.description}</p>
              )}

              {/* Spec Row */}
              <div className="mt-6 grid grid-cols-2 border border-[#dcd5c7] bg-[#f5f3ee]/60 sm:grid-cols-4">
                <div className="border-b border-r border-[#dcd5c7] p-3.5 sm:border-b-0">
                  <div className="text-xs text-[#8c867a]">题量</div>
                  <div className="font-mono-num mt-1 text-lg font-bold text-[#1a1917]">
                    {actualDraw}
                    <span className="text-xs font-normal text-[#8c867a]"> / {totalPool}</span>
                  </div>
                </div>
                <div className="border-b border-[#dcd5c7] p-3.5 sm:border-b-0 sm:border-r">
                  <div className="text-xs text-[#8c867a]">时长</div>
                  <div className="font-mono-num mt-1 text-lg font-bold text-[#1a1917]">
                    {exam.duration_minutes}
                    <span className="text-xs font-normal text-[#8c867a]"> 分钟</span>
                  </div>
                </div>
                <div className="border-r border-[#dcd5c7] p-3.5">
                  <div className="text-xs text-[#8c867a]">满分 / 及格</div>
                  <div className="font-mono-num mt-1 text-lg font-bold text-[#1a1917]">
                    100
                    <span className="text-xs font-normal text-[#8c867a]"> / {exam.pass_score}</span>
                  </div>
                </div>
                <div className="p-3.5">
                  <div className="text-xs text-[#8c867a]">切屏上限</div>
                  <div className="font-mono-num mt-1 text-lg font-bold text-[#b4281e]">
                    {exam.max_violations}
                    <span className="text-xs font-normal text-[#b4281e]/80"> 次</span>
                  </div>
                </div>
              </div>

              {/* Rules */}
              <div className="mt-6 border-t border-[#dcd5c7] pt-5">
                <h2 className="mb-3 text-xs font-semibold text-[#1a1917]">考试须知</h2>
                <ol className="space-y-2 text-sm leading-6 text-[#57534a]">
                  <li className="flex gap-2">
                    <span className="font-mono-num text-xs text-[#8c867a]">1.</span>
                    <span>
                      系统从题库随机抽 {actualDraw} 题，每题{' '}
                      <span className="font-mono-num text-[#1a1917]">{perQuestionPoints}</span>{' '}
                      分，满分 100 分；多选题全部选对得分，少选、错选均不得分。
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono-num text-xs text-[#b4281e]">2.</span>
                    <span>
                      <strong className="font-medium text-[#b4281e]">
                        切屏或离开当前窗口超过 {exam.max_violations} 次（第 {exam.max_violations + 1} 次）
                      </strong>
                      直接判作弊，禁止继续作答并自动交卷。
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono-num text-xs text-[#8c867a]">3.</span>
                    <span>
                      答题记录实时保存。刷新或断网后输入原学号即可回到原试卷，剩余时间和切屏次数照常计算。
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono-num text-xs text-[#8c867a]">4.</span>
                    <span>
                      答题时禁止复制题目与右键操作，开考前请关闭聊天弹窗和其他窗口。
                    </span>
                  </li>
                </ol>
              </div>
            </div>
          </section>

          {/* Right: Registration Form */}
          <section className="lg:col-span-5">
            <div className="exam-surface rounded-[3px] p-7">
              <h2 className="mb-5 text-base font-semibold text-[#1a1917]">填写考生信息</h2>

              {!exam.is_open && (
                <div className="mb-4 flex items-start gap-2 rounded-[3px] border border-[#b4281e]/30 bg-[#faeae8] p-3 text-xs leading-5 text-[#b4281e]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>当前已暂停新考生进入。已交卷的同学仍可输入原学号查看成绩。</span>
                </div>
              )}

              <form onSubmit={handleStart} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[#57534a]">
                    姓名 <span className="text-[#b4281e]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="请输入姓名"
                    maxLength={40}
                    className="w-full rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] px-3 py-2.5 text-sm text-[#1a1917] placeholder:text-[#8c867a] focus:border-[#1b4965] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[#57534a]">
                    学号 <span className="text-[#b4281e]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    placeholder="请输入学号"
                    maxLength={40}
                    className="font-mono-num w-full rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] px-3 py-2.5 text-sm text-[#1a1917] placeholder:font-sans placeholder:text-[#8c867a] focus:border-[#1b4965] focus:outline-none"
                  />
                </div>

                {exam.require_college_class && (
                  <CollegeClassSelector
                    directory={collegeDirectory}
                    college={college}
                    classNameValue={classNameValue}
                    onChangeCollege={setCollege}
                    onChangeClass={setClassNameValue}
                  />
                )}

                {exam.require_password && (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[#57534a]">
                      考试密码 <span className="text-[#b4281e]">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      value={accessPassword}
                      onChange={(e) => setAccessPassword(e.target.value)}
                      placeholder="请输入本场考试密码"
                      maxLength={64}
                      className="font-mono-num w-full rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] px-3 py-2.5 text-sm text-[#1a1917] placeholder:font-sans placeholder:text-[#8c867a] focus:border-[#1b4965] focus:outline-none"
                    />
                  </div>
                )}

                <label className="flex cursor-pointer items-start gap-2.5 pt-1 text-xs leading-5 text-[#57534a]">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#1b4965]"
                  />
                  <span>
                    我已知晓规则：切屏超过{' '}
                    <strong className="font-mono-num text-[#b4281e]">{exam.max_violations}</strong>{' '}
                    次将判作弊并强制交卷
                  </span>
                </label>

                {error && (
                  <div className="rounded-[3px] border border-[#b4281e]/40 bg-[#faeae8] px-3 py-2 text-xs text-[#b4281e]">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-[3px] bg-[#1a1917] px-4 py-2.5 text-sm font-medium text-[#fdfcf9] transition-colors hover:bg-[#1b4965] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? '正在进入...' : '开始考试'}
                  {!submitting && <ArrowRight className="h-4 w-4" />}
                </button>
              </form>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

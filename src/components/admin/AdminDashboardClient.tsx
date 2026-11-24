'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertOctagon,
  BarChart3,
  BookOpen,
  Building2,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileJson,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { SessionAuditModal } from '@/components/admin/SessionAuditModal';
import type { CollegeDirectory, ExamConfig, QuestionRecord, QuestionType } from '@/lib/types';

type AdminTab = 'overview' | 'submissions' | 'questions' | 'settings' | 'colleges';

interface SessionListItem {
  id: string;
  student_name: string;
  student_id: string;
  college: string;
  class_name: string;
  status: string;
  violation_count: number;
  is_cheated: boolean;
  cheat_overridden: boolean;
  override_note: string;
  raw_score: number;
  effective_score: number;
  answered_count: number;
  correct_count: number;
  total_questions: number;
  passed: boolean;
  started_at: string;
  submitted_at: string | null;
  duration_sec: number | null;
}

interface QuestionStatItem extends QuestionRecord {
  appearances: number;
  correctCount: number;
  wrongCount: number;
  errorRate: number;
}

interface OverviewPayload {
  exam: ExamConfig;
  summary: {
    totalParticipants: number;
    completedCount: number;
    inProgressCount: number;
    passedCount: number;
    passRate: number;
    cheatedCount: number;
    cheatRate: number;
    avgEffectiveScore: number;
    avgRawScore: number;
    maxScore: number;
    minScore: number;
    avgDurationSec: number;
  };
  scoreDistribution: { label: string; count: number }[];
  subjectStats: { subject: string; total: number; correct: number; accuracy: number }[];
  collegeStats: {
    college: string;
    total: number;
    passed: number;
    cheated: number;
    passRate: number;
  }[];
  sessions: SessionListItem[];
  questionStats: QuestionStatItem[];
}

const TYPE_LABELS: Record<QuestionType, string> = {
  single: '单选',
  multiple: '多选',
  judge: '判断',
};

const SAMPLE_QUESTIONS_JSON = JSON.stringify(
  [
    {
      code: '01',
      subject: '示例科目',
      type: 'single',
      prompt: '这是一道示例单选题，请选择正确答案？',
      options: [
        { key: 'A', label: '选项 A 内容' },
        { key: 'B', label: '选项 B 内容' },
        { key: 'C', label: '选项 C 内容' },
        { key: 'D', label: '选项 D 内容' },
      ],
      answer: ['B'],
      explanation: '这里填写考点解析。',
    },
    {
      code: '02',
      subject: '示例科目',
      type: 'multiple',
      prompt: '这是一道示例多选题，哪些选项正确？',
      options: [
        { key: 'A', label: '正确项 1' },
        { key: 'B', label: '干扰项' },
        { key: 'C', label: '正确项 2' },
      ],
      answer: ['A', 'C'],
      explanation: '多选题 answer 传入多个选项键。',
    },
    {
      code: '03',
      subject: '示例科目',
      type: 'judge',
      prompt: '这是一道示例判断题，该说法正确。',
      answer: ['T'],
      explanation: '判断题 answer 传 ["T"]（正确）或 ["F"]（错误），无需填写 options。',
    },
  ],
  null,
  2,
);

function fmtSec(sec: number | null): string {
  if (!sec || sec <= 0) return '--';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function fmtShortTime(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function AdminDashboardClient({
  initialAuthenticated,
}: {
  initialAuthenticated: boolean;
}) {
  const [authed, setAuthed] = useState(initialAuthenticated);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [exams, setExams] = useState<ExamConfig[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [collegeDirectory, setCollegeDirectory] = useState<CollegeDirectory>({});
  const [loading, setLoading] = useState(false);

  const [tab, setTab] = useState<AdminTab>('overview');
  const [liveRefresh, setLiveRefresh] = useState(true);
  const [copiedSlug, setCopiedSlug] = useState(false);

  // Submissions filter
  const [subQuery, setSubQuery] = useState('');
  const [subStatusFilter, setSubStatusFilter] = useState<
    'all' | 'passed' | 'failed' | 'cheated' | 'in_progress'
  >('all');
  const [auditSessionId, setAuditSessionId] = useState<string | null>(null);

  // Questions filter & import
  const [qSubjectFilter, setQSubjectFilter] = useState('all');
  const [qTypeFilter, setQTypeFilter] = useState<'all' | QuestionType>('all');
  const [qSort, setQSort] = useState<'error_desc' | 'code_asc'>('error_desc');
  const [expandedQId, setExpandedQId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importMsg, setImportMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [importing, setImporting] = useState(false);

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<Partial<ExamConfig>>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');

  // Create new exam modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newExam, setNewExam] = useState({
    title: '',
    slug: '',
    subtitle: '',
    description: '',
    draw_count: 40,
    duration_minutes: 30,
    pass_score: 60,
    max_violations: 3,
    is_default: false,
    require_password: false,
    access_password: '',
    questionsJson: '',
  });
  const [createErr, setCreateErr] = useState('');
  const [creating, setCreating] = useState(false);

  // College directory editor
  const [collegeJson, setCollegeJson] = useState('');
  const [collegeMsg, setCollegeMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [savingColleges, setSavingColleges] = useState(false);

  const loadExamsList = useCallback(async (preferredId?: number) => {
    const res = await fetch('/api/admin/exams', { cache: 'no-store' });
    if (res.status === 401) {
      setAuthed(false);
      return;
    }
    const data = (await res.json()) as {
      exams: ExamConfig[];
      collegeDirectory: CollegeDirectory;
    };
    setExams(data.exams);
    setCollegeDirectory(data.collegeDirectory);
    setCollegeJson(JSON.stringify(data.collegeDirectory, null, 2));

    setSelectedExamId((prev) => {
      if (preferredId && data.exams.some((e) => e.id === preferredId)) return preferredId;
      if (prev && data.exams.some((e) => e.id === prev)) return prev;
      return data.exams[0]?.id ?? null;
    });
  }, []);

  const loadOverview = useCallback(async (examId: number, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/admin/exams/${examId}/overview`, { cache: 'no-store' });
      if (res.status === 401) {
        setAuthed(false);
        return;
      }
      if (res.ok) {
        const data = (await res.json()) as OverviewPayload;
        setOverview(data);
        if (!silent) setSettingsForm(data.exam);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) {
      void loadExamsList();
    }
  }, [authed, loadExamsList]);

  useEffect(() => {
    if (authed && selectedExamId !== null) {
      void loadOverview(selectedExamId);
    }
  }, [authed, selectedExamId, loadOverview]);

  // Auto-refresh overview & submissions every 5s when liveRefresh is on
  useEffect(() => {
    if (
      !authed ||
      !liveRefresh ||
      selectedExamId === null ||
      auditSessionId !== null ||
      createOpen ||
      (tab !== 'overview' && tab !== 'submissions')
    ) {
      return;
    }
    const timer = setInterval(() => {
      if (!document.hidden) {
        void loadOverview(selectedExamId, true);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [authed, liveRefresh, selectedExamId, auditSessionId, createOpen, tab, loadOverview]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setLoginError(data.error || '登录失败');
      } else {
        setPassword('');
        setAuthed(true);
      }
    } catch {
      setLoginError('网络异常，请重试');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    setAuthed(false);
    setOverview(null);
  };

  const handleCopyExamUrl = () => {
    if (!overview) return;
    const url = `${window.location.origin}/exam/${overview.exam.slug}`;
    void navigator.clipboard.writeText(url);
    setCopiedSlug(true);
    setTimeout(() => setCopiedSlug(false), 1800);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExamId) return;
    setSavingSettings(true);
    setSettingsMsg('');
    try {
      const res = await fetch(`/api/admin/exams/${selectedExamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setSettingsMsg(data.error || '保存失败');
      } else {
        setSettingsMsg('配置已保存并立即生效');
        await loadExamsList(selectedExamId);
        await loadOverview(selectedExamId);
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDeleteExam = async () => {
    if (!overview) return;
    if (!confirm(`确定删除活动「${overview.exam.title}」及其全部题库与成绩记录吗？此操作不可恢复。`)) {
      return;
    }
    const res = await fetch(`/api/admin/exams/${overview.exam.id}`, { method: 'DELETE' });
    if (res.ok) {
      setSelectedExamId(null);
      await loadExamsList();
    } else {
      const data = (await res.json()) as { error?: string };
      alert(data.error || '删除失败');
    }
  };

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateErr('');
    let parsedQuestions: unknown = undefined;
    if (newExam.questionsJson.trim()) {
      try {
        parsedQuestions = JSON.parse(newExam.questionsJson);
      } catch {
        setCreateErr('题库 JSON 格式无法解析，请检查逗号与引号');
        return;
      }
    }

    setCreating(true);
    try {
      const res = await fetch('/api/admin/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newExam.title,
          slug: newExam.slug,
          subtitle: newExam.subtitle,
          description: newExam.description,
          draw_count: newExam.draw_count,
          duration_minutes: newExam.duration_minutes,
          pass_score: newExam.pass_score,
          max_violations: newExam.max_violations,
          is_default: newExam.is_default,
          require_password: newExam.require_password,
          access_password: newExam.access_password,
          questions: parsedQuestions,
        }),
      });
      const data = (await res.json()) as { exam?: ExamConfig; error?: string };
      if (!res.ok || !data.exam) {
        setCreateErr(data.error || '创建失败');
      } else {
        setCreateOpen(false);
        setNewExam({
          title: '',
          slug: '',
          subtitle: '',
          description: '',
          draw_count: 40,
          duration_minutes: 30,
          pass_score: 60,
          max_violations: 3,
          is_default: false,
          require_password: false,
          access_password: '',
          questionsJson: '',
        });
        await loadExamsList(data.exam.id);
        setTab('overview');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleImportQuestions = async () => {
    if (!selectedExamId) return;
    setImportMsg(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(importJson);
    } catch {
      setImportMsg({ type: 'err', text: 'JSON 语法错误，请核对括号与引号' });
      return;
    }

    setImporting(true);
    try {
      const res = await fetch(`/api/admin/exams/${selectedExamId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: parsed }),
      });
      const data = (await res.json()) as { importedCount?: number; error?: string };
      if (!res.ok) {
        setImportMsg({ type: 'err', text: data.error || '导入失败' });
      } else {
        setImportMsg({
          type: 'ok',
          text: `成功导入并替换 ${data.importedCount} 道题目`,
        });
        setImportJson('');
        await loadExamsList(selectedExamId);
        await loadOverview(selectedExamId);
      }
    } finally {
      setImporting(false);
    }
  };

  const handleSaveColleges = async () => {
    setCollegeMsg(null);
    let parsed: CollegeDirectory;
    try {
      parsed = JSON.parse(collegeJson) as CollegeDirectory;
    } catch {
      setCollegeMsg({ type: 'err', text: 'JSON 格式有误，请检查语法' });
      return;
    }
    setSavingColleges(true);
    try {
      const res = await fetch('/api/admin/colleges', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collegeDirectory: parsed }),
      });
      const data = (await res.json()) as { collegeDirectory?: CollegeDirectory; error?: string };
      if (!res.ok || !data.collegeDirectory) {
        setCollegeMsg({ type: 'err', text: data.error || '保存失败' });
      } else {
        setCollegeDirectory(data.collegeDirectory);
        setCollegeJson(JSON.stringify(data.collegeDirectory, null, 2));
        const totalCls = Object.values(data.collegeDirectory).reduce((a, b) => a + b.length, 0);
        setCollegeMsg({
          type: 'ok',
          text: `已保存 ${Object.keys(data.collegeDirectory).length} 个学院、${totalCls} 个班级（全局生效）`,
        });
      }
    } finally {
      setSavingColleges(false);
    }
  };

  const filteredSessions = useMemo(() => {
    if (!overview) return [];
    const q = subQuery.trim().toLowerCase();
    return overview.sessions.filter((s) => {
      if (subStatusFilter === 'passed' && (!s.passed || s.status === 'in_progress')) return false;
      if (
        subStatusFilter === 'failed' &&
        (s.passed || s.status === 'in_progress' || (s.is_cheated && !s.cheat_overridden))
      )
        return false;
      if (subStatusFilter === 'cheated' && !(s.is_cheated && !s.cheat_overridden)) return false;
      if (subStatusFilter === 'in_progress' && s.status !== 'in_progress') return false;

      if (!q) return true;
      return (
        s.student_name.toLowerCase().includes(q) ||
        s.student_id.toLowerCase().includes(q) ||
        s.college.toLowerCase().includes(q) ||
        s.class_name.toLowerCase().includes(q)
      );
    });
  }, [overview, subQuery, subStatusFilter]);

  const questionSubjects = useMemo(() => {
    if (!overview) return [];
    return Array.from(new Set(overview.questionStats.map((q) => q.subject)));
  }, [overview]);

  const filteredQuestions = useMemo(() => {
    if (!overview) return [];
    const list = overview.questionStats.filter((q) => {
      if (qSubjectFilter !== 'all' && q.subject !== qSubjectFilter) return false;
      if (qTypeFilter !== 'all' && q.type !== qTypeFilter) return false;
      return true;
    });
    if (qSort === 'error_desc') {
      return [...list].sort((a, b) => b.errorRate - a.errorRate || b.wrongCount - a.wrongCount);
    }
    return [...list].sort((a, b) => a.code.localeCompare(b.code, 'zh-CN', { numeric: true }));
  }, [overview, qSubjectFilter, qTypeFilter, qSort]);

  // ---------- Login Gate ----------
  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f3ee] p-6 text-[#1a1917]">
        <div className="exam-surface w-full max-w-sm rounded-[3px] p-7">
          <h1 className="mb-5 text-lg font-semibold text-[#1a1917]">管理员登录</h1>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#57534a]">密码</label>
              <input
                type="password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入管理密码"
                className="w-full rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] px-3 py-2.5 text-sm focus:border-[#1b4965] focus:outline-none"
              />
            </div>

            {loginError && (
              <div className="rounded-[2px] border border-[#b4281e]/40 bg-[#faeae8] px-3 py-2 text-xs text-[#b4281e]">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full rounded-[3px] bg-[#1a1917] py-2.5 text-sm font-medium text-[#fdfcf9] transition-colors hover:bg-[#1b4965] disabled:opacity-50"
            >
              {loggingIn ? '登录中...' : '登录'}
            </button>
          </form>

          <div className="mt-5 border-t border-[#dcd5c7] pt-4 text-center">
            <Link href="/" className="text-xs text-[#57534a] hover:text-[#1a1917] hover:underline">
              返回考试页
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const maxBucket = overview
    ? Math.max(1, ...overview.scoreDistribution.map((b) => b.count))
    : 1;
  const totalCollegesCount = Object.keys(collegeDirectory).length;
  const totalClassesCount = Object.values(collegeDirectory).reduce((a, b) => a + b.length, 0);

  return (
    <div className="min-h-screen bg-[#f5f3ee] text-[#1a1917]">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-[#dcd5c7] bg-[#fdfcf9]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-[#1a1917]">考试管理</span>

            <select
              value={selectedExamId ?? ''}
              onChange={(e) => setSelectedExamId(Number(e.target.value))}
              className="max-w-xs rounded-[3px] border border-[#bfb7a6] bg-[#f5f3ee] px-2.5 py-1.5 text-xs font-medium text-[#1a1917] focus:border-[#1b4965] focus:outline-none"
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.is_default ? '[默认] ' : ''}
                  {ex.title}（{ex.question_count ?? 0}题 / {ex.submission_count ?? 0}人）
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1 rounded-[3px] bg-[#1a1917] px-2.5 py-1.5 text-xs font-medium text-[#fdfcf9] hover:bg-[#1b4965]"
            >
              <Plus className="h-3.5 w-3.5" />
              新建考试
            </button>
          </div>

          <div className="flex items-center gap-2">
            {overview && (
              <>
                <button
                  type="button"
                  onClick={handleCopyExamUrl}
                  className="inline-flex items-center gap-1 rounded-[3px] border border-[#dcd5c7] px-2.5 py-1.5 text-xs text-[#57534a] hover:border-[#1a1917] hover:text-[#1a1917]"
                >
                  {copiedSlug ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[#1b6647]" /> 已复制
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> 复制链接
                    </>
                  )}
                </button>
                <Link
                  href={`/exam/${overview.exam.slug}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 rounded-[3px] border border-[#dcd5c7] px-2.5 py-1.5 text-xs text-[#57534a] hover:border-[#1a1917] hover:text-[#1a1917]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  打开考试页
                </Link>
              </>
            )}

            <button
              type="button"
              onClick={() => setLiveRefresh((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1.5 text-xs transition-colors ${
                liveRefresh
                  ? 'border-[#1b6647]/40 bg-[#e8f3ed] text-[#1b6647]'
                  : 'border-[#dcd5c7] text-[#57534a] hover:border-[#1a1917]'
              }`}
              title="每 5 秒自动同步考情与进度"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  liveRefresh ? 'bg-[#1b6647]' : 'bg-[#8c867a]'
                }`}
              />
              {liveRefresh ? '实时刷新' : '已暂停'}
            </button>

            <button
              type="button"
              onClick={() => selectedExamId && void loadOverview(selectedExamId)}
              className="rounded-[3px] border border-[#dcd5c7] p-1.5 text-[#57534a] hover:border-[#1a1917] hover:text-[#1a1917]"
              title="立即刷新"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1 rounded-[3px] border border-[#dcd5c7] px-2.5 py-1.5 text-xs text-[#57534a] hover:border-[#b4281e] hover:text-[#b4281e]"
            >
              <LogOut className="h-3.5 w-3.5" />
              退出
            </button>
          </div>
        </div>

        {/* Sub-nav Tabs */}
        <div className="border-t border-[#dcd5c7] bg-[#f5f3ee]/70">
          <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-6">
            {(
              [
                { key: 'overview', label: '数据概览', icon: BarChart3 },
                { key: 'submissions', label: '成绩明细', icon: Users },
                { key: 'questions', label: '题库与错题', icon: BookOpen },
                { key: 'settings', label: '考试设置', icon: Settings },
                { key: 'colleges', label: '学院班级', icon: Building2 },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
                    active
                      ? 'border-[#1b4965] text-[#1b4965]'
                      : 'border-transparent text-[#57534a] hover:text-[#1a1917]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-7">
        {!overview ? (
          <div className="exam-surface rounded-[3px] p-12 text-center text-sm text-[#8c867a]">
            加载中...
          </div>
        ) : (
          <>
            {/* TAB 1: OVERVIEW */}
            {tab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 border border-[#dcd5c7] bg-[#fdfcf9] lg:grid-cols-5">
                  <div className="border-b border-r border-[#dcd5c7] p-5 lg:border-b-0">
                    <div className="text-xs text-[#8c867a]">参考人数</div>
                    <div className="font-mono-num mt-1.5 text-2xl font-bold text-[#1a1917]">
                      {overview.summary.totalParticipants}
                    </div>
                    <div className="mt-1 text-[11px] text-[#57534a]">
                      已交卷 {overview.summary.completedCount} · 作答中{' '}
                      {overview.summary.inProgressCount}
                    </div>
                  </div>
                  <div className="border-b border-[#dcd5c7] p-5 lg:border-b-0 lg:border-r">
                    <div className="text-xs text-[#8c867a]">平均分</div>
                    <div className="font-mono-num mt-1.5 text-2xl font-bold text-[#1b4965]">
                      {overview.summary.avgEffectiveScore}
                    </div>
                    <div className="font-mono-num mt-1 text-[11px] text-[#57534a]">
                      最高 {overview.summary.maxScore} · 最低 {overview.summary.minScore}
                    </div>
                  </div>
                  <div className="border-b border-r border-[#dcd5c7] p-5 lg:border-b-0">
                    <div className="text-xs text-[#8c867a]">
                      及格率（≥{overview.exam.pass_score}分）
                    </div>
                    <div className="font-mono-num mt-1.5 text-2xl font-bold text-[#1b6647]">
                      {overview.summary.passRate}%
                    </div>
                    <div className="mt-1 text-[11px] text-[#57534a]">
                      {overview.summary.passedCount} / {overview.summary.completedCount} 人
                    </div>
                  </div>
                  <div className="border-b border-[#dcd5c7] p-5 lg:border-b-0 lg:border-r">
                    <div className="text-xs text-[#8c867a]">作弊交卷</div>
                    <div className="font-mono-num mt-1.5 text-2xl font-bold text-[#b4281e]">
                      {overview.summary.cheatedCount}
                    </div>
                    <div className="mt-1 text-[11px] text-[#57534a]">
                      占比 {overview.summary.cheatRate}%（上限 {overview.exam.max_violations} 次）
                    </div>
                  </div>
                  <div className="col-span-2 p-5 lg:col-span-1">
                    <div className="text-xs text-[#8c867a]">平均用时</div>
                    <div className="font-mono-num mt-1.5 text-2xl font-bold text-[#1a1917]">
                      {fmtSec(overview.summary.avgDurationSec)}
                    </div>
                    <div className="mt-1 text-[11px] text-[#57534a]">
                      限时 {overview.exam.duration_minutes} 分钟
                    </div>
                  </div>
                </div>

                {/* Charts Row */}
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Score Distribution */}
                  <div className="exam-surface rounded-[3px] p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-xs font-semibold text-[#57534a]">分数段分布</h2>
                      <a
                        href={`/api/admin/exams/${overview.exam.id}/export?type=submissions`}
                        className="inline-flex items-center gap-1 text-xs text-[#1b4965] hover:underline"
                      >
                        <Download className="h-3.5 w-3.5" /> 导出成绩 CSV
                      </a>
                    </div>
                    <div className="space-y-3">
                      {overview.scoreDistribution.map((b) => (
                        <div key={b.label} className="flex items-center gap-3 text-xs">
                          <span className="font-mono-num w-14 text-right text-[#57534a]">
                            {b.label}
                          </span>
                          <div className="h-6 flex-1 overflow-hidden rounded-[2px] bg-[#eeeae1]">
                            <div
                              className={`h-full transition-all ${
                                b.label === '0-59' ? 'bg-[#b4281e]/75' : 'bg-[#1b4965]'
                              }`}
                              style={{ width: `${(b.count / maxBucket) * 100}%` }}
                            />
                          </div>
                          <span className="font-mono-num w-10 font-semibold text-[#1a1917]">
                            {b.count} 人
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Subject Accuracy */}
                  <div className="exam-surface rounded-[3px] p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-xs font-semibold text-[#57534a]">各科正确率</h2>
                      <a
                        href={`/api/admin/exams/${overview.exam.id}/export?type=questions`}
                        className="inline-flex items-center gap-1 text-xs text-[#1b4965] hover:underline"
                      >
                        <Download className="h-3.5 w-3.5" /> 导出错题 CSV
                      </a>
                    </div>
                    <div className="space-y-4">
                      {overview.subjectStats.map((sub) => (
                        <div key={sub.subject}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="font-medium text-[#1a1917]">{sub.subject}</span>
                            <span className="font-mono-num text-[#57534a]">
                              答对 {sub.correct} / {sub.total} 次（{sub.accuracy}%）
                            </span>
                          </div>
                          <div className="h-2.5 w-full overflow-hidden rounded-[2px] bg-[#eeeae1]">
                            <div
                              className="h-full bg-[#1a1917]"
                              style={{ width: `${sub.accuracy}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* College Participation Summary */}
                {overview.collegeStats.length > 0 && (
                  <div className="exam-surface rounded-[3px] p-6">
                    <h2 className="mb-4 text-xs font-semibold text-[#57534a]">各学院统计</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-[#dcd5c7] text-[#57534a]">
                          <tr>
                            <th className="py-2 pr-4 font-medium">学院名称</th>
                            <th className="px-4 py-2 font-medium">已交卷人数</th>
                            <th className="px-4 py-2 font-medium">及格人数</th>
                            <th className="px-4 py-2 font-medium">及格率</th>
                            <th className="px-4 py-2 font-medium">作弊人次</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#dcd5c7]">
                          {overview.collegeStats.map((c) => (
                            <tr key={c.college}>
                              <td className="py-2.5 pr-4 font-medium text-[#1a1917]">
                                {c.college}
                              </td>
                              <td className="font-mono-num px-4 py-2.5">{c.total}</td>
                              <td className="font-mono-num px-4 py-2.5 text-[#1b6647]">
                                {c.passed}
                              </td>
                              <td className="font-mono-num px-4 py-2.5 font-semibold">
                                {c.passRate}%
                              </td>
                              <td className="font-mono-num px-4 py-2.5 text-[#b4281e]">
                                {c.cheated}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: SUBMISSIONS & ANTI-CHEAT AUDIT */}
            {tab === 'submissions' && (
              <div className="exam-surface rounded-[3px] p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8c867a]" />
                      <input
                        type="text"
                        value={subQuery}
                        onChange={(e) => setSubQuery(e.target.value)}
                        placeholder="搜索姓名 / 学号 / 学院 / 班级"
                        className="w-60 rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] py-1.5 pl-8 pr-3 text-xs focus:border-[#1b4965] focus:outline-none"
                      />
                    </div>
                    <div className="flex rounded-[3px] border border-[#dcd5c7] bg-[#f5f3ee] p-0.5 text-xs">
                      {(
                        [
                          { k: 'all', l: '全部' },
                          { k: 'passed', l: '及格' },
                          { k: 'failed', l: '未及格' },
                          { k: 'cheated', l: '作弊' },
                          { k: 'in_progress', l: '作答中' },
                        ] as const
                      ).map((f) => (
                        <button
                          key={f.k}
                          type="button"
                          onClick={() => setSubStatusFilter(f.k)}
                          className={`rounded-[2px] px-2.5 py-1 font-medium ${
                            subStatusFilter === f.k
                              ? 'bg-[#1a1917] text-[#fdfcf9]'
                              : 'text-[#57534a] hover:text-[#1a1917]'
                          }`}
                        >
                          {f.l}
                        </button>
                      ))}
                    </div>
                  </div>

                  <a
                    href={`/api/admin/exams/${overview.exam.id}/export?type=submissions`}
                    className="inline-flex items-center gap-1.5 rounded-[3px] bg-[#1a1917] px-3 py-1.5 text-xs font-medium text-[#fdfcf9] hover:bg-[#1b4965]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    导出全部成绩 CSV
                  </a>
                </div>

                {filteredSessions.length === 0 ? (
                  <div className="py-12 text-center text-sm text-[#8c867a]">
                    暂无符合条件的考生记录。
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-y border-[#dcd5c7] bg-[#f5f3ee] text-[#57534a]">
                        <tr>
                          <th className="px-3 py-2.5 font-medium">姓名 / 学号</th>
                          <th className="px-3 py-2.5 font-medium">学院 / 班级</th>
                          <th className="px-3 py-2.5 font-medium">交卷状态</th>
                          <th className="px-3 py-2.5 font-medium">有效分 (原分)</th>
                          <th className="px-3 py-2.5 font-medium">切屏</th>
                          <th className="px-3 py-2.5 font-medium">耗时</th>
                          <th className="px-3 py-2.5 font-medium">提交时间</th>
                          <th className="px-3 py-2.5 text-right font-medium">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#dcd5c7]">
                        {filteredSessions.map((s) => {
                          const activeCheat = s.is_cheated && !s.cheat_overridden;
                          return (
                            <tr key={s.id} className="hover:bg-[#f5f3ee]/50">
                              <td className="px-3 py-3">
                                <div className="font-medium text-[#1a1917]">{s.student_name}</div>
                                <div className="font-mono-num text-[11px] text-[#8c867a]">
                                  {s.student_id}
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <div className="text-[#1a1917]">{s.college || '—'}</div>
                                <div className="text-[11px] text-[#57534a]">
                                  {s.class_name || '—'}
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                {s.status === 'in_progress' ? (
                                  <span className="rounded-[2px] border border-[#1b4965]/30 bg-[#eaf1f5] px-2 py-0.5 text-[11px] text-[#1b4965]">
                                    作答中
                                  </span>
                                ) : activeCheat ? (
                                  <span className="inline-flex items-center gap-1 rounded-[2px] border border-[#b4281e]/40 bg-[#faeae8] px-2 py-0.5 text-[11px] font-medium text-[#b4281e]">
                                    <AlertOctagon className="h-3 w-3" /> 作弊锁卷
                                  </span>
                                ) : s.cheat_overridden ? (
                                  <span className="rounded-[2px] border border-[#1b6647]/40 bg-[#e8f3ed] px-2 py-0.5 text-[11px] text-[#1b6647]">
                                    复核有效
                                  </span>
                                ) : s.passed ? (
                                  <span className="rounded-[2px] border border-[#1b6647]/30 bg-[#e8f3ed] px-2 py-0.5 text-[11px] text-[#1b6647]">
                                    正常及格
                                  </span>
                                ) : (
                                  <span className="rounded-[2px] border border-[#a65c08]/30 bg-[#fbf2e4] px-2 py-0.5 text-[11px] text-[#a65c08]">
                                    未及格
                                  </span>
                                )}
                              </td>
                              <td className="font-mono-num px-3 py-3">
                                {s.status === 'in_progress' ? (
                                  <span className="text-xs text-[#1b4965]">
                                    已答 {s.answered_count}/{s.total_questions}
                                  </span>
                                ) : (
                                  <>
                                    <span
                                      className={`text-sm font-bold ${
                                        activeCheat
                                          ? 'text-[#b4281e]'
                                          : s.passed
                                            ? 'text-[#1b6647]'
                                            : 'text-[#1a1917]'
                                      }`}
                                    >
                                      {s.effective_score}
                                    </span>
                                    {s.is_cheated && (
                                      <span className="ml-1 text-[11px] text-[#8c867a]">
                                        ({s.raw_score})
                                      </span>
                                    )}
                                  </>
                                )}
                              </td>
                              <td className="font-mono-num px-3 py-3">
                                <span
                                  className={
                                    s.violation_count > overview.exam.max_violations
                                      ? 'font-bold text-[#b4281e]'
                                      : s.violation_count > 0
                                        ? 'font-semibold text-[#a65c08]'
                                        : 'text-[#8c867a]'
                                  }
                                >
                                  {s.violation_count} 次
                                </span>
                              </td>
                              <td className="font-mono-num px-3 py-3 text-[#57534a]">
                                {fmtSec(s.duration_sec)}
                              </td>
                              <td className="font-mono-num px-3 py-3 text-[#57534a]">
                                {fmtShortTime(s.submitted_at || s.started_at)}
                              </td>
                              <td className="px-3 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => setAuditSessionId(s.id)}
                                  className="inline-flex items-center gap-1 rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] px-2.5 py-1 text-xs font-medium text-[#1a1917] hover:border-[#1a1917]"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  详情
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: QUESTION BANK & ERROR LEADERBOARD */}
            {tab === 'questions' && (
              <div className="space-y-5">
                <div className="exam-surface rounded-[3px] p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={qSubjectFilter}
                        onChange={(e) => setQSubjectFilter(e.target.value)}
                        className="rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] px-2.5 py-1.5 text-xs"
                      >
                        <option value="all">全部科目 ({overview.questionStats.length} 题)</option>
                        {questionSubjects.map((sub) => (
                          <option key={sub} value={sub}>
                            {sub}
                          </option>
                        ))}
                      </select>
                      <select
                        value={qTypeFilter}
                        onChange={(e) => setQTypeFilter(e.target.value as 'all' | QuestionType)}
                        className="rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] px-2.5 py-1.5 text-xs"
                      >
                        <option value="all">全部题型</option>
                        <option value="single">单选题</option>
                        <option value="multiple">多选题</option>
                        <option value="judge">判断题</option>
                      </select>
                      <select
                        value={qSort}
                        onChange={(e) => setQSort(e.target.value as 'error_desc' | 'code_asc')}
                        className="rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] px-2.5 py-1.5 text-xs"
                      >
                        <option value="error_desc">按错误率从高到低</option>
                        <option value="code_asc">按题库编号排序</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setImportOpen((o) => !o)}
                        className="inline-flex items-center gap-1.5 rounded-[3px] border border-[#1a1917] bg-[#fdfcf9] px-3 py-1.5 text-xs font-medium text-[#1a1917] hover:bg-[#1a1917] hover:text-[#fdfcf9]"
                      >
                        <FileJson className="h-3.5 w-3.5" />
                        导入 / 替换题库 JSON
                      </button>
                      <a
                        href={`/api/admin/exams/${overview.exam.id}/export?type=questions`}
                        className="inline-flex items-center gap-1.5 rounded-[3px] bg-[#1a1917] px-3 py-1.5 text-xs font-medium text-[#fdfcf9] hover:bg-[#1b4965]"
                      >
                        <Download className="h-3.5 w-3.5" />
                        导出错题榜 CSV
                      </a>
                    </div>
                  </div>

                  {/* Reusable JSON Import Drawer */}
                  {importOpen && (
                    <div className="mb-5 rounded-[3px] border border-[#1b4965]/40 bg-[#f5f3ee] p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#1a1917]">
                          导入题库 JSON（将替换当前考试的题库）
                        </span>
                        <button
                          type="button"
                          onClick={() => setImportJson(SAMPLE_QUESTIONS_JSON)}
                          className="text-xs text-[#1b4965] underline"
                        >
                          填入示例模板
                        </button>
                      </div>
                      <textarea
                        rows={8}
                        value={importJson}
                        onChange={(e) => setImportJson(e.target.value)}
                        placeholder="粘贴符合格式的题目 JSON 数组..."
                        className="font-mono-num w-full rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] p-3 text-xs focus:border-[#1b4965] focus:outline-none"
                      />
                      {importMsg && (
                        <div
                          className={`mt-2 text-xs ${
                            importMsg.type === 'ok' ? 'text-[#1b6647]' : 'text-[#b4281e]'
                          }`}
                        >
                          {importMsg.text}
                        </div>
                      )}
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setImportOpen(false)}
                          className="rounded-[3px] border border-[#bfb7a6] px-3 py-1.5 text-xs"
                        >
                          收起
                        </button>
                        <button
                          type="button"
                          disabled={importing || !importJson.trim()}
                          onClick={() => void handleImportQuestions()}
                          className="rounded-[3px] bg-[#1b4965] px-4 py-1.5 text-xs font-medium text-[#fdfcf9] disabled:opacity-50"
                        >
                          {importing ? '校验并导入中...' : '确认导入题库'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Question Leaderboard Table */}
                  <div className="divide-y divide-[#dcd5c7] border-t border-[#dcd5c7]">
                    {filteredQuestions.map((q) => {
                      const open = expandedQId === q.id;
                      return (
                        <div key={q.id} className="py-3">
                          <button
                            type="button"
                            onClick={() => setExpandedQId(open ? null : q.id)}
                            className="flex w-full items-start justify-between gap-4 text-left"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                <span className="font-mono-num font-bold text-[#1a1917]">
                                  #{q.code}
                                </span>
                                <span className="rounded-[2px] bg-[#eaf1f5] px-1.5 py-0.5 font-medium text-[#1b4965]">
                                  {q.subject}
                                </span>
                                <span className="text-[#8c867a]">{TYPE_LABELS[q.type]}</span>
                              </div>
                              <div className="mt-1 text-xs leading-5 text-[#1a1917]">
                                {q.prompt}
                              </div>
                            </div>
                            <div className="font-mono-num shrink-0 text-right text-xs">
                              <div
                                className={`font-bold ${
                                  q.errorRate >= 50
                                    ? 'text-[#b4281e]'
                                    : q.errorRate >= 25
                                      ? 'text-[#a65c08]'
                                      : 'text-[#1b6647]'
                                }`}
                              >
                                错误率 {q.errorRate}%
                              </div>
                              <div className="text-[11px] text-[#8c867a]">
                                错 {q.wrongCount} / 抽 {q.appearances}
                              </div>
                            </div>
                          </button>

                          {open && (
                            <div className="mt-3 rounded-[2px] border border-[#dcd5c7] bg-[#f5f3ee]/70 p-3.5 text-xs">
                              <div className="grid gap-1.5 sm:grid-cols-2">
                                {q.options.map((opt) => {
                                  const isAns = q.answer.includes(opt.key);
                                  return (
                                    <div
                                      key={opt.key}
                                      className={`rounded-[2px] border px-2.5 py-1.5 ${
                                        isAns
                                          ? 'border-[#1b6647]/40 bg-[#e8f3ed] font-medium text-[#1b6647]'
                                          : 'border-[#dcd5c7] bg-[#fdfcf9] text-[#57534a]'
                                      }`}
                                    >
                                      <span className="font-mono-num mr-1.5 font-bold">
                                        {q.type === 'judge'
                                          ? opt.key === 'T'
                                            ? '√'
                                            : '×'
                                          : `${opt.key}.`}
                                      </span>
                                      {opt.label}
                                    </div>
                                  );
                                })}
                              </div>
                              {q.explanation && (
                                <div className="mt-2.5 text-[#57534a]">
                                  <strong className="text-[#1a1917]">解析：</strong>
                                  {q.explanation}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: EXAM SETTINGS */}
            {tab === 'settings' && (
              <form
                onSubmit={handleSaveSettings}
                className="exam-surface max-w-3xl space-y-5 rounded-[3px] p-6"
              >
                <div className="flex items-center justify-between border-b border-[#dcd5c7] pb-4">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-[#1b4965]" />
                    <h2 className="text-base font-semibold">
                      考试设置（/exam/{overview.exam.slug}）
                    </h2>
                  </div>
                  {exams.length > 1 && (
                    <button
                      type="button"
                      onClick={handleDeleteExam}
                      className="inline-flex items-center gap-1 rounded-[3px] border border-[#b4281e]/40 px-2.5 py-1 text-xs text-[#b4281e] hover:bg-[#faeae8]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除考试
                    </button>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-[#57534a]">
                      活动标题
                    </label>
                    <input
                      type="text"
                      value={settingsForm.title ?? ''}
                      onChange={(e) =>
                        setSettingsForm((p) => ({ ...p, title: e.target.value }))
                      }
                      className="w-full rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-[#57534a]">
                      副标题
                    </label>
                    <input
                      type="text"
                      value={settingsForm.subtitle ?? ''}
                      onChange={(e) =>
                        setSettingsForm((p) => ({ ...p, subtitle: e.target.value }))
                      }
                      className="w-full rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-[#57534a]">
                      考试说明
                    </label>
                    <textarea
                      rows={2}
                      value={settingsForm.description ?? ''}
                      onChange={(e) =>
                        setSettingsForm((p) => ({ ...p, description: e.target.value }))
                      }
                      className="w-full rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#57534a]">
                      纯随机抽题数量（当前题库 {overview.questionStats.length} 题）
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={settingsForm.draw_count ?? 40}
                      onChange={(e) =>
                        setSettingsForm((p) => ({ ...p, draw_count: Number(e.target.value) }))
                      }
                      className="font-mono-num w-full rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#57534a]">
                      作答时长（分钟）
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={300}
                      value={settingsForm.duration_minutes ?? 30}
                      onChange={(e) =>
                        setSettingsForm((p) => ({
                          ...p,
                          duration_minutes: Number(e.target.value),
                        }))
                      }
                      className="font-mono-num w-full rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#57534a]">
                      及格分数线（满分 100）
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={settingsForm.pass_score ?? 60}
                      onChange={(e) =>
                        setSettingsForm((p) => ({ ...p, pass_score: Number(e.target.value) }))
                      }
                      className="font-mono-num w-full rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#57534a]">
                      切屏允许上限（超过此次数即判作弊锁卷）
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={settingsForm.max_violations ?? 3}
                      onChange={(e) =>
                        setSettingsForm((p) => ({
                          ...p,
                          max_violations: Number(e.target.value),
                        }))
                      }
                      className="font-mono-num w-full rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                {/* Toggle switches */}
                <div className="grid gap-3 border-t border-[#dcd5c7] pt-4 sm:grid-cols-2">
                  {[
                    {
                      key: 'is_open',
                      title: '开放考试',
                      desc: '关闭后新考生无法进入，已交卷仍可查分',
                    },
                    {
                      key: 'is_default',
                      title: '设为首页默认考试',
                      desc: '访问首页时直接进入这场考试',
                    },
                    {
                      key: 'show_explanations',
                      title: '交卷后显示答案与解析',
                      desc: '正式考试建议关闭，练习时可开启',
                    },
                    {
                      key: 'allow_retake',
                      title: '允许同学号重考',
                      desc: '关闭时每个学号只能作答一次',
                    },
                    {
                      key: 'require_college_class',
                      title: '必选学院与班级',
                      desc: '开考前需选择所属学院和班级',
                    },
                    {
                      key: 'require_password',
                      title: '开启考试密码',
                      desc: '考生需输入密码才能进入本场考试',
                    },
                  ].map((item) => {
                    const checked = Boolean(settingsForm[item.key as keyof ExamConfig]);
                    return (
                      <label
                        key={item.key}
                        className="flex cursor-pointer items-start gap-2.5 rounded-[3px] border border-[#dcd5c7] bg-[#f5f3ee]/60 p-3"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSettingsForm((p) => ({
                              ...p,
                              [item.key]: e.target.checked,
                            }))
                          }
                          className="mt-0.5 h-4 w-4 accent-[#1b4965]"
                        />
                        <div>
                          <div className="text-xs font-medium text-[#1a1917]">{item.title}</div>
                          <div className="mt-0.5 text-[11px] text-[#57534a]">{item.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {settingsForm.require_password && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#57534a]">
                      考试密码 *
                    </label>
                    <input
                      type="text"
                      required
                      value={settingsForm.access_password ?? ''}
                      onChange={(e) =>
                        setSettingsForm((p) => ({ ...p, access_password: e.target.value }))
                      }
                      placeholder="设置本场考试的入场密码"
                      maxLength={64}
                      className="font-mono-num w-full max-w-sm rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] px-3 py-2 text-sm focus:border-[#1b4965] focus:outline-none"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <span
                    className={`text-xs ${
                      settingsMsg.includes('保存') ? 'text-[#1b6647]' : 'text-[#b4281e]'
                    }`}
                  >
                    {settingsMsg}
                  </span>
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="rounded-[3px] bg-[#1a1917] px-5 py-2 text-xs font-medium text-[#fdfcf9] hover:bg-[#1b4965] disabled:opacity-50"
                  >
                    {savingSettings ? '保存中...' : '保存考场配置'}
                  </button>
                </div>
              </form>
            )}

            {/* TAB 5: SHARED COLLEGE / CLASS DIRECTORY */}
            {tab === 'colleges' && (
              <div className="exam-surface max-w-4xl space-y-4 rounded-[3px] p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#dcd5c7] pb-4">
                  <div>
                    <h2 className="text-base font-semibold">学院与班级列表</h2>
                    <p className="mt-1 text-xs text-[#57534a]">
                      共{' '}
                      <strong className="font-mono-num text-[#1a1917]">
                        {totalCollegesCount}
                      </strong>{' '}
                      个学院、
                      <strong className="font-mono-num text-[#1a1917]">
                        {totalClassesCount}
                      </strong>{' '}
                      个班级，所有考试共用。
                    </p>
                  </div>
                </div>

                <textarea
                  rows={18}
                  value={collegeJson}
                  onChange={(e) => setCollegeJson(e.target.value)}
                  className="font-mono-num w-full rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] p-3.5 text-xs leading-5 focus:border-[#1b4965] focus:outline-none"
                />

                <div className="flex items-center justify-between">
                  {collegeMsg ? (
                    <span
                      className={`text-xs ${
                        collegeMsg.type === 'ok' ? 'text-[#1b6647]' : 'text-[#b4281e]'
                      }`}
                    >
                      {collegeMsg.text}
                    </span>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    disabled={savingColleges}
                    onClick={() => void handleSaveColleges()}
                    className="rounded-[3px] bg-[#1a1917] px-5 py-2 text-xs font-medium text-[#fdfcf9] hover:bg-[#1b4965] disabled:opacity-50"
                  >
                    {savingColleges ? '保存中...' : '保存全局院系名录'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Candidate Audit Drawer Modal */}
      {auditSessionId && (
        <SessionAuditModal
          sessionId={auditSessionId}
          onClose={() => setAuditSessionId(null)}
          onUpdated={() => selectedExamId && void loadOverview(selectedExamId)}
        />
      )}

      {/* Create New Reusable Exam Activity Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[3px] border border-[#1a1917] bg-[#fdfcf9] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-[#dcd5c7] pb-3">
              <h3 className="text-base font-semibold">新建考试</h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="p-1 text-[#57534a] hover:text-[#1a1917]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateExam} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#57534a]">
                    考试名称 *
                  </label>
                  <input
                    type="text"
                    required
                    value={newExam.title}
                    onChange={(e) => setNewExam((p) => ({ ...p, title: e.target.value }))}
                    placeholder="填写考试名称"
                    className="w-full rounded-[3px] border border-[#bfb7a6] px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#57534a]">
                    访问路径 (slug) *
                  </label>
                  <input
                    type="text"
                    required
                    value={newExam.slug}
                    onChange={(e) => setNewExam((p) => ({ ...p, slug: e.target.value }))}
                    placeholder="如 exam-2026"
                    className="font-mono-num w-full rounded-[3px] border border-[#bfb7a6] px-3 py-2 text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-[#57534a]">
                    副标题（可选）
                  </label>
                  <input
                    type="text"
                    value={newExam.subtitle}
                    onChange={(e) => setNewExam((p) => ({ ...p, subtitle: e.target.value }))}
                    placeholder="可选"
                    className="w-full rounded-[3px] border border-[#bfb7a6] px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#57534a]">抽题数</label>
                  <input
                    type="number"
                    min={1}
                    value={newExam.draw_count}
                    onChange={(e) =>
                      setNewExam((p) => ({ ...p, draw_count: Number(e.target.value) }))
                    }
                    className="font-mono-num w-full rounded-[3px] border border-[#bfb7a6] px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#57534a]">
                    限时（分钟）
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={newExam.duration_minutes}
                    onChange={(e) =>
                      setNewExam((p) => ({ ...p, duration_minutes: Number(e.target.value) }))
                    }
                    className="font-mono-num w-full rounded-[3px] border border-[#bfb7a6] px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-[#57534a]">
                    初始题库 JSON（可选，也可创建后再导入）
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setNewExam((p) => ({ ...p, questionsJson: SAMPLE_QUESTIONS_JSON }))
                    }
                    className="text-[#1b4965] underline"
                  >
                    填入示例模板
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={newExam.questionsJson}
                  onChange={(e) => setNewExam((p) => ({ ...p, questionsJson: e.target.value }))}
                  placeholder="粘贴题目 JSON 数组..."
                  className="font-mono-num w-full rounded-[3px] border border-[#bfb7a6] p-2.5 text-xs"
                />
              </div>

              <div className="space-y-2.5">
                <label className="flex items-center gap-2 text-xs text-[#57534a]">
                  <input
                    type="checkbox"
                    checked={newExam.require_password}
                    onChange={(e) =>
                      setNewExam((p) => ({ ...p, require_password: e.target.checked }))
                    }
                    className="accent-[#1b4965]"
                  />
                  开启考试密码
                </label>
                {newExam.require_password && (
                  <input
                    type="text"
                    required
                    value={newExam.access_password}
                    onChange={(e) =>
                      setNewExam((p) => ({ ...p, access_password: e.target.value }))
                    }
                    placeholder="填写考试密码"
                    maxLength={64}
                    className="font-mono-num w-full max-w-xs rounded-[3px] border border-[#bfb7a6] px-3 py-1.5 text-xs"
                  />
                )}
                <label className="flex items-center gap-2 text-xs text-[#57534a]">
                  <input
                    type="checkbox"
                    checked={newExam.is_default}
                    onChange={(e) => setNewExam((p) => ({ ...p, is_default: e.target.checked }))}
                    className="accent-[#1b4965]"
                  />
                  设为首页默认考试
                </label>
              </div>

              {createErr && (
                <div className="rounded-[2px] border border-[#b4281e]/40 bg-[#faeae8] px-3 py-2 text-xs text-[#b4281e]">
                  {createErr}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-[3px] border border-[#bfb7a6] px-4 py-2 text-xs"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-[3px] bg-[#1a1917] px-4 py-2 text-xs font-medium text-[#fdfcf9] hover:bg-[#1b4965] disabled:opacity-50"
                >
                  {creating ? '创建中...' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

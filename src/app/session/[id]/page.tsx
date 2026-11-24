'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ExamHallClient } from '@/components/ExamHallClient';
import { ExamResultView } from '@/components/ExamResultView';
import type {
  BreakdownStat,
  ExamConfig,
  ExamSessionRecord,
  PublicQuestion,
  ReviewItem,
} from '@/lib/types';

interface SessionPayload {
  serverNow: string;
  exam: ExamConfig;
  session: ExamSessionRecord;
  questions?: PublicQuestion[];
  passed?: boolean;
  breakdowns?: {
    bySubject: BreakdownStat[];
    byType: BreakdownStat[];
  };
  review?: ReviewItem[] | null;
  error?: string;
}

export default function SessionPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params?.id;

  const [data, setData] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadSession = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { cache: 'no-store' });
      const json = (await res.json()) as SessionPayload;
      if (!res.ok) {
        setError(json.error || '无法加载考试记录');
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setError('加载失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f3ee]">
        <div className="exam-surface rounded-[3px] px-7 py-5 text-sm text-[#57534a]">
          加载中...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f3ee] p-6">
        <div className="exam-surface max-w-md rounded-[3px] p-8 text-center">
          <h1 className="text-base font-semibold text-[#1a1917]">无法打开试卷</h1>
          <p className="mt-2 text-sm text-[#57534a]">{error || '考试记录不存在'}</p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-[3px] bg-[#1a1917] px-4 py-2 text-xs font-medium text-[#fdfcf9]"
          >
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  if (data.session.status === 'in_progress' && data.questions) {
    return (
      <ExamHallClient
        exam={data.exam}
        initialSession={data.session}
        questions={data.questions}
        serverNow={data.serverNow}
        onFinalized={() => void loadSession()}
      />
    );
  }

  return (
    <ExamResultView
      exam={data.exam}
      session={data.session}
      passed={Boolean(data.passed)}
      breakdowns={data.breakdowns ?? { bySubject: [], byType: [] }}
      review={data.review ?? null}
    />
  );
}

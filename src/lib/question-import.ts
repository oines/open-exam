import type { SeedQuestion } from '@/data/sample-exam';
import { normalizeKeys } from '@/lib/grading';
import type { QuestionOption, QuestionType } from '@/lib/types';

export function validateImportedQuestions(raw: unknown): {
  ok: boolean;
  questions?: SeedQuestion[];
  error?: string;
} {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: '题库必须是至少包含 1 道题目的 JSON 数组' };
  }

  const parsed: SeedQuestion[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as Record<string, unknown>;
    if (!item || typeof item !== 'object') {
      return { ok: false, error: `第 ${i + 1} 题格式不正确，必须是对象` };
    }

    const type = String(item.type || '').trim() as QuestionType;
    if (type !== 'single' && type !== 'multiple' && type !== 'judge') {
      return {
        ok: false,
        error: `第 ${i + 1} 题的 type 必须是 "single" | "multiple" | "judge"`,
      };
    }

    const prompt = String(item.prompt || '').trim();
    if (!prompt) {
      return { ok: false, error: `第 ${i + 1} 题缺少题干 (prompt)` };
    }

    const subject = String(item.subject || '综合').trim() || '综合';
    const code = String(item.code || String(i + 1).padStart(2, '0')).trim();
    const explanation = String(item.explanation || '').trim();

    let options: QuestionOption[];
    if (type === 'judge') {
      options = [
        { key: 'T', label: '正确' },
        { key: 'F', label: '错误' },
      ];
    } else {
      if (!Array.isArray(item.options) || item.options.length < 2) {
        return { ok: false, error: `第 ${i + 1} 题至少需要 2 个选项` };
      }
      options = item.options.map((opt, idx) => {
        if (typeof opt === 'string') {
          return { key: String.fromCharCode(65 + idx), label: opt.trim() };
        }
        const o = opt as Record<string, unknown>;
        return {
          key: String(o.key || String.fromCharCode(65 + idx))
            .trim()
            .toUpperCase(),
          label: String(o.label || '').trim(),
        };
      });
      if (options.some((o) => !o.label)) {
        return { ok: false, error: `第 ${i + 1} 题存在空选项内容` };
      }
    }

    let rawAns: string[];
    if (typeof item.answer === 'string') {
      const s = item.answer.trim().toUpperCase();
      if (type === 'judge') {
        rawAns = s === '正确' || s === 'T' || s === 'TRUE' || s === '√' ? ['T'] : ['F'];
      } else {
        rawAns = s.replace(/[^A-Z]/g, '').split('');
      }
    } else if (Array.isArray(item.answer)) {
      rawAns = item.answer.map((a) => {
        const s = String(a).trim().toUpperCase();
        if (type === 'judge') {
          return s === '正确' || s === 'T' || s === 'TRUE' || s === '√' ? 'T' : 'F';
        }
        return s;
      });
    } else {
      return { ok: false, error: `第 ${i + 1} 题缺少标准答案 (answer)` };
    }

    const answer = normalizeKeys(rawAns);
    if (answer.length === 0) {
      return { ok: false, error: `第 ${i + 1} 题标准答案不能为空` };
    }
    const validKeys = new Set(options.map((o) => o.key));
    if (answer.some((k) => !validKeys.has(k))) {
      return {
        ok: false,
        error: `第 ${i + 1} 题的答案 (${answer.join(',')}) 与选项键不匹配`,
      };
    }

    parsed.push({ code, subject, type, prompt, options, answer, explanation });
  }

  return { ok: true, questions: parsed };
}

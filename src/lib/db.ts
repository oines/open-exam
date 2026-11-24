import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DEFAULT_COLLEGE_DIRECTORY } from '@/data/colleges';
import {
  DEFAULT_SAMPLE_EXAM,
  SAMPLE_QUESTIONS,
  type SeedExamConfig,
  type SeedQuestion,
} from '@/data/sample-exam';
import { drawRandomQuestions, gradeQuestions, normalizeKeys } from '@/lib/grading';
import type {
  CollegeDirectory,
  ExamConfig,
  ExamSessionRecord,
  QuestionOption,
  QuestionRecord,
  QuestionType,
  SessionStatus,
  ViolationLog,
} from '@/lib/types';

// Runtime access to Node's built-in node:sqlite (Node 22.5+ / Node 26)
interface SQLiteStatement {
  run: (...params: unknown[]) => { changes: number; lastInsertRowid: number | bigint };
  get: (...params: unknown[]) => Record<string, unknown> | undefined;
  all: (...params: unknown[]) => Record<string, unknown>[];
}

interface SQLiteDatabase {
  exec: (sql: string) => void;
  prepare: (sql: string) => SQLiteStatement;
}

declare global {
  // eslint-disable-next-line no-var
  var __openExamDb: SQLiteDatabase | undefined;
}

function openDatabase(): SQLiteDatabase {
  if (globalThis.__openExamDb) {
    return globalThis.__openExamDb;
  }

  const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH || './data/exam.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  // Use dynamic require to prevent webpack/turbopack static resolution issues on built-in node:sqlite
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (location: string) => SQLiteDatabase;
  };

  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      is_default INTEGER NOT NULL DEFAULT 0,
      is_open INTEGER NOT NULL DEFAULT 1,
      draw_count INTEGER NOT NULL DEFAULT 40,
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      pass_score REAL NOT NULL DEFAULT 60,
      max_violations INTEGER NOT NULL DEFAULT 3,
      show_explanations INTEGER NOT NULL DEFAULT 1,
      allow_retake INTEGER NOT NULL DEFAULT 0,
      require_college_class INTEGER NOT NULL DEFAULT 1,
      require_password INTEGER NOT NULL DEFAULT 0,
      access_password TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      subject TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('single', 'multiple', 'judge')),
      prompt TEXT NOT NULL,
      options_json TEXT NOT NULL,
      answer_json TEXT NOT NULL,
      explanation TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_questions_exam_id ON questions(exam_id);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      student_name TEXT NOT NULL,
      student_id TEXT NOT NULL,
      college TEXT NOT NULL DEFAULT '',
      class_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'in_progress',
      question_ids_json TEXT NOT NULL,
      answers_json TEXT NOT NULL DEFAULT '{}',
      flagged_ids_json TEXT NOT NULL DEFAULT '[]',
      violations_json TEXT NOT NULL DEFAULT '[]',
      violation_count INTEGER NOT NULL DEFAULT 0,
      is_cheated INTEGER NOT NULL DEFAULT 0,
      cheat_overridden INTEGER NOT NULL DEFAULT 0,
      override_note TEXT NOT NULL DEFAULT '',
      raw_score REAL NOT NULL DEFAULT 0,
      effective_score REAL NOT NULL DEFAULT 0,
      total_score REAL NOT NULL DEFAULT 100,
      correct_count INTEGER NOT NULL DEFAULT 0,
      total_questions INTEGER NOT NULL DEFAULT 40,
      started_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      submitted_at TEXT,
      duration_sec INTEGER,
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_exam_student ON sessions(exam_id, student_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_exam_status ON sessions(exam_id, status);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  migrateDatabase(db);
  seedInitialData(db, path.dirname(dbPath));
  globalThis.__openExamDb = db;
  return db;
}

function migrateDatabase(db: SQLiteDatabase) {
  const cols = db.prepare('PRAGMA table_info(exams)').all();
  const names = new Set(cols.map((c) => String(c.name)));
  if (!names.has('require_password')) {
    db.exec('ALTER TABLE exams ADD COLUMN require_password INTEGER NOT NULL DEFAULT 0');
  }
  if (!names.has('access_password')) {
    db.exec("ALTER TABLE exams ADD COLUMN access_password TEXT NOT NULL DEFAULT ''");
  }
}

function readExternalJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function seedInitialData(db: SQLiteDatabase, dataDir: string) {
  const now = new Date().toISOString();

  // Seed college directory from optional data/seed-colleges.json or built-in sample
  const existingColleges = db
    .prepare('SELECT key FROM app_settings WHERE key = ?')
    .get('college_directory');
  if (!existingColleges) {
    const externalColleges = readExternalJson<CollegeDirectory>(
      path.join(dataDir, 'seed-colleges.json'),
    );
    const directory =
      externalColleges && Object.keys(externalColleges).length > 0
        ? externalColleges
        : DEFAULT_COLLEGE_DIRECTORY;
    db.prepare(
      'INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)',
    ).run('college_directory', JSON.stringify(directory), now);
  }

  // Seed initial exam from optional data/seed-exam.json or built-in sample
  const examCountRow = db.prepare('SELECT COUNT(*) as cnt FROM exams').get();
  const examCount = Number(examCountRow?.cnt ?? 0);
  if (examCount === 0) {
    const externalSeed = readExternalJson<{
      exam?: Partial<SeedExamConfig>;
      questions?: SeedQuestion[];
    }>(path.join(dataDir, 'seed-exam.json'));

    const seedExam: SeedExamConfig = {
      ...DEFAULT_SAMPLE_EXAM,
      ...(externalSeed?.exam ?? {}),
    };
    const seedQuestions =
      Array.isArray(externalSeed?.questions) && externalSeed.questions.length > 0
        ? externalSeed.questions
        : SAMPLE_QUESTIONS;

    const res = db
      .prepare(
        `INSERT INTO exams (
          slug, title, subtitle, description,
          is_default, is_open, draw_count, duration_minutes,
          pass_score, max_violations, show_explanations,
          allow_retake, require_college_class, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        seedExam.slug,
        seedExam.title,
        seedExam.subtitle,
        seedExam.description,
        seedExam.draw_count,
        seedExam.duration_minutes,
        seedExam.pass_score,
        seedExam.max_violations,
        seedExam.show_explanations ? 1 : 0,
        seedExam.allow_retake ? 1 : 0,
        seedExam.require_college_class ? 1 : 0,
        now,
        now,
      );

    const examId = Number(res.lastInsertRowid);
    insertQuestionsBatch(db, examId, seedQuestions);
  }
}

function insertQuestionsBatch(
  db: SQLiteDatabase,
  examId: number,
  questions: SeedQuestion[],
) {
  const stmt = db.prepare(
    `INSERT INTO questions (exam_id, code, subject, type, prompt, options_json, answer_json, explanation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db.exec('BEGIN');
  try {
    for (const q of questions) {
      stmt.run(
        examId,
        q.code,
        q.subject,
        q.type,
        q.prompt,
        JSON.stringify(q.options),
        JSON.stringify(normalizeKeys(q.answer)),
        q.explanation || '',
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function mapExamRow(row: Record<string, unknown>): ExamConfig {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    title: String(row.title),
    subtitle: String(row.subtitle ?? ''),
    description: String(row.description ?? ''),
    is_default: Boolean(row.is_default),
    is_open: Boolean(row.is_open),
    draw_count: Number(row.draw_count),
    duration_minutes: Number(row.duration_minutes),
    pass_score: Number(row.pass_score),
    max_violations: Number(row.max_violations),
    show_explanations: Boolean(row.show_explanations),
    allow_retake: Boolean(row.allow_retake),
    require_college_class: Boolean(row.require_college_class),
    require_password: Boolean(row.require_password),
    access_password: String(row.access_password ?? ''),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    question_count: row.question_count !== undefined ? Number(row.question_count) : undefined,
    submission_count:
      row.submission_count !== undefined ? Number(row.submission_count) : undefined,
  };
}

function mapQuestionRow(row: Record<string, unknown>): QuestionRecord {
  return {
    id: Number(row.id),
    exam_id: Number(row.exam_id),
    code: String(row.code),
    subject: String(row.subject),
    type: String(row.type) as QuestionType,
    prompt: String(row.prompt),
    options: JSON.parse(String(row.options_json)) as QuestionOption[],
    answer: JSON.parse(String(row.answer_json)) as string[],
    explanation: String(row.explanation ?? ''),
  };
}

function mapSessionRow(row: Record<string, unknown>): ExamSessionRecord {
  return {
    id: String(row.id),
    exam_id: Number(row.exam_id),
    student_name: String(row.student_name),
    student_id: String(row.student_id),
    college: String(row.college ?? ''),
    class_name: String(row.class_name ?? ''),
    status: String(row.status) as SessionStatus,
    question_ids: JSON.parse(String(row.question_ids_json)) as number[],
    answers: JSON.parse(String(row.answers_json)) as Record<string, string[]>,
    flagged_ids: JSON.parse(String(row.flagged_ids_json)) as number[],
    violations: JSON.parse(String(row.violations_json)) as ViolationLog[],
    violation_count: Number(row.violation_count),
    is_cheated: Boolean(row.is_cheated),
    cheat_overridden: Boolean(row.cheat_overridden),
    override_note: String(row.override_note ?? ''),
    raw_score: Number(row.raw_score),
    effective_score: Number(row.effective_score),
    total_score: Number(row.total_score),
    correct_count: Number(row.correct_count),
    total_questions: Number(row.total_questions),
    started_at: String(row.started_at),
    expires_at: String(row.expires_at),
    submitted_at: row.submitted_at ? String(row.submitted_at) : null,
    duration_sec: row.duration_sec !== null && row.duration_sec !== undefined ? Number(row.duration_sec) : null,
    ip_address: String(row.ip_address ?? ''),
    user_agent: String(row.user_agent ?? ''),
  };
}

// ---------- Colleges ----------

export function getCollegeDirectory(): CollegeDirectory {
  const db = openDatabase();
  const row = db
    .prepare('SELECT value_json FROM app_settings WHERE key = ?')
    .get('college_directory');
  if (!row) return DEFAULT_COLLEGE_DIRECTORY;
  try {
    return JSON.parse(String(row.value_json)) as CollegeDirectory;
  } catch {
    return DEFAULT_COLLEGE_DIRECTORY;
  }
}

export function saveCollegeDirectory(directory: CollegeDirectory): CollegeDirectory {
  const db = openDatabase();
  const normalized: CollegeDirectory = {};
  for (const [college, classes] of Object.entries(directory)) {
    const cleanCollege = college.trim();
    if (!cleanCollege || !Array.isArray(classes)) continue;
    const cleanClasses = Array.from(
      new Set(classes.map((c) => String(c).trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
    if (cleanClasses.length > 0) {
      normalized[cleanCollege] = cleanClasses;
    }
  }
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO app_settings (key, value_json, updated_at)
     VALUES ('college_directory', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
  ).run(JSON.stringify(normalized), now);
  return normalized;
}

// ---------- Exams ----------

export function listExams(): ExamConfig[] {
  const db = openDatabase();
  const rows = db
    .prepare(
      `SELECT e.*,
        (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) as question_count,
        (SELECT COUNT(*) FROM sessions s WHERE s.exam_id = e.id) as submission_count
       FROM exams e
       ORDER BY e.is_default DESC, e.id DESC`,
    )
    .all();
  return rows.map(mapExamRow);
}

export function getDefaultExam(): ExamConfig | null {
  const db = openDatabase();
  const row = db
    .prepare(
      `SELECT e.*,
        (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) as question_count,
        (SELECT COUNT(*) FROM sessions s WHERE s.exam_id = e.id) as submission_count
       FROM exams e
       ORDER BY e.is_default DESC, e.id ASC
       LIMIT 1`,
    )
    .get();
  return row ? mapExamRow(row) : null;
}

export function getExamBySlug(slug: string): ExamConfig | null {
  const db = openDatabase();
  const row = db
    .prepare(
      `SELECT e.*,
        (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) as question_count,
        (SELECT COUNT(*) FROM sessions s WHERE s.exam_id = e.id) as submission_count
       FROM exams e
       WHERE e.slug = ?`,
    )
    .get(slug);
  return row ? mapExamRow(row) : null;
}

export function getExamById(id: number): ExamConfig | null {
  const db = openDatabase();
  const row = db
    .prepare(
      `SELECT e.*,
        (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) as question_count,
        (SELECT COUNT(*) FROM sessions s WHERE s.exam_id = e.id) as submission_count
       FROM exams e
       WHERE e.id = ?`,
    )
    .get(id);
  return row ? mapExamRow(row) : null;
}

export function stripExamSecrets(exam: ExamConfig): ExamConfig {
  const copy = { ...exam };
  delete copy.access_password;
  return copy;
}

export function verifyExamAccessPassword(exam: ExamConfig, input: string): boolean {
  if (!exam.require_password) return true;
  const expected = Buffer.from((exam.access_password || '').trim(), 'utf8');
  const actual = Buffer.from((input || '').trim(), 'utf8');
  if (expected.length === 0) return true;
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function createExam(input: {
  slug: string;
  title: string;
  subtitle?: string;
  description?: string;
  is_default?: boolean;
  is_open?: boolean;
  draw_count?: number;
  duration_minutes?: number;
  pass_score?: number;
  max_violations?: number;
  show_explanations?: boolean;
  allow_retake?: boolean;
  require_college_class?: boolean;
  require_password?: boolean;
  access_password?: string;
  questions?: SeedQuestion[];
}): ExamConfig {
  const db = openDatabase();
  const now = new Date().toISOString();
  const slug = input.slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) {
    throw new Error('访问路径（slug）只能包含字母、数字和短横线');
  }

  const requirePassword = Boolean(input.require_password);
  const accessPassword = (input.access_password ?? '').trim();
  if (requirePassword && !accessPassword) {
    throw new Error('开启考试密码时请填写密码');
  }

  if (input.is_default) {
    db.prepare('UPDATE exams SET is_default = 0').run();
  }

  const res = db
    .prepare(
      `INSERT INTO exams (
        slug, title, subtitle, description,
        is_default, is_open, draw_count, duration_minutes,
        pass_score, max_violations, show_explanations,
        allow_retake, require_college_class, require_password, access_password,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      slug,
      input.title.trim(),
      (input.subtitle ?? '').trim(),
      (input.description ?? '').trim(),
      input.is_default ? 1 : 0,
      input.is_open === false ? 0 : 1,
      Math.max(1, Number(input.draw_count ?? 40)),
      Math.max(1, Number(input.duration_minutes ?? 30)),
      Math.max(0, Math.min(100, Number(input.pass_score ?? 60))),
      Math.max(0, Number(input.max_violations ?? 3)),
      input.show_explanations === false ? 0 : 1,
      input.allow_retake ? 1 : 0,
      input.require_college_class === false ? 0 : 1,
      requirePassword ? 1 : 0,
      accessPassword,
      now,
      now,
    );

  const examId = Number(res.lastInsertRowid);
  if (input.questions && input.questions.length > 0) {
    insertQuestionsBatch(db, examId, input.questions);
  }
  return getExamById(examId)!;
}

export function updateExam(
  examId: number,
  patch: Partial<{
    title: string;
    subtitle: string;
    description: string;
    is_default: boolean;
    is_open: boolean;
    draw_count: number;
    duration_minutes: number;
    pass_score: number;
    max_violations: number;
    show_explanations: boolean;
    allow_retake: boolean;
    require_college_class: boolean;
    require_password: boolean;
    access_password: string;
  }>,
): ExamConfig | null {
  const db = openDatabase();
  const current = getExamById(examId);
  if (!current) return null;

  const nextRequirePassword =
    patch.require_password !== undefined ? patch.require_password : current.require_password;
  const nextAccessPassword =
    patch.access_password !== undefined
      ? patch.access_password.trim()
      : (current.access_password ?? '');

  if (nextRequirePassword && !nextAccessPassword) {
    throw new Error('开启考试密码时请填写密码');
  }

  if (patch.is_default) {
    db.prepare('UPDATE exams SET is_default = 0').run();
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE exams SET
      title = ?,
      subtitle = ?,
      description = ?,
      is_default = ?,
      is_open = ?,
      draw_count = ?,
      duration_minutes = ?,
      pass_score = ?,
      max_violations = ?,
      show_explanations = ?,
      allow_retake = ?,
      require_college_class = ?,
      require_password = ?,
      access_password = ?,
      updated_at = ?
     WHERE id = ?`,
  ).run(
    patch.title !== undefined ? patch.title.trim() : current.title,
    patch.subtitle !== undefined ? patch.subtitle.trim() : current.subtitle,
    patch.description !== undefined ? patch.description.trim() : current.description,
    patch.is_default !== undefined ? (patch.is_default ? 1 : 0) : current.is_default ? 1 : 0,
    patch.is_open !== undefined ? (patch.is_open ? 1 : 0) : current.is_open ? 1 : 0,
    patch.draw_count !== undefined ? Math.max(1, Number(patch.draw_count)) : current.draw_count,
    patch.duration_minutes !== undefined
      ? Math.max(1, Number(patch.duration_minutes))
      : current.duration_minutes,
    patch.pass_score !== undefined
      ? Math.max(0, Math.min(100, Number(patch.pass_score)))
      : current.pass_score,
    patch.max_violations !== undefined
      ? Math.max(0, Number(patch.max_violations))
      : current.max_violations,
    patch.show_explanations !== undefined
      ? patch.show_explanations
        ? 1
        : 0
      : current.show_explanations
        ? 1
        : 0,
    patch.allow_retake !== undefined
      ? patch.allow_retake
        ? 1
        : 0
      : current.allow_retake
        ? 1
        : 0,
    patch.require_college_class !== undefined
      ? patch.require_college_class
        ? 1
        : 0
      : current.require_college_class
        ? 1
        : 0,
    nextRequirePassword ? 1 : 0,
    nextAccessPassword,
    now,
    examId,
  );

  return getExamById(examId);
}

export function deleteExam(examId: number): boolean {
  const db = openDatabase();
  const exams = listExams();
  if (exams.length <= 1) {
    throw new Error('至少保留一个考试活动，无法删除最后一个活动');
  }
  const target = exams.find((e) => e.id === examId);
  if (!target) return false;

  db.prepare('DELETE FROM exams WHERE id = ?').run(examId);
  if (target.is_default) {
    const nextDefault = exams.find((e) => e.id !== examId);
    if (nextDefault) {
      db.prepare('UPDATE exams SET is_default = 1 WHERE id = ?').run(nextDefault.id);
    }
  }
  return true;
}

// ---------- Questions ----------

export function listQuestionsByExam(examId: number): QuestionRecord[] {
  const db = openDatabase();
  const rows = db
    .prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY id ASC')
    .all(examId);
  return rows.map(mapQuestionRow);
}

export function getQuestionsByIds(ids: number[]): QuestionRecord[] {
  if (ids.length === 0) return [];
  const db = openDatabase();
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM questions WHERE id IN (${placeholders})`)
    .all(...ids);
  const byId = new Map<number, QuestionRecord>();
  for (const row of rows) {
    const q = mapQuestionRow(row);
    byId.set(q.id, q);
  }
  return ids.map((id) => byId.get(id)).filter((q): q is QuestionRecord => Boolean(q));
}

export function replaceExamQuestions(
  examId: number,
  questions: SeedQuestion[],
): number {
  const db = openDatabase();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM questions WHERE exam_id = ?').run(examId);
    const stmt = db.prepare(
      `INSERT INTO questions (exam_id, code, subject, type, prompt, options_json, answer_json, explanation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const q of questions) {
      stmt.run(
        examId,
        q.code,
        q.subject,
        q.type,
        q.prompt,
        JSON.stringify(q.options),
        JSON.stringify(normalizeKeys(q.answer)),
        q.explanation || '',
      );
    }
    db.prepare('UPDATE exams SET updated_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      examId,
    );
    db.exec('COMMIT');
    return questions.length;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ---------- Sessions ----------

export function getSessionById(sessionId: string): ExamSessionRecord | null {
  const db = openDatabase();
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  return row ? mapSessionRow(row) : null;
}

export function getLatestSessionForStudent(
  examId: number,
  studentId: string,
): ExamSessionRecord | null {
  const db = openDatabase();
  const row = db
    .prepare(
      'SELECT * FROM sessions WHERE exam_id = ? AND student_id = ? ORDER BY started_at DESC LIMIT 1',
    )
    .get(examId, studentId);
  return row ? mapSessionRow(row) : null;
}

export function listSessionsByExam(examId: number): ExamSessionRecord[] {
  const db = openDatabase();
  const rows = db
    .prepare('SELECT * FROM sessions WHERE exam_id = ? ORDER BY started_at DESC')
    .all(examId);
  return rows.map(mapSessionRow);
}

export function ensureSessionFreshness(session: ExamSessionRecord): ExamSessionRecord {
  if (session.status !== 'in_progress') return session;
  const now = Date.now();
  const expires = new Date(session.expires_at).getTime();
  if (Number.isFinite(expires) && now >= expires) {
    return finalizeSession(session.id, 'timeout_submitted') ?? session;
  }
  return session;
}

export function startOrResumeSession(input: {
  exam: ExamConfig;
  student_name: string;
  student_id: string;
  college: string;
  class_name: string;
  ip_address: string;
  user_agent: string;
}): { session: ExamSessionRecord; resumed: boolean; alreadyFinished: boolean } {
  const db = openDatabase();
  const cleanName = input.student_name.trim();
  const cleanId = input.student_id.trim();

  const existing = getLatestSessionForStudent(input.exam.id, cleanId);
  if (existing) {
    const fresh = ensureSessionFreshness(existing);
    if (fresh.status === 'in_progress') {
      return { session: fresh, resumed: true, alreadyFinished: false };
    }
    if (!input.exam.allow_retake) {
      return { session: fresh, resumed: false, alreadyFinished: true };
    }
  }

  if (!input.exam.is_open) {
    throw new Error('当前考场未开放或已暂停作答，请联系监考老师');
  }

  const pool = listQuestionsByExam(input.exam.id);
  if (pool.length === 0) {
    throw new Error('该考试活动题库为空，请联系管理员导入试题');
  }

  const drawn = drawRandomQuestions(pool, input.exam.draw_count);
  const questionIds = drawn.map((q) => q.id);

  const now = new Date();
  const expires = new Date(now.getTime() + input.exam.duration_minutes * 60 * 1000);
  const id = crypto.randomUUID();

  db.prepare(
    `INSERT INTO sessions (
      id, exam_id, student_name, student_id, college, class_name,
      status, question_ids_json, answers_json, flagged_ids_json,
      violations_json, violation_count, is_cheated, cheat_overridden,
      override_note, raw_score, effective_score, total_score,
      correct_count, total_questions, started_at, expires_at,
      submitted_at, duration_sec, ip_address, user_agent
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      'in_progress', ?, '{}', '[]',
      '[]', 0, 0, 0,
      '', 0, 0, 100,
      0, ?, ?, ?,
      NULL, NULL, ?, ?
    )`,
  ).run(
    id,
    input.exam.id,
    cleanName,
    cleanId,
    input.college.trim(),
    input.class_name.trim(),
    JSON.stringify(questionIds),
    questionIds.length,
    now.toISOString(),
    expires.toISOString(),
    input.ip_address,
    input.user_agent,
  );

  return { session: getSessionById(id)!, resumed: false, alreadyFinished: false };
}

export function saveSessionProgress(
  sessionId: string,
  patch: {
    answers?: Record<string, string[]>;
    flagged_ids?: number[];
  },
): ExamSessionRecord | null {
  const db = openDatabase();
  const current = getSessionById(sessionId);
  if (!current) return null;

  const fresh = ensureSessionFreshness(current);
  if (fresh.status !== 'in_progress') {
    return fresh;
  }

  const allowedSet = new Set(fresh.question_ids.map(String));
  let nextAnswers = fresh.answers;
  if (patch.answers && typeof patch.answers === 'object') {
    const merged: Record<string, string[]> = { ...fresh.answers };
    for (const [qid, val] of Object.entries(patch.answers)) {
      if (!allowedSet.has(qid)) continue;
      const norm = normalizeKeys(val);
      if (norm.length === 0) {
        delete merged[qid];
      } else {
        merged[qid] = norm;
      }
    }
    nextAnswers = merged;
  }

  let nextFlagged = fresh.flagged_ids;
  if (Array.isArray(patch.flagged_ids)) {
    nextFlagged = Array.from(
      new Set(
        patch.flagged_ids
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && allowedSet.has(String(n))),
      ),
    );
  }

  db.prepare(
    'UPDATE sessions SET answers_json = ?, flagged_ids_json = ? WHERE id = ? AND status = \'in_progress\'',
  ).run(JSON.stringify(nextAnswers), JSON.stringify(nextFlagged), sessionId);

  return getSessionById(sessionId);
}

export function recordSessionViolation(
  sessionId: string,
  event: {
    action: 'leave' | 'return';
    reason?: 'visibility_hidden' | 'window_blur' | 'fullscreen_exit';
  },
): { session: ExamSessionRecord | null; locked: boolean; deduplicated: boolean } {
  const db = openDatabase();
  const current = getSessionById(sessionId);
  if (!current) return { session: null, locked: false, deduplicated: false };

  const fresh = ensureSessionFreshness(current);
  if (fresh.status !== 'in_progress') {
    return {
      session: fresh,
      locked: fresh.status === 'cheated_submitted',
      deduplicated: false,
    };
  }

  const exam = getExamById(fresh.exam_id);
  const maxViolations = exam ? exam.max_violations : 3;
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const logs = [...fresh.violations];

  if (event.action === 'return') {
    if (logs.length > 0) {
      const last = logs[logs.length - 1];
      if (!last.returned_at) {
        const leftMs = new Date(last.left_at).getTime();
        const sec = Math.max(0, Math.round((nowMs - leftMs) / 100) / 10);
        logs[logs.length - 1] = {
          ...last,
          returned_at: nowIso,
          duration_sec: sec,
        };
        db.prepare('UPDATE sessions SET violations_json = ? WHERE id = ?').run(
          JSON.stringify(logs),
          sessionId,
        );
      }
    }
    return { session: getSessionById(sessionId), locked: false, deduplicated: false };
  }

  // Deduplicate rapid double-triggers (e.g. blur + visibilitychange within 800ms)
  if (logs.length > 0) {
    const last = logs[logs.length - 1];
    const lastMs = new Date(last.left_at).getTime();
    if (nowMs - lastMs < 850) {
      return { session: fresh, locked: false, deduplicated: true };
    }
  }

  const nextCount = fresh.violation_count + 1;
  logs.push({
    index: nextCount,
    reason: event.reason || 'visibility_hidden',
    left_at: nowIso,
    returned_at: null,
    duration_sec: null,
  });

  db.prepare(
    'UPDATE sessions SET violations_json = ?, violation_count = ? WHERE id = ? AND status = \'in_progress\'',
  ).run(JSON.stringify(logs), nextCount, sessionId);

  // Strictly > maxViolations (e.g. > 3, meaning 4th switch locks & submits as cheated)
  if (nextCount > maxViolations) {
    const finalized = finalizeSession(sessionId, 'cheated_submitted');
    return { session: finalized, locked: true, deduplicated: false };
  }

  return { session: getSessionById(sessionId), locked: false, deduplicated: false };
}

export function finalizeSession(
  sessionId: string,
  status: Exclude<SessionStatus, 'in_progress'>,
): ExamSessionRecord | null {
  const db = openDatabase();
  const current = getSessionById(sessionId);
  if (!current) return null;
  if (current.status !== 'in_progress') return current;

  const questions = getQuestionsByIds(current.question_ids);
  const graded = gradeQuestions(questions, current.answers);

  const isCheated = status === 'cheated_submitted';
  const effectiveScore = isCheated ? 0 : graded.rawScore;

  const now = new Date();
  const startedMs = new Date(current.started_at).getTime();
  const expiresMs = new Date(current.expires_at).getTime();
  const endMs = status === 'timeout_submitted' ? Math.min(now.getTime(), expiresMs) : now.getTime();
  const durationSec = Math.max(1, Math.round((endMs - startedMs) / 1000));

  db.prepare(
    `UPDATE sessions SET
      status = ?,
      is_cheated = ?,
      raw_score = ?,
      effective_score = ?,
      total_score = ?,
      correct_count = ?,
      total_questions = ?,
      submitted_at = ?,
      duration_sec = ?
     WHERE id = ? AND status = 'in_progress'`,
  ).run(
    status,
    isCheated ? 1 : 0,
    graded.rawScore,
    effectiveScore,
    graded.totalScore,
    graded.correctCount,
    graded.totalQuestions,
    now.toISOString(),
    durationSec,
    sessionId,
  );

  return getSessionById(sessionId);
}

export function overrideCheatingStatus(
  sessionId: string,
  restoreValid: boolean,
  note: string,
): ExamSessionRecord | null {
  const db = openDatabase();
  const current = getSessionById(sessionId);
  if (!current) return null;

  const nextEffective = restoreValid ? current.raw_score : 0;
  db.prepare(
    `UPDATE sessions SET
      cheat_overridden = ?,
      override_note = ?,
      effective_score = ?
     WHERE id = ?`,
  ).run(restoreValid ? 1 : 0, note.trim(), nextEffective, sessionId);

  return getSessionById(sessionId);
}

export function deleteSession(sessionId: string): boolean {
  const db = openDatabase();
  const res = db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  return res.changes > 0;
}

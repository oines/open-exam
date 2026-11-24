export type QuestionType = 'single' | 'multiple' | 'judge';

export interface QuestionOption {
  key: string;
  label: string;
}

export interface QuestionRecord {
  id: number;
  exam_id: number;
  code: string;
  subject: string;
  type: QuestionType;
  prompt: string;
  options: QuestionOption[];
  answer: string[]; // e.g. ['B'], ['A','C','D'], ['T'] or ['F']
  explanation: string;
}

export interface PublicQuestion {
  id: number;
  code: string;
  subject: string;
  type: QuestionType;
  prompt: string;
  options: QuestionOption[];
}

export interface ExamConfig {
  id: number;
  slug: string;
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
  access_password?: string;
  created_at: string;
  updated_at: string;
  question_count?: number;
  submission_count?: number;
}

export type SessionStatus =
  | 'in_progress'
  | 'submitted'
  | 'timeout_submitted'
  | 'cheated_submitted';

export interface ViolationLog {
  index: number;
  reason: 'visibility_hidden' | 'window_blur' | 'fullscreen_exit';
  left_at: string;
  returned_at?: string | null;
  duration_sec?: number | null;
}

export interface ExamSessionRecord {
  id: string;
  exam_id: number;
  student_name: string;
  student_id: string;
  college: string;
  class_name: string;
  status: SessionStatus;
  question_ids: number[];
  answers: Record<string, string[]>; // questionId -> selected keys
  flagged_ids: number[];
  violations: ViolationLog[];
  violation_count: number;
  is_cheated: boolean;
  cheat_overridden: boolean;
  override_note: string;
  raw_score: number;
  effective_score: number;
  total_score: number;
  correct_count: number;
  total_questions: number;
  started_at: string;
  expires_at: string;
  submitted_at: string | null;
  duration_sec: number | null;
  ip_address: string;
  user_agent: string;
}

export interface BreakdownStat {
  label: string;
  total: number;
  correct: number;
  accuracy: number;
}

export interface ReviewItem {
  question_id: number;
  code: string;
  subject: string;
  type: QuestionType;
  prompt: string;
  options: QuestionOption[];
  selected: string[];
  correct_answer: string[];
  is_correct: boolean;
  explanation: string;
}

export type CollegeDirectory = Record<string, string[]>;

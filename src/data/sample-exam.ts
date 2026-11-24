import type { QuestionOption, QuestionType } from '@/lib/types';

export interface SeedQuestion {
  code: string;
  subject: string;
  type: QuestionType;
  prompt: string;
  options: QuestionOption[];
  answer: string[];
  explanation: string;
}

export interface SeedExamConfig {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  draw_count: number;
  duration_minutes: number;
  pass_score: number;
  max_violations: number;
  show_explanations: boolean;
  allow_retake: boolean;
  require_college_class: boolean;
}

const JUDGE_OPTIONS: QuestionOption[] = [
  { key: 'T', label: '正确' },
  { key: 'F', label: '错误' },
];

export const DEFAULT_SAMPLE_EXAM: SeedExamConfig = {
  slug: 'demo-exam',
  title: '通用示例考试',
  subtitle: '计算机基础示例题库',
  description: '内置 6 道示例题（随机抽 5 题）。管理员可在 /admin 新建考试并导入正式题库 JSON。',
  draw_count: 5,
  duration_minutes: 15,
  pass_score: 60,
  max_violations: 3,
  show_explanations: true,
  allow_retake: false,
  require_college_class: true,
};

export const SAMPLE_QUESTIONS: SeedQuestion[] = [
  {
    code: '01',
    subject: '网络基础',
    type: 'single',
    prompt: 'HTTPS 协议默认使用的传输层端口号是？',
    options: [
      { key: 'A', label: '80' },
      { key: 'B', label: '443' },
      { key: 'C', label: '22' },
      { key: 'D', label: '53' },
    ],
    answer: ['B'],
    explanation: 'HTTP 默认使用 80 端口，HTTPS 默认使用 443 端口。',
  },
  {
    code: '02',
    subject: 'Linux 基础',
    type: 'single',
    prompt: '在 Linux 系统中，用于查看当前工作目录绝对路径的命令是？',
    options: [
      { key: 'A', label: 'cd' },
      { key: 'B', label: 'ls' },
      { key: 'C', label: 'pwd' },
      { key: 'D', label: 'mkdir' },
    ],
    answer: ['C'],
    explanation: 'pwd（print working directory）用于输出当前所在目录的绝对路径。',
  },
  {
    code: '03',
    subject: '网络基础',
    type: 'multiple',
    prompt: '以下哪些协议工作在 OSI 参考模型的应用层？',
    options: [
      { key: 'A', label: 'HTTP' },
      { key: 'B', label: 'DNS' },
      { key: 'C', label: 'ICMP' },
      { key: 'D', label: 'SMTP' },
    ],
    answer: ['A', 'B', 'D'],
    explanation: 'HTTP、DNS、SMTP 属于应用层协议；ICMP 工作在网络层。',
  },
  {
    code: '04',
    subject: '软件工程',
    type: 'multiple',
    prompt: '以下哪些属于常见的版本控制操作？',
    options: [
      { key: 'A', label: '创建分支（branch）' },
      { key: 'B', label: '提交变更（commit）' },
      { key: 'C', label: '合并分支（merge）' },
      { key: 'D', label: '磁盘格式化（format）' },
    ],
    answer: ['A', 'B', 'C'],
    explanation: 'branch、commit、merge 均为 Git 等版本控制系统中的基础操作。',
  },
  {
    code: '05',
    subject: '网络基础',
    type: 'judge',
    prompt: 'TCP 是面向连接的可靠传输层协议。',
    options: JUDGE_OPTIONS,
    answer: ['T'],
    explanation: 'TCP 通过三次握手建立连接，并提供确认重传、流量控制与拥塞控制机制。',
  },
  {
    code: '06',
    subject: 'Linux 基础',
    type: 'judge',
    prompt: '在 Linux 中，使用 rm -rf 删除的文件默认会先移入回收站。',
    options: JUDGE_OPTIONS,
    answer: ['F'],
    explanation: 'rm 命令直接解除文件链接，不会经过图形界面的回收站，执行前需确认路径。',
  },
];

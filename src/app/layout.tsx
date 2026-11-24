import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '在线考试系统',
  description: '在线随机抽题考试与成绩统计系统',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

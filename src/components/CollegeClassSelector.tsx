'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import type { CollegeDirectory } from '@/lib/types';

interface CollegeClassSelectorProps {
  directory: CollegeDirectory;
  college: string;
  classNameValue: string;
  onChangeCollege: (val: string) => void;
  onChangeClass: (val: string) => void;
  disabled?: boolean;
}

export function CollegeClassSelector({
  directory,
  college,
  classNameValue,
  onChangeCollege,
  onChangeClass,
  disabled,
}: CollegeClassSelectorProps) {
  const colleges = useMemo(() => Object.keys(directory), [directory]);
  const classes = useMemo(() => (college ? directory[college] ?? [] : []), [directory, college]);

  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const [classQuery, setClassQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const filteredClasses = useMemo(() => {
    const q = classQuery.trim().toLowerCase();
    if (!q) return classes;
    return classes.filter((c) => c.toLowerCase().includes(q));
  }, [classes, classQuery]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setClassDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    if (classDropdownOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 20);
    } else {
      setClassQuery('');
    }
  }, [classDropdownOpen]);

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[#57534a]">
          学院 <span className="text-[#b4281e]">*</span>
        </label>
        <div className="relative">
          <select
            value={college}
            disabled={disabled}
            onChange={(e) => {
              onChangeCollege(e.target.value);
              onChangeClass('');
              setClassQuery('');
            }}
            className="w-full appearance-none rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] px-3 py-2.5 pr-9 text-sm text-[#1a1917] transition-colors focus:border-[#1b4965] focus:outline-none disabled:cursor-not-allowed disabled:bg-[#eeeae1]"
          >
            <option value="">请选择学院</option>
            {colleges.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#57534a]" />
        </div>
      </div>

      <div ref={wrapperRef} className="relative">
        <label className="mb-1.5 block text-xs font-medium text-[#57534a]">
          班级 <span className="text-[#b4281e]">*</span>
        </label>

        <button
          type="button"
          disabled={disabled || !college}
          onClick={() => setClassDropdownOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-[3px] border border-[#bfb7a6] bg-[#fdfcf9] px-3 py-2.5 text-left text-sm transition-colors hover:border-[#1a1917] focus:border-[#1b4965] focus:outline-none disabled:cursor-not-allowed disabled:bg-[#eeeae1] disabled:text-[#8c867a]"
        >
          <span className={classNameValue ? 'text-[#1a1917]' : 'text-[#8c867a]'}>
            {classNameValue || (college ? '请选择班级' : '请先选择学院')}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[#57534a] transition-transform ${
              classDropdownOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {classDropdownOpen && college && (
          <div className="absolute left-0 right-0 z-40 mt-1 overflow-hidden rounded-[3px] border border-[#1a1917] bg-[#fdfcf9] shadow-[0_8px_24px_rgba(26,25,23,0.12)]">
            <div className="flex items-center gap-2 border-b border-[#dcd5c7] bg-[#f5f3ee] px-2.5 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-[#57534a]" />
              <input
                ref={searchInputRef}
                type="text"
                value={classQuery}
                onChange={(e) => setClassQuery(e.target.value)}
                placeholder="搜索班级..."
                className="w-full bg-transparent text-xs text-[#1a1917] placeholder:text-[#8c867a] focus:outline-none"
              />
              {classQuery && (
                <button
                  type="button"
                  onClick={() => setClassQuery('')}
                  className="text-[#8c867a] hover:text-[#1a1917]"
                  aria-label="清除"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="max-h-60 overflow-y-auto py-1">
              {filteredClasses.length === 0 ? (
                <div className="px-3 py-5 text-center text-xs text-[#8c867a]">
                  没有匹配的班级
                </div>
              ) : (
                filteredClasses.map((cls) => {
                  const active = cls === classNameValue;
                  return (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => {
                        onChangeClass(cls);
                        setClassDropdownOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                        active
                          ? 'bg-[#eaf1f5] font-medium text-[#1b4965]'
                          : 'text-[#1a1917] hover:bg-[#f5f3ee]'
                      }`}
                    >
                      <span>{cls}</span>
                      {active && <span className="text-[11px] text-[#1b4965]">已选</span>}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

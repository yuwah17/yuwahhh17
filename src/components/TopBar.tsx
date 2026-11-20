import React, { useState } from 'react';
import { Shield } from 'lucide-react';
import { AppSection } from '../types/chat';

interface TopBarProps {
  activeSection: AppSection;
  onSelectSection: (section: AppSection) => void;
  onOpenNewRoom: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeSection,
  onSelectSection,
  onOpenNewRoom,
}) => {
  const [logoError, setLogoError] = useState(false);

  const navItems: { id: AppSection; label: string }[] = [
    { id: 'vault', label: 'Ruang Privat' },
    { id: 'google-chat', label: 'Google Chat' },
    { id: 'security', label: 'Kunci & Verifikasi' },
    { id: 'guide', label: 'Arsitektur Privasi' },
  ];

  return (
    <header className="h-14 shrink-0 flex items-center justify-between gap-8 px-5 lg:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d121b]">
      {/* Zone 1: Single-line brand wordmark */}
      <a
        href="#vault"
        onClick={(e) => {
          e.preventDefault();
          onSelectSection('vault');
        }}
        className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 rounded"
      >
        {!logoError ? (
          <img
            src="/assets/aistudio/Glossy_Blue_Yuhu_Calling_Icon_da168689.png"
            alt="Logo Aplikasi"
            onError={() => setLogoError(true)}
            className="w-7 h-7 rounded-full object-cover shrink-0"
          />
        ) : (
          <Shield className="w-5 h-5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
        )}
        <span className="font-display">SandiChat</span>
      </a>

      {/* Zone 2: Concise single-line navigation links */}
      <nav
        aria-label="Navigasi utama"
        className="hidden md:flex items-center gap-6 text-sm font-medium"
      >
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                isActive
                  ? 'border-teal-700 dark:border-teal-400 text-slate-950 dark:text-white'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Single primary action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onOpenNewRoom}
          className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0d121b]"
        >
          Ruang Baru
        </button>
      </div>
    </header>
  );
};

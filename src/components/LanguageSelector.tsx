import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';

const LANGUAGES = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'English',  flag: '🇬🇧' },
  { code: 'es', label: 'Español',  flag: '🇪🇸' },
  { code: 'ru', label: 'Русский',  flag: '🇷🇺' },
] as const;

interface LanguageSelectorProps {
  /** true = trigger shows flag only (no label), used on auth page */
  compact?: boolean;
}

export function LanguageSelector({ compact = false }: LanguageSelectorProps) {
  const { i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? i18n.language.slice(0, 2);
  const currentLang = LANGUAGES.find(l => l.code === current) ?? LANGUAGES[1];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 transition text-sm"
      >
        <span>{currentLang.flag}</span>
        {!compact && (
          <span className="text-neutral-300 font-medium">{currentLang.label}</span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-36 bg-neutral-800 border border-neutral-700 rounded-xl shadow-xl overflow-hidden z-50">
          {LANGUAGES.map(({ code, flag, label }) => (
            <button
              key={code}
              onClick={() => { i18n.changeLanguage(code); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition ${
                current === code
                  ? 'bg-orange-500/20 text-orange-400'
                  : 'text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              <span>{flag}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

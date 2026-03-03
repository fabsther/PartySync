import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'fr', label: 'FR', flag: '🇫🇷' },
  { code: 'en', label: 'EN', flag: '🇬🇧' },
  { code: 'es', label: 'ES', flag: '🇪🇸' },
  { code: 'ru', label: 'RU', flag: '🇷🇺' },
] as const;

interface LanguageSelectorProps {
  compact?: boolean;
}

export function LanguageSelector({ compact = false }: LanguageSelectorProps) {
  const { i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? i18n.language.slice(0, 2);

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {LANGUAGES.map(({ code, flag, label }) => (
          <button
            key={code}
            onClick={() => i18n.changeLanguage(code)}
            className={`px-2 py-1 rounded-lg text-xs font-medium transition ${
              current === code
                ? 'bg-orange-500 text-white'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
            title={label}
          >
            {flag}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {LANGUAGES.map(({ code, flag, label }) => (
        <button
          key={code}
          onClick={() => i18n.changeLanguage(code)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
            current === code
              ? 'bg-orange-500 text-white'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800 border border-neutral-700'
          }`}
        >
          <span>{flag}</span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

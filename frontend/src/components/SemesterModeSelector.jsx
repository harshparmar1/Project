import { motion } from 'framer-motion';
import { CalendarRange } from 'lucide-react';
import { formatSemesterMode, normalizeSemesterMode } from '../constants/semesterMode';

const SemesterModeSelector = ({ value, onChange, compact = false }) => {
  const mode = normalizeSemesterMode(value);

  return (
    <div className={`flex items-center gap-3 ${compact ? '' : 'glass p-2 rounded-2xl'}`}>
      {!compact && (
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 shrink-0">
          <CalendarRange className="w-4 h-4" />
          Semester Mode
        </span>
      )}
      <div className="flex bg-slate-200 dark:bg-slate-900 rounded-xl p-1">
        {['odd', 'even'].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={`relative px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              mode === m
                ? 'text-white'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {mode === m && (
              <motion.div
                layoutId="semesterModeToggle"
                className={`absolute inset-0 rounded-lg ${
                  m === 'odd' ? 'bg-indigo-600' : 'bg-teal-600'
                }`}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">{m === 'odd' ? 'Odd' : 'Even'}</span>
          </button>
        ))}
      </div>
      {!compact && (
        <span className="text-xs text-slate-500 hidden sm:inline">{formatSemesterMode(mode)}</span>
      )}
    </div>
  );
};

export default SemesterModeSelector;

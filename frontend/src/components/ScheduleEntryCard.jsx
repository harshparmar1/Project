import { MapPin, AlertTriangle, User } from 'lucide-react';
import { TYPE_STYLES } from '../constants/timetable';
import { formatSemesterLabel } from '../constants/semesterMode';

const ScheduleEntryCard = ({ entry, compact = false }) => {
  const type = entry.type || 'Lecture';
  const isClash = entry.is_clash;
  const styles = isClash ? TYPE_STYLES.Clash : TYPE_STYLES[type] || TYPE_STYLES.Lecture;

  return (
    <div
      className={`rounded-xl border p-2.5 flex flex-col gap-1.5 ${styles.card} ${
        compact ? 'text-[10px]' : 'text-xs'
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <h4 className={`font-bold leading-tight ${styles.title}`}>{entry.subject}</h4>
        {isClash && <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
      </div>
      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full w-fit ${styles.badge}`}>
        {type}
      </span>
      <div className="text-[10px] text-slate-500 space-y-0.5">
        <p>
          {entry.program} · {formatSemesterLabel(entry.semester)} · Sec {entry.section}
          {type === 'lab' && entry.batch ? ` · Batch ${entry.batch}` : ''}
        </p>
        {entry.faculty && entry.faculty !== '-' && (
          <p className="flex items-center gap-1 font-semibold text-slate-800">
            <User className="w-2.5 h-2.5 shrink-0 text-primary-600" />
            {entry.faculty}
          </p>
        )}
        <p className="flex items-center gap-1">
          <MapPin className="w-2.5 h-2.5 shrink-0" />
          Room {entry.room}
        </p>
      </div>
    </div>
  );
};

export default ScheduleEntryCard;

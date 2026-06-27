import { MapPin, Layers, AlertTriangle, FlaskConical } from 'lucide-react';
import { formatElectiveLabel } from '../utils/timetableDisplay';

const TimetableCellItem = ({ item, hasRoomConflict = false }) => {
  if (item.type === 'special' || item.subject === 'TDPCL') {
    return (
      <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 text-center min-h-[72px] flex items-center justify-center">
        <span className="text-xs font-bold text-amber-700 uppercase">TDPCL</span>
      </div>
    );
  }

  if (item.type === 'free_slot' || item.subject === 'FREE SLOT') {
    return (
      <div className="p-3 rounded-xl border border-dashed border-indigo-300 bg-indigo-50 text-center min-h-[72px] flex items-center justify-center">
        <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">
          Free Slot
        </span>
      </div>
    );
  }

  if (item.type === 'elective') {
    const label = item.label || formatElectiveLabel(item.subjects || []);
    return (
      <div
        className={`p-3 rounded-xl border flex flex-col gap-2 ${
          hasRoomConflict
            ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-300'
            : 'bg-violet-50 border-violet-300'
        }`}
      >
        <div className="flex items-start gap-1.5">
          <Layers className="w-3.5 h-3.5 text-violet-600 shrink-0 mt-0.5" />
          <p className="font-bold text-xs text-violet-800 leading-snug break-words">
            {label}
          </p>
        </div>
        {hasRoomConflict && (
          <p className="text-[9px] text-rose-600 font-semibold flex items-center gap-0.5">
            <AlertTriangle className="w-3 h-3" />
            Room clash
          </p>
        )}
        <span className="text-[9px] font-bold uppercase text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded w-fit">
          Elective
        </span>
        {item.section && (
          <p className="text-[9px] text-slate-600 font-medium">Sec {item.section}</p>
        )}
      </div>
    );
  }

  if (item.type === 'lab') {
    return (
      <div className="p-3 rounded-xl border border-cyan-300 bg-cyan-50 flex flex-col gap-1.5 ring-1 ring-cyan-200/60">
        <div className="flex items-center gap-1.5">
          <FlaskConical className="w-3.5 h-3.5 text-cyan-700 shrink-0" />
          <h4 className="font-bold text-xs text-cyan-800 leading-tight">{item.subject}</h4>
        </div>
        <span className="text-[9px] font-bold uppercase text-cyan-700 bg-cyan-100 px-1.5 py-0.5 rounded w-fit">
          Lab
        </span>
        {item.section && (
          <p className="text-[9px] text-slate-600">Sec {item.section}</p>
        )}
        <p className="text-[10px] font-bold text-cyan-800">Batch: {item.batch}</p>
        <p className="flex items-center gap-1 text-[10px] font-semibold text-slate-700">
          <MapPin className="w-2.5 h-2.5" />
          {item.room}
        </p>
      </div>
    );
  }

  // Lecture (section-wise, no batch) — faculty shown only on Faculty Timetable page
  return (
    <div className="p-3 rounded-xl border border-sky-300 bg-sky-50 flex flex-col gap-1.5">
      <h4 className="font-bold text-xs text-sky-900 leading-tight">{item.subject}</h4>
      {item.section && (
        <p className="text-[9px] text-slate-600 font-medium">Sec {item.section}</p>
      )}
      <p className="flex items-center gap-1 text-[10px] font-semibold text-slate-700">
        <MapPin className="w-2.5 h-2.5 shrink-0" />
        Room {item.room}
      </p>
    </div>
  );
};

export default TimetableCellItem;

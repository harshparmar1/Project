import React, { useState, useEffect, useMemo } from 'react';
import { getTimetable } from '../services/api';
import {
  Filter,
  Calendar as CalendarIcon,
  Clock,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';

import { DAYS, SLOTS, detectElectiveRoomConflicts } from '../constants/timetable';
import SemesterModeSelector from '../components/SemesterModeSelector';
import useSemesterMode from '../hooks/useSemesterMode';
import { formatSemesterMode, formatSemesterLabel } from '../constants/semesterMode';
import { getDisplayItemsForCell } from '../utils/timetableDisplay';
import TimetableCellItem from '../components/TimetableCellItem';

const TimetableView = () => {
  const {
    semesterMode,
    setSemesterMode,
    program,
    setProgram,
    semester,
    setSemester,
    semesters,
  } = useSemesterMode('UG');
  const [timetableData, setTimetableData] = useState({ entries: [], display: [] });
  const [loading, setLoading] = useState(false);

  const fetchTimetable = async () => {
    setLoading(true);
    try {
      const res = await getTimetable(program, semester, undefined, undefined, semesterMode);
      const data = res.data;
      if (Array.isArray(data)) {
        setTimetableData({ entries: data, display: [] });
      } else {
        setTimetableData({ entries: data.entries || [], display: data.display || [] });
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTimetable();
  }, [program, semester, semesterMode]);

  const flatEntries = timetableData.entries;
  const roomConflicts = useMemo(() => detectElectiveRoomConflicts(flatEntries), [flatEntries]);

  const electiveSlotHasConflict = (item) => {
    if (item.type !== 'elective' || !item.subjects?.length) return false;
    return item.subjects.some((s) =>
      roomConflicts.some(
        (c) => c.day === item.day && c.slot === item.slot && c.room === s.room
      )
    );
  };

  const simultaneousElectives = useMemo(() => {
    const items = timetableData.display.filter((d) => d.type === 'elective');
    const bySlot = {};
    items.forEach((item) => {
      const key = `${item.day}|${item.slot}`;
      if (!bySlot[key]) bySlot[key] = [];
      bySlot[key].push(item);
    });
    return Object.entries(bySlot).filter(([, list]) =>
      list.some((item) => (item.subjects?.length || 0) > 1)
    );
  }, [timetableData.display]);

  const getCellItems = (day, slotId) => {
    if (day === 'Wednesday' && slotId === 7) {
      return [{ type: 'special', subject: 'TDPCL', day, slot: slotId }];
    }
    return getDisplayItemsForCell(timetableData, day, slotId);
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3 text-slate-900">
            <CalendarIcon className="w-8 h-8 text-primary-600" />
            Weekly Schedule
          </h2>
          <p className="text-slate-600 mt-1">
            {formatSemesterMode(semesterMode)} · {program} {formatSemesterLabel(semester)} · All
            sections (faculty names on Faculty Timetable only)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 p-2 rounded-2xl shadow-sm">
          <SemesterModeSelector value={semesterMode} onChange={setSemesterMode} compact />
          <div className="flex bg-slate-100 rounded-xl p-1">
            {['UG', 'PG'].map((p) => (
              <button
                key={p}
                onClick={() => setProgram(p)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  program === p
                    ? 'bg-primary-600 text-white shadow-md'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <select
            value={semester}
            onChange={(e) => setSemester(parseInt(e.target.value))}
            className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-800"
          >
            {semesters.map((s) => (
              <option key={s} value={s}>
                {formatSemesterLabel(s)}
              </option>
            ))}
          </select>
          <button
            onClick={fetchTimetable}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
            title="Refresh"
          >
            <Filter className="w-5 h-5 text-slate-500" />
          </button>
        </div>
      </header>

      {roomConflicts.length > 0 && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <div>
            <p className="font-semibold text-rose-800">Elective room conflict detected</p>
            <p className="text-sm text-rose-700 mt-1">
              Room already occupied for this time slot.
            </p>
          </div>
        </div>
      )}

      {simultaneousElectives.length > 0 && roomConflicts.length === 0 && (
        <div className="bg-white border border-violet-200 rounded-2xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-violet-700 flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4" />
            Simultaneous electives in one slot
          </h3>
          <div className="flex flex-wrap gap-2">
            {simultaneousElectives.map(([key, list]) => {
              const [day, slot] = key.split('|');
              return (
                <div
                  key={key}
                  className="text-xs bg-violet-50 border border-violet-200 px-3 py-2 rounded-lg max-w-md"
                >
                  <span className="font-bold text-violet-800 block mb-1">
                    {day} · Slot {slot}
                  </span>
                  {list.map((item) => (
                    <p key={item.section} className="text-violet-700 break-words">
                      Sec {item.section}: {item.label}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-3xl border border-slate-200 shadow-xl bg-white">
        {loading && (
          <div className="p-8 text-center text-slate-500">Loading timetable...</div>
        )}
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <th className="p-6 border-b border-r border-slate-200 text-left text-xs font-bold uppercase tracking-wider text-slate-600">
                Day / Slot
              </th>
              {SLOTS.map((slot, i) => (
                <th
                  key={i}
                  className={`p-6 border-b border-r border-slate-200 text-center min-w-[180px] ${
                    slot.isBreak ? 'bg-slate-50' : ''
                  }`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-sm font-bold text-slate-800">
                      {slot.isBreak ? 'BREAK' : `Slot ${slot.id}`}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {slot.time}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day) => (
              <tr key={day}>
                <td className="p-6 border-b border-r border-slate-200 bg-slate-50 font-bold text-slate-700">
                  {day}
                </td>
                {SLOTS.map((slot, j) => {
                  if (slot.isBreak)
                    return (
                      <td key={j} className="border-b border-r border-slate-200 bg-slate-50" />
                    );

                  if (slot.id === 7 && day !== 'Saturday' && day !== 'Wednesday') {
                    return (
                      <td
                        key={j}
                        className="p-3 border-b border-r border-slate-200 bg-amber-50"
                      >
                        <div className="min-h-[88px] flex items-center justify-center border border-dashed border-amber-300 rounded-2xl">
                          <span className="text-[10px] text-amber-700 uppercase font-bold">
                            Lunch
                          </span>
                        </div>
                      </td>
                    );
                  }

                  if (day === 'Saturday' && (slot.id === 7 || slot.id === 8)) {
                    return (
                      <td key={j} className="p-3 border-b border-r border-slate-200 bg-slate-100">
                        <div className="min-h-[88px] flex items-center justify-center border border-dashed border-slate-300 rounded-2xl">
                          <span className="text-[10px] text-slate-500 uppercase font-bold">
                            Closed
                          </span>
                        </div>
                      </td>
                    );
                  }

                  const items = getCellItems(day, slot.id);

                  return (
                    <td
                      key={j}
                      className={`p-2 border-b border-r border-slate-200 align-top ${
                        items.length > 0 ? 'bg-sky-50/40' : ''
                      }`}
                    >
                      <AnimatePresence mode="wait">
                        {items.length > 0 ? (
                          <div className="space-y-2 min-h-[88px]">
                            {items.map((item, idx) => (
                              <TimetableCellItem
                                key={`${item.type}-${item.section}-${item.subject || item.label}-${item.batch || ''}-${idx}`}
                                item={item}
                                hasRoomConflict={electiveSlotHasConflict(item)}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="min-h-[88px] flex items-center justify-center border border-dashed border-slate-200 rounded-2xl">
                            <span className="text-[10px] text-slate-400 uppercase font-bold">
                              Free
                            </span>
                          </div>
                        )}
                      </AnimatePresence>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TimetableView;

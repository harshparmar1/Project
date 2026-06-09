import React, { useState, useEffect, useMemo } from 'react';
import {
  getFaculty,
  getFacultyTimetable,
} from '../services/api';
import { exportFacultyTimetablePdf } from '../utils/exportFacultyPdf';
import ScheduleEntryCard from '../components/ScheduleEntryCard';
import {
  DAYS,
  SLOTS,
  getTodayName,
  TYPE_STYLES,
} from '../constants/timetable';
import {
  User,
  Search,
  Download,
  AlertTriangle,
  Clock,
  CalendarDays,
  ChevronDown,
  Filter,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SemesterModeSelector from '../components/SemesterModeSelector';

const FacultyTimetable = () => {
  const [semesterMode, setSemesterMode] = useState(() => {
    return localStorage.getItem('semesterMode') || 'odd';
  });
  
  const [facultyList, setFacultyList] = useState([]);
  const [selectedFaculty, setSelectedFaculty] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Client-side Filter States
  const [filterProgram, setFilterProgram] = useState('All');
  const [filterSemester, setFilterSemester] = useState('All');
  const [filterSection, setFilterSection] = useState('All');
  const [filterSubject, setFilterSubject] = useState('');

  // Fetch faculty list on load
  useEffect(() => {
    getFaculty()
      .then((res) => {
        const names = res.data.map((f) => f.name).filter(Boolean).sort();
        setFacultyList(names);
        if (names.length > 0 && !selectedFaculty) {
          setSelectedFaculty(names[0]);
        }
      })
      .catch(console.error);
  }, []);

  // Fetch faculty timetable (unified UG and PG)
  useEffect(() => {
    if (!selectedFaculty) return;
    setLoading(true);
    setError(null);
    // Do not pass program and semester, fetching all entries for this faculty
    getFacultyTimetable(selectedFaculty, semesterMode, undefined, undefined)
      .then((res) => setData(res.data))
      .catch((err) => {
        setError(err.response?.data?.detail || 'Failed to load faculty timetable');
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [selectedFaculty, semesterMode]);

  const filteredFaculty = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return facultyList;
    return facultyList.filter((name) => name.toLowerCase().includes(q));
  }, [facultyList, search]);

  useEffect(() => {
    if (filteredFaculty.length > 0 && !filteredFaculty.includes(selectedFaculty)) {
      setSelectedFaculty(filteredFaculty[0]);
    }
  }, [filteredFaculty, selectedFaculty]);

  // Client-side filtering logic
  const filteredEntries = useMemo(() => {
    if (!data?.entries) return [];
    return data.entries.filter((entry) => {
      // 1. Program filter
      if (filterProgram !== 'All' && entry.program !== filterProgram) {
        return false;
      }
      // 2. Semester filter
      if (filterSemester !== 'All' && entry.semester !== parseInt(filterSemester)) {
        return false;
      }
      // 3. Section filter
      if (filterSection !== 'All' && entry.section !== filterSection) {
        return false;
      }
      // 4. Subject filter
      if (
        filterSubject.trim() &&
        !entry.subject.toLowerCase().includes(filterSubject.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [data?.entries, filterProgram, filterSemester, filterSection, filterSubject]);

  // Client-side grouping logic for grid view
  const clientGrouped = useMemo(() => {
    const res = {};
    DAYS.forEach((day) => {
      res[day] = {};
      SLOTS.filter((s) => !s.isBreak).forEach((slot) => {
        res[day][String(slot.id)] = [];
      });
    });

    filteredEntries.forEach((entry) => {
      const day = entry.day;
      const slotId = String(entry.slot);
      if (res[day] && res[day][slotId]) {
        res[day][slotId].push(entry);
      }
    });
    return res;
  }, [filteredEntries]);

  const todayName = data?.today || getTodayName();
  const clientTodaySchedule = useMemo(() => {
    return filteredEntries.filter((entry) => entry.day === todayName);
  }, [filteredEntries, todayName]);

  const clashes = data?.clashes || [];

  const isClashCell = (day, slotId) =>
    clashes.some((c) => c.day === day && c.slot === slotId);

  const handleExportPdf = () => {
    if (!data || !selectedFaculty) return;
    exportFacultyTimetablePdf(selectedFaculty, clientGrouped, clashes, {
      semesterMode,
      program: filterProgram !== 'All' ? filterProgram : 'All Programs',
      semester: filterSemester !== 'All' ? `Sem ${filterSemester}` : 'All Semesters',
    });
  };

  const handleSemesterModeChange = (mode) => {
    localStorage.setItem('semesterMode', mode);
    setSemesterMode(mode);
    setFilterSemester('All'); // Reset semester filter since active semesters change
  };

  const semesterOptions = semesterMode === 'odd' ? ['1', '3', '5'] : ['2', '4', '6'];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <User className="w-8 h-8 text-primary-500" />
            Faculty Timetable
          </h2>
          <p className="text-slate-500 mt-1">
            Consolidated weekly timetable for both UG and PG courses.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SemesterModeSelector value={semesterMode} onChange={handleSemesterModeChange} compact />
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search faculty..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-sm w-48 focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          <div className="relative">
            <select
              value={selectedFaculty}
              onChange={(e) => setSelectedFaculty(e.target.value)}
              className="appearance-none pl-4 pr-10 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-sm font-medium min-w-[200px] focus:ring-2 focus:ring-primary-500 outline-none"
            >
              {filteredFaculty.length === 0 ? (
                <option value="">No faculty found</option>
              ) : (
                filteredFaculty.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))
              )}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          <button
            onClick={handleExportPdf}
            disabled={!data || loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium disabled:opacity-50 transition-colors shadow-md"
          >
            <Download className="w-4 h-4" />
            Export PDF
          </button>
        </div>
      </header>

      {/* Unified Filtering Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
          <Filter className="w-4 h-4 text-primary-500" />
          Timetable Filters
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Program Filter */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-500">Program</span>
            <select
              value={filterProgram}
              onChange={(e) => setFilterProgram(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 text-slate-800"
            >
              <option value="All">All Programs</option>
              <option value="UG">UG</option>
              <option value="PG">PG</option>
            </select>
          </div>

          {/* Semester Filter */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-500">Semester</span>
            <select
              value={filterSemester}
              onChange={(e) => setFilterSemester(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 text-slate-800"
            >
              <option value="All">All Semesters</option>
              {semesterOptions.map((sem) => (
                <option key={sem} value={sem}>Semester {sem}</option>
              ))}
            </select>
          </div>

          {/* Section Filter */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-500">Section</span>
            <select
              value={filterSection}
              onChange={(e) => setFilterSection(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 text-slate-800"
            >
              <option value="All">All Sections</option>
              <option value="A">Section A</option>
              <option value="B">Section B</option>
            </select>
          </div>

          {/* Subject Search Filter */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-500">Subject</span>
            <input
              type="text"
              placeholder="Filter by subject..."
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 text-slate-800 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {['Lecture', 'Lab', 'Elective'].map((type) => (
          <span
            key={type}
            className={`px-3 py-1.5 rounded-full font-bold uppercase ${TYPE_STYLES[type].badge}`}
          >
            {type}
          </span>
        ))}
        <span className={`px-3 py-1.5 rounded-full font-bold uppercase ${TYPE_STYLES.Clash.badge}`}>
          Clash
        </span>
      </div>

      {data?.has_clashes && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-rose-700 dark:text-rose-300">
              Schedule clash detected for {selectedFaculty}
            </p>
            <p className="text-sm text-rose-600/80 dark:text-rose-400/80 mt-1">
              This faculty is assigned to multiple conflicting classes at the same time.
              Clashing slots are highlighted in red below.
            </p>
            <ul className="mt-2 text-sm text-rose-600 dark:text-rose-400 space-y-1">
              {clashes.map((c, i) => (
                <li key={i}>
                  {c.day} · Slot {c.slot}:{' '}
                  {c.entries.map((e) => e.subject).join(' vs ')}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}

      {/* Today's schedule */}
      <section className="glass-card p-5 border border-primary-500/20 bg-white border border-slate-200 rounded-3xl shadow-sm">
        <h3 className="text-lg font-bold flex items-center gap-2 text-primary-600 dark:text-primary-400 mb-4">
          <CalendarDays className="w-5 h-5" />
          Today&apos;s Schedule — {todayName}
        </h3>
        {loading ? (
          <p className="text-slate-500 text-sm">Loading...</p>
        ) : clientTodaySchedule.length === 0 ? (
          <p className="text-slate-500 text-sm">
            {todayName === 'Sunday'
              ? 'No college schedule on Sunday.'
              : 'No classes scheduled for today.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {clientTodaySchedule
              .sort((a, b) => a.slot - b.slot)
              .map((entry, idx) => (
                <div key={idx} className="flex gap-3 items-start">
                  <div className="shrink-0 w-14 text-center py-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                    <span className="text-[10px] font-bold text-slate-500">Slot</span>
                    <p className="text-sm font-bold">{entry.slot}</p>
                  </div>
                  <ScheduleEntryCard entry={entry} compact />
                </div>
              ))}
          </div>
        )}
      </section>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 text-rose-600 border border-rose-500/20">
          {error}
        </div>
      )}

      {/* Weekly grid */}
      <div className="overflow-x-auto rounded-3xl border border-slate-200 dark:border-white/5 shadow-xl bg-white dark:bg-slate-900/50">
        {loading && (
          <div className="p-12 text-center text-slate-500">Loading faculty timetable...</div>
        )}
        {!loading && data && (
          <table className="w-full border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-900/80">
                <th className="p-4 border-b border-r border-slate-200 dark:border-white/5 text-left text-xs font-bold uppercase text-slate-500 w-24">
                  Day
                </th>
                {SLOTS.filter((s) => !s.isBreak).map((slot) => (
                  <th
                    key={slot.id}
                    className="p-3 border-b border-r border-slate-200 dark:border-white/5 text-center min-w-[130px]"
                  >
                    <span className="text-xs font-bold">Slot {slot.id}</span>
                    <span className="block text-[9px] text-slate-500 font-medium mt-0.5 flex items-center justify-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {slot.time}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day) => (
                <tr key={day}>
                  <td className="p-4 border-b border-r border-slate-200 dark:border-white/5 font-bold text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/30">
                    {day}
                  </td>
                  {SLOTS.filter((s) => !s.isBreak).map((slot) => {
                    const entries = clientGrouped[day]?.[String(slot.id)] || [];
                    const clash = isClashCell(day, slot.id);

                    if (day === 'Wednesday' && slot.id === 7) {
                      return (
                        <td
                          key={slot.id}
                          className="p-2 border-b border-r border-slate-200 dark:border-white/5 bg-amber-50 dark:bg-amber-900/10"
                        >
                          <div className="min-h-[72px] flex items-center justify-center text-[10px] font-bold text-amber-600 uppercase">
                            TDPCL
                          </div>
                        </td>
                      );
                    }

                    if (
                      slot.id === 7 &&
                      day !== 'Saturday' &&
                      day !== 'Wednesday'
                    ) {
                      return (
                        <td
                          key={slot.id}
                          className="p-2 border-b border-r bg-amber-50/50 dark:bg-amber-900/5"
                        >
                          <div className="min-h-[72px] flex items-center justify-center text-[10px] text-amber-600 font-bold uppercase">
                            Lunch
                          </div>
                        </td>
                      );
                    }

                    if (day === 'Saturday' && (slot.id === 7 || slot.id === 8)) {
                      return (
                        <td key={slot.id} className="p-2 border-b border-r bg-slate-100 dark:bg-slate-800/30">
                          <div className="min-h-[72px] flex items-center justify-center text-[10px] text-slate-400 font-bold uppercase">
                            Closed
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td
                        key={slot.id}
                        className={`p-2 border-b border-r align-top ${
                          clash ? 'bg-rose-500/5' : ''
                        }`}
                      >
                        <AnimatePresence mode="wait">
                          {entries.length > 0 ? (
                            <div className="space-y-2 min-h-[72px]">
                              {entries.map((entry, idx) => (
                                <ScheduleEntryCard key={idx} entry={entry} compact />
                              ))}
                            </div>
                          ) : (
                            <div className="min-h-[72px] flex items-center justify-center border border-dashed border-slate-200 dark:border-white/10 rounded-xl">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
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
        )}
      </div>
    </div>
  );
};

export default FacultyTimetable;

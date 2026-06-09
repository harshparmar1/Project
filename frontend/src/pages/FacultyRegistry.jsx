import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { addFaculty, getFaculty } from '../services/api';
import {
  Plus,
  Trash2,
  Save,
  CheckCircle,
  AlertCircle,
  UserPlus,
  GraduationCap,
  Briefcase,
} from 'lucide-react';
import { motion } from 'framer-motion';

const TEACHER_TYPES = ['Temporary', 'Assistant', 'Permanent'];

const defaultFaculty = () => ({
  name: '',
  qualification: '',
  teacherType: 'Assistant',
});

const formatFaculty = (f) => ({
  name: f.name || '',
  qualification: f.qualification || '',
  teacherType: f.teacherType ?? f.teacher_type ?? 'Assistant',
});

const typeBadgeClass = {
  Temporary: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  Assistant: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  Permanent: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
};

const FacultyRegistry = () => {
  const [faculty, setFaculty] = useState([defaultFaculty()]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    getFaculty()
      .then((res) => {
        const list = res.data.map(formatFaculty).filter((f) => f.name.trim());
        setFaculty(list.length > 0 ? list : [defaultFaculty()]);
      })
      .catch(console.error);
  }, []);

  const addRow = () => setFaculty([...faculty, defaultFaculty()]);

  const persistFaculty = async (list) => {
    const valid = list.filter((f) => f.name.trim() !== '');
    const names = valid.map((f) => f.name.trim().toLowerCase());
    if (names.length > 0 && new Set(names).size !== names.length) {
      throw new Error('Duplicate faculty names are not allowed.');
    }
    await addFaculty(valid);
    return valid;
  };

  const handleSave = async () => {
    setLoading(true);
    setStatus({ type: 'info', message: 'Saving faculty registry...' });
    try {
      const valid = await persistFaculty(faculty);
      setFaculty(valid.length > 0 ? valid : [defaultFaculty()]);
      setStatus({
        type: 'success',
        message:
          valid.length > 0
            ? `Saved ${valid.length} faculty member(s). They are now available in Admin Panel.`
            : 'All faculty removed from database.',
      });
    } catch (err) {
      setStatus({
        type: 'error',
        message: err.response?.data?.detail || err.message || 'Failed to save faculty.',
      });
    }
    setLoading(false);
  };

  const removeFacultyAt = async (index) => {
    const removedName = faculty[index]?.name?.trim();
    const next = faculty.filter((_, idx) => idx !== index);
    const updated = next.length > 0 ? next : [defaultFaculty()];
    setFaculty(updated);
    setLoading(true);
    setStatus({ type: 'info', message: 'Removing faculty from database...' });
    try {
      const valid = await persistFaculty(updated);
      setFaculty(valid.length > 0 ? valid : [defaultFaculty()]);
      setStatus({
        type: 'success',
        message: removedName
          ? `"${removedName}" removed from database (assignments and timetable entries cleared).`
          : 'Record removed from database.',
      });
    } catch (err) {
      setStatus({
        type: 'error',
        message: err.response?.data?.detail || err.message || 'Failed to remove faculty.',
      });
    }
    setLoading(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <UserPlus className="w-8 h-8 text-blue-500" />
            Faculty Registry
          </h2>
          <p className="text-slate-500 mt-1">
            Register faculty details. Registered faculty appear in Admin Panel for subject assignment.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/admin"
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Go to Admin Panel
          </Link>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            Save Registry
          </button>
        </div>
      </header>

      {status && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-xl flex items-center gap-3 ${
            status.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
              : status.type === 'error'
              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
              : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
          }`}
        >
          {status.type === 'success' ? (
            <CheckCircle className="w-5 h-5 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0" />
          )}
          {status.message}
        </motion.div>
      )}

      <section className="glass-card space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
            Registered Faculty
          </h3>
          <button
            onClick={addRow}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Faculty
          </button>
        </div>

        <div className="hidden md:grid grid-cols-12 gap-3 px-3 text-xs font-bold uppercase tracking-wider text-slate-500">
          <span className="col-span-4">Name</span>
          <span className="col-span-4">Qualification</span>
          <span className="col-span-3">Teacher Type</span>
          <span className="col-span-1" />
        </div>

        <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2 custom-scrollbar">
          {faculty.map((f, i) => (
            <div
              key={i}
              className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center bg-slate-50 dark:bg-white/5 p-4 rounded-xl border border-slate-200 dark:border-white/5"
            >
              <div className="md:col-span-4">
                <label className="md:hidden text-xs text-slate-500 mb-1 block">Name</label>
                <input
                  value={f.name}
                  onChange={(e) => {
                    const updated = [...faculty];
                    updated[i].name = e.target.value;
                    setFaculty(updated);
                  }}
                  placeholder="Faculty name"
                  className="w-full bg-transparent border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="md:col-span-4">
                <label className="md:hidden text-xs text-slate-500 mb-1 flex items-center gap-1">
                  <GraduationCap className="w-3 h-3" /> Qualification
                </label>
                <input
                  value={f.qualification}
                  onChange={(e) => {
                    const updated = [...faculty];
                    updated[i].qualification = e.target.value;
                    setFaculty(updated);
                  }}
                  placeholder="e.g. M.Tech, Ph.D"
                  className="w-full bg-transparent border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="md:col-span-3">
                <label className="md:hidden text-xs text-slate-500 mb-1 flex items-center gap-1">
                  <Briefcase className="w-3 h-3" /> Teacher Type
                </label>
                <select
                  value={f.teacherType}
                  onChange={(e) => {
                    const updated = [...faculty];
                    updated[i].teacherType = e.target.value;
                    setFaculty(updated);
                  }}
                  className="w-full bg-transparent border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {TEACHER_TYPES.map((t) => (
                    <option key={t} value={t} className="bg-white dark:bg-slate-900">
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-1 flex justify-end">
                <button
                  onClick={() => removeFacultyAt(i)}
                  disabled={loading}
                  className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-40"
                  title="Remove from database"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {faculty.some((f) => f.name.trim()) && (
        <section className="glass-card">
          <h3 className="text-lg font-semibold mb-4">Preview — saved faculty list</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {faculty
              .filter((f) => f.name.trim())
              .map((f, i) => (
                <div
                  key={i}
                  className="p-4 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5"
                >
                  <p className="font-bold text-slate-800 dark:text-slate-100">{f.name}</p>
                  <p className="text-sm text-slate-500 mt-1">{f.qualification || '—'}</p>
                  <span
                    className={`inline-block mt-2 text-[10px] font-bold uppercase px-2 py-1 rounded-full border ${
                      typeBadgeClass[f.teacherType] || typeBadgeClass.Assistant
                    }`}
                  >
                    {f.teacherType}
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default FacultyRegistry;

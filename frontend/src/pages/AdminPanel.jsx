import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  addSubjects,
  mapFacultySubject,
  generateTimetable,
  getSubjects,
  getFaculty,
  getFacultyMappings,
  addElectiveAssignments,
  getOtherDepartmentsFaculty,
  createFacultyRequest,
  getSentRequests,
  getReceivedRequests,
  updateFacultyRequest,
} from '../services/api';
import {
  Plus,
  Trash2,
  Wand2,
  CheckCircle,
  AlertCircle,
  BookOpen,
  GraduationCap,
  Layers,
  FlaskConical,
  UserPlus,
  Check,
  X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import SemesterModeSelector from '../components/SemesterModeSelector';
import {
  getStoredSemesterMode,
  setStoredSemesterMode,
  normalizeSemesterMode,
  getSemestersForProgram,
  getDefaultSemester,
  clampSemester,
  formatSemesterMode,
  formatSemesterLabel,
} from '../constants/semesterMode';
import { isElectiveSubject } from '../constants/electives';
import { ALL_BATCHES } from '../constants/timetable';

const formatFaculty = (f) => ({
  name: f.name || '',
  qualification: f.qualification || '',
  teacherType: f.teacherType ?? f.teacher_type ?? 'Assistant',
});

const getSubjectMode = (sub) =>
  normalizeSemesterMode(sub.semesterType ?? sub.semester_type ?? 'odd');

const defaultSubject = (program, semesterMode, type = 'Lecture', name = '') => ({
  name,
  semester: getDefaultSemester(program, semesterMode),
  program,
  type,
  batches: type === 'Lab' ? ['A1', 'A2', 'B1', 'B2'] : [],
  isElective: type === 'Elective',
  electiveGroup: 'default',
  semesterType: normalizeSemesterMode(semesterMode),
  hours: type === 'Lab' ? 2 : 5,
});

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState('UG');
  const [semesterMode, setSemesterMode] = useState(getStoredSemesterMode);
  const [subjects, setSubjects] = useState([]);
  const [registeredFaculty, setRegisteredFaculty] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  


  const [otherFaculty, setOtherFaculty] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [receivedRequests, setReceivedRequests] = useState([]);
  const [reqFacultyName, setReqFacultyName] = useState('');
  const [reqTargetDept, setReqTargetDept] = useState('');

  const fetchRequestData = async () => {
    try {
      const [otherFacRes, sentRes, receivedRes] = await Promise.all([
        getOtherDepartmentsFaculty(),
        getSentRequests(),
        getReceivedRequests(),
      ]);
      setOtherFaculty(otherFacRes.data);
      setSentRequests(sentRes.data);
      setReceivedRequests(receivedRes.data);
    } catch (err) {
      console.error('Error fetching request data:', err);
    }
  };

  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    if (!reqFacultyName || !reqTargetDept) {
      setStatus({ type: 'error', message: 'Faculty name and target department are required.' });
      return;
    }
    setLoading(true);
    setStatus({ type: 'info', message: 'Submitting faculty request...' });
    try {
      await createFacultyRequest({
        target_department: reqTargetDept,
        faculty_name: reqFacultyName,
      });
      setReqFacultyName('');
      setReqTargetDept('');
      await fetchRequestData();
      setStatus({ type: 'success', message: 'Faculty request submitted successfully.' });
    } catch (err) {
      setStatus({
        type: 'error',
        message: err.response?.data?.detail || err.message || 'Failed to submit request.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (requestId, newStatus) => {
    setLoading(true);
    setStatus({ type: 'info', message: `Updating request to ${newStatus}...` });
    try {
      await updateFacultyRequest(requestId, newStatus);
      await fetchRequestData();
      const facs = await getFaculty();
      setRegisteredFaculty(
        facs.data.map(formatFaculty).filter((f) => f.name.trim() !== '')
      );
      setStatus({ type: 'success', message: `Request ${newStatus} successfully.` });
    } catch (err) {
      setStatus({
        type: 'error',
        message: err.response?.data?.detail || err.message || 'Failed to update request.',
      });
    } finally {
      setLoading(false);
    }
  };


  const matchesView = (item) =>
    item.program === activeTab && getSubjectMode(item) === semesterMode;

  const visibleSemesters = getSemestersForProgram(activeTab, semesterMode);

  const electiveSubjects = subjects.filter(
    (s) => isElectiveSubject(s) && matchesView(s) && s.name.trim()
  );
  const labSubjects = subjects.filter(
    (s) => s.type === 'Lab' && matchesView(s) && s.name.trim()
  );
  const lectureSubjects = subjects.filter(
    (s) => s.type === 'Lecture' && matchesView(s) && s.name.trim()
  );

  const allElectiveSubjects = subjects.filter(
    (s) => isElectiveSubject(s) && s.name.trim()
  );
  const allLabSubjects = subjects.filter(
    (s) => s.type === 'Lab' && s.name.trim()
  );

  const isGlobalElectiveName = (name) =>
    allElectiveSubjects.some((s) => s.name === name);

  const isGlobalLabSubjectName = (name) =>
    allLabSubjects.some((s) => s.name === name);

  const isElectiveName = (name) =>
    electiveSubjects.some((s) => s.name === name);

  const isLabSubjectName = (name) =>
    labSubjects.some((s) => s.name === name);

  const isLectureSubjectName = (name) =>
    lectureSubjects.some((s) => s.name === name);

  const getLabBatchesForSubject = (sub) =>
    sub?.batches?.length ? [...sub.batches].sort() : ['A1', 'A2', 'B1', 'B2'];

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [subs, facs, maps] = await Promise.all([
          getSubjects(),
          getFaculty(),
          getFacultyMappings(),
        ]);
        const formattedSubjects = subs.data.map((sub) => {
          let currentBatches = sub.batches || [];
          if (sub.type === 'Lab' && currentBatches.length === 0) {
            currentBatches = ['A1', 'A2', 'B1', 'B2'];
          }
          const mode = getSubjectMode(sub);
          return {
            ...sub,
            isElective: sub.isElective ?? sub.is_elective ?? sub.type === 'Elective',
            electiveGroup: 'default',
            semesterType: mode,
            semester: clampSemester(sub.program, sub.semester, mode),
            batches: currentBatches,
            hours: sub.hours ?? (sub.type === 'Lab' ? 2 : 5),
          };
        });
        setSubjects(
          formattedSubjects.length > 0
            ? formattedSubjects
            : [defaultSubject('UG', getStoredSemesterMode())]
        );
        setRegisteredFaculty(
          facs.data.map(formatFaculty).filter((f) => f.name.trim() !== '')
        );
        setMappings(
          maps.data.length > 0
            ? maps.data.map((m) => ({
                subject_name: m.subject_name,
                faculty_name: m.faculty_name || '',
                batch: m.batch || null,
              }))
            : []
        );
      } catch (err) {
        console.error('Error fetching data:', err);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === 'Faculty Requests') {
      fetchRequestData();
    }
  }, [activeTab]);

  useEffect(() => {
    setMappings((prev) => {
      const next = [...prev];
      allElectiveSubjects.forEach((es) => {
        if (!next.some((m) => m.subject_name === es.name)) {
          next.push({ subject_name: es.name, faculty_name: '' });
        }
      });
      return next.filter(
        (m) =>
          !isGlobalElectiveName(m.subject_name) ||
          allElectiveSubjects.some((es) => es.name === m.subject_name)
      );
    });
  }, [allElectiveSubjects.map((s) => s.name).join('|')]);

  useEffect(() => {
    setMappings((prev) => {
      const next = [...prev];
      const labNames = new Set(allLabSubjects.map((s) => s.name));
      allLabSubjects.forEach((lab) => {
        getLabBatchesForSubject(lab).forEach((batch) => {
          if (!next.some((m) => m.subject_name === lab.name && m.batch === batch)) {
            next.push({ subject_name: lab.name, faculty_name: '', batch });
          }
        });
      });
      return next.filter((m) => {
        if (!m.batch) return true;
        if (!labNames.has(m.subject_name)) return false;
        const lab = allLabSubjects.find((s) => s.name === m.subject_name);
        return lab && getLabBatchesForSubject(lab).includes(m.batch);
      });
    });
  }, [allLabSubjects.map((s) => `${s.name}:${(s.batches || []).join(',')}`).join('|')]);

  const handleSemesterModeChange = (mode) => {
    const normalized = normalizeSemesterMode(mode);
    setStoredSemesterMode(normalized);
    setSemesterMode(normalized);
    setSubjects((prev) =>
      prev.map((s) =>
        getSubjectMode(s) === normalized
          ? { ...s, semester: clampSemester(s.program, s.semester, normalized) }
          : s
      )
    );
  };

  const addSubjectRow = (type = 'Lecture') =>
    setSubjects([...subjects, defaultSubject(activeTab, semesterMode, type)]);

  const addMappingRow = () =>
    setMappings([...mappings, { subject_name: '', faculty_name: '', batch: null }]);

  const toggleLabBatch = (subjectIndex, batch) => {
    const sub = subjects[subjectIndex];
    const batches = sub.batches || [];
    const hasBatch = batches.includes(batch);
    const nextSubjects = [...subjects];
    const nextMappings = [...mappings];

    if (hasBatch) {
      nextSubjects[subjectIndex] = {
        ...sub,
        batches: batches.filter((b) => b !== batch),
      };
      const trimmed = nextMappings.filter(
        (m) => !(m.subject_name === sub.name && m.batch === batch)
      );
      setSubjects(nextSubjects);
      setMappings(trimmed);
    } else {
      nextSubjects[subjectIndex] = {
        ...sub,
        batches: [...batches, batch].sort(),
      };
      if (!nextMappings.some((m) => m.subject_name === sub.name && m.batch === batch)) {
        nextMappings.push({
          subject_name: sub.name,
          faculty_name: '',
          batch,
        });
      }
      setSubjects(nextSubjects);
      setMappings(nextMappings);
    }
  };

  const prepareSubjectsForSave = (list) =>
    list
      .filter((s) => s.name.trim() !== '')
      .map((s) => ({
        ...s,
        semesterType: getSubjectMode(s),
        electiveGroup: 'default',
        isElective: isElectiveSubject(s),
      }));

  const prepareMappingsForSave = (list) =>
    list.filter((m) => m.subject_name !== '' && m.faculty_name !== '');

  const persistToDatabase = async (nextSubjects, nextMappings) => {
    const validSubjects = prepareSubjectsForSave(nextSubjects);
    const validMappings = prepareMappingsForSave(nextMappings);
    await addSubjects(validSubjects);
    await mapFacultySubject(validMappings);
    return { validSubjects, validMappings };
  };

  const removeSubjectAt = async (index) => {
    const removedName = subjects[index]?.name?.trim();
    const nextSubjects = subjects.filter((_, idx) => idx !== index);
    const nextMappings = removedName
      ? mappings.filter((m) => m.subject_name !== removedName)
      : mappings;
    const fallback =
      nextSubjects.length > 0
        ? nextSubjects
        : [defaultSubject(activeTab, semesterMode)];

    setSubjects(fallback);
    setMappings(nextMappings);
    setLoading(true);
    setStatus({ type: 'info', message: 'Removing subject from database...' });
    try {
      await persistToDatabase(nextSubjects, nextMappings);
      setStatus({
        type: 'success',
        message: removedName
          ? `"${removedName}" removed from database. Regenerate timetable to refresh the schedule.`
          : 'Record removed from database.',
      });
    } catch (err) {
      setStatus({
        type: 'error',
        message: err.response?.data?.detail || err.message || 'Failed to remove subject.',
      });
    }
    setLoading(false);
  };

  const removeMappingAt = async (index) => {
    const nextMappings = mappings.filter((_, idx) => idx !== index);
    setMappings(nextMappings);
    setLoading(true);
    setStatus({ type: 'info', message: 'Removing assignment from database...' });
    try {
      await persistToDatabase(subjects, nextMappings);
      setStatus({
        type: 'success',
        message: 'Faculty assignment removed from database.',
      });
    } catch (err) {
      setStatus({
        type: 'error',
        message:
          err.response?.data?.detail || err.message || 'Failed to remove assignment.',
      });
    }
    setLoading(false);
  };

  const areParallelElectives = (name1, name2) => {
    const sub1 = subjects.find(s => s.name === name1);
    const sub2 = subjects.find(s => s.name === name2);
    if (!sub1 || !sub2) return false;
    return (
      sub1.program === sub2.program &&
      sub1.semester === sub2.semester &&
      (sub1.electiveGroup || 'default') === (sub2.electiveGroup || 'default') &&
      (sub1.semesterType || 'odd') === (sub2.semesterType || 'odd')
    );
  };

  const getFacultyForElectiveMapping = (mappingIndex, currentFaculty) => {
    const targetSubjectName = mappings[mappingIndex]?.subject_name;
    const usedElsewhere = new Set(
      mappings
        .filter(
          (m, idx) =>
            idx !== mappingIndex &&
            isGlobalElectiveName(m.subject_name) &&
            m.faculty_name &&
            areParallelElectives(targetSubjectName, m.subject_name)
        )
        .map((m) => m.faculty_name)
    );
    return registeredFaculty.filter(
      (f) => !usedElsewhere.has(f.name) || f.name === currentFaculty
    );
  };

  const updateMapping = (index, field, value) => {
    const next = [...mappings];
    next[index] = { ...next[index], [field]: value };
    if (field === 'faculty_name' && isGlobalElectiveName(next[index].subject_name)) {
      const targetSubjectName = next[index].subject_name;
      mappings.forEach((m, idx) => {
        if (
          idx !== index &&
          isGlobalElectiveName(m.subject_name) &&
          m.faculty_name === value &&
          value &&
          areParallelElectives(targetSubjectName, m.subject_name)
        ) {
          next[idx] = { ...next[idx], faculty_name: '' };
        }
      });
    }
    setMappings(next);
  };

  const handleGenerate = async () => {
    setLoading(true);
    setStatus({ type: 'info', message: 'Saving data and generating timetable...' });
    try {
      const validSubjects = prepareSubjectsForSave(subjects);
      const validMappings = prepareMappingsForSave(mappings);

      const modeElectives = electiveSubjects;
      const missingElectiveFaculty = modeElectives.filter(
        (es) => !validMappings.some((m) => m.subject_name === es.name)
      );
      if (missingElectiveFaculty.length > 0) {
        throw new Error(
          `Assign a different faculty to each elective: ${missingElectiveFaculty.map((s) => s.name).join(', ')}`
        );
      }

      const missingLabFaculty = [];
      labSubjects.forEach((lab) => {
        getLabBatchesForSubject(lab).forEach((batch) => {
          if (
            !validMappings.some(
              (m) => m.subject_name === lab.name && m.batch === batch && m.faculty_name
            )
          ) {
            missingLabFaculty.push(`${lab.name} → ${batch}`);
          }
        });
      });
      if (missingLabFaculty.length > 0) {
        throw new Error(
          `Assign faculty for each lab batch: ${missingLabFaculty.join(', ')}`
        );
      }

      const missingLectureFaculty = lectureSubjects.filter(
        (ls) => !validMappings.some((m) => m.subject_name === ls.name && m.faculty_name)
      );
      if (missingLectureFaculty.length > 0) {
        throw new Error(
          `Assign faculty to each lecture subject: ${missingLectureFaculty.map((s) => s.name).join(', ')}`
        );
      }

      const modeSubjects = validSubjects.filter(
        (s) => getSubjectMode(s) === semesterMode
      );

      if (registeredFaculty.length === 0) {
        throw new Error('Register faculty in Faculty Registry first.');
      }
      if (modeSubjects.length === 0 || validMappings.length === 0) {
        throw new Error(
          `Add subjects and faculty for ${formatSemesterMode(semesterMode)} first.`
        );
      }

      await addSubjects(validSubjects);
      await mapFacultySubject(validMappings);
      await addElectiveAssignments([]);

      const res = await generateTimetable(semesterMode);
      const clashCount =
        (res.data.clashes?.faculty_clashes?.length || 0) +
        (res.data.clashes?.room_clashes?.length || 0) +
        (res.data.clashes?.elective_room_clashes?.length || 0);

      const missing = res.data.subjects_missing || [];
      const failed = res.data.failed_allocations || [];
      const scheduled = res.data.subjects_scheduled ?? 0;
      const total = res.data.subjects_total ?? validSubjects.length;

      if (res.data.count === 0) {
        setStatus({
          type: 'error',
          message:
            missing.length > 0
              ? `No timetable rows created. Not scheduled: ${missing.join(', ')}. Check faculty for every subject, lab batch, and elective.`
              : 'Generated 0 entries. Check faculty assignments.',
        });
      } else if (missing.length > 0 || failed.length > 0) {
        const failedSummary = failed
          .slice(0, 5)
          .map((f) => `${f.subject} (${f.type}, Sec ${f.section})`)
          .join('; ');
        setStatus({
          type: 'error',
          message: `Scheduled ${scheduled}/${total} subjects (${res.data.count} entries). Missing: ${missing.join(', ') || 'none'}. Failed slots: ${failedSummary}${failed.length > 5 ? '…' : ''}. Try again or reduce subjects per section.`,
        });
      } else if (clashCount > 0) {
        const fc = res.data.clashes?.faculty_clashes?.length || 0;
        const rc = res.data.clashes?.room_clashes?.length || 0;
        const ec = res.data.clashes?.elective_room_clashes?.length || 0;
        setStatus({
          type: 'error',
          message: `Generated ${res.data.count} entries. Clash groups: ${fc} faculty, ${rc} room, ${ec} elective (${clashCount} total). Assign different faculty or regenerate.`,
        });
      } else {
        setStatus({
          type: 'success',
          message: `Generated ${res.data.count} entries for all ${total} subject(s) in ${formatSemesterMode(semesterMode)}.`,
        });
      }
    } catch (err) {
      setStatus({
        type: 'error',
        message:
          err.response?.data?.detail || err.message || 'Failed to generate timetable.',
      });
    }
    setLoading(false);
  };

  const lectureSubjectNames = lectureSubjects.map((s) => s.name);
  const facultyLabel = (f) => {
    const qual = f.qualification ? ` · ${f.qualification}` : '';
    return `${f.name} (${f.teacherType})${qual}`;
  };

  const electiveMappingRows = mappings
    .map((m, i) => ({ ...m, _idx: i }))
    .filter((m) => isElectiveName(m.subject_name));

  const labMappingRows = mappings
    .map((m, i) => ({ ...m, _idx: i }))
    .filter((m) => isLabSubjectName(m.subject_name) && m.batch);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Admin Control</h2>
          <p className="text-slate-600">
            Configure subjects and faculty — {formatSemesterMode(semesterMode)}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SemesterModeSelector value={semesterMode} onChange={handleSemesterModeChange} />
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-2 bg-gradient-to-r from-primary-600 to-blue-600 px-8 py-3 rounded-xl text-white font-medium shadow-lg disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Wand2 className="w-5 h-5" />
            )}
            Generate Timetable
          </button>
        </div>
      </header>

      <div className="flex gap-4 border-b border-slate-200 pb-1">
        {['UG', 'PG', 'Faculty Requests'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 font-semibold relative ${
              activeTab === tab ? 'text-primary-600' : 'text-slate-500'
            }`}
          >
            {tab === 'Faculty Requests'
              ? 'Faculty Requests'
              : `${tab} Program`}
            {activeTab === tab && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-1 bg-primary-500 rounded-t-full"
              />
            )}
          </button>
        ))}
      </div>

      {status && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-xl flex items-center gap-3 ${
            status.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : status.type === 'error'
              ? 'bg-rose-50 text-rose-700 border border-rose-200'
              : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}
        >
          {status.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          {status.message}
        </motion.div>
      )}

      {activeTab === 'Faculty Requests' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Request Faculty Section */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-800">
              <UserPlus className="w-5 h-5 text-primary-600" />
              Request Borrowed Faculty
            </h3>
            <p className="text-sm text-slate-500">
              Select a faculty member from another department. Once their department head approves, they will be available in your subjects mapping dropdown.
            </p>
            <form onSubmit={handleRequestSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Select Faculty & Department</label>
                <select
                  value={reqFacultyName ? `${reqFacultyName}|${reqTargetDept}` : ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      const [name, dept] = val.split('|');
                      setReqFacultyName(name);
                      setReqTargetDept(dept);
                    } else {
                      setReqFacultyName('');
                      setReqTargetDept('');
                    }
                  }}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all bg-white"
                >
                  <option value="">Choose a faculty member...</option>
                  {otherFaculty.map((f, idx) => (
                    <option key={idx} value={`${f.name}|${f.department}`}>
                      {f.name} ({f.teacher_type || f.teacherType || 'Assistant'}) — {f.department}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={loading || !reqFacultyName}
                className="flex items-center gap-2 bg-gradient-to-r from-primary-600 to-blue-600 hover:from-primary-500 hover:to-blue-500 text-white px-6 py-2.5 rounded-xl text-sm font-medium shadow-md transition-all disabled:opacity-50"
              >
                Send Request
              </button>
            </form>
          </section>

          {/* Requests Management Section */}
          <div className="space-y-8">
            {/* Incoming Requests */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-800">Incoming Requests (To Approve/Reject)</h3>
              <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                {receivedRequests.map((req) => (
                  <div key={req._id} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50">
                    <div>
                      <h4 className="font-bold text-sm text-slate-800">{req.faculty_name}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Requested by: {req.requester_department}</p>
                    </div>
                    {req.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdateStatus(req._id, 'approved')}
                          disabled={loading}
                          className="p-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg transition-colors"
                          title="Approve"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(req._id, 'rejected')}
                          disabled={loading}
                          className="p-2 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg transition-colors"
                          title="Reject"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <span className={`text-xs font-bold uppercase px-3 py-1 rounded-lg border ${
                        req.status === 'approved'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {req.status}
                      </span>
                    )}
                  </div>
                ))}
                {receivedRequests.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-4">No incoming requests.</p>
                )}
              </div>
            </section>

            {/* Outgoing Requests */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-800">Outgoing Requests (Sent)</h3>
              <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                {sentRequests.map((req) => (
                  <div key={req._id} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50">
                    <div>
                      <h4 className="font-bold text-sm text-slate-800">{req.faculty_name}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Target Dept: {req.target_department}</p>
                    </div>
                    <span className={`text-xs font-bold uppercase px-3 py-1 rounded-lg border ${
                      req.status === 'approved'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : req.status === 'rejected'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {req.status}
                    </span>
                  </div>
                ))}
                {sentRequests.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-4">No requests sent yet.</p>
                )}
              </div>
            </section>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-800">
                <BookOpen className="w-5 h-5 text-primary-600" />
                {activeTab} Subjects
              </h3>
              <button
                onClick={() => addSubjectRow('Lecture')}
                className="p-2 hover:bg-primary-50 rounded-lg text-primary-600"
                title="Add lecture/lab"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {subjects.map((sub, i) => {
                if (!matchesView(sub)) return null;
                const isElective = isElectiveSubject(sub);
                return (
                  <div
                    key={i}
                    className={`flex flex-wrap items-center gap-2 p-3 rounded-xl border ${
                      isElective
                        ? 'bg-violet-50 border-violet-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <input
                      placeholder={isElective ? 'Elective name' : 'Name'}
                      value={sub.name}
                      onChange={(e) => {
                        const next = [...subjects];
                        next[i].name = e.target.value;
                        setSubjects(next);
                      }}
                      className="flex-1 min-w-[120px] border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <select
                      value={sub.semester}
                      onChange={(e) => {
                        const next = [...subjects];
                        next[i].semester = parseInt(e.target.value);
                        next[i].semesterType = semesterMode;
                        setSubjects(next);
                      }}
                      className="border border-slate-200 rounded-lg px-2 py-2 text-sm"
                    >
                      {visibleSemesters.map((s) => (
                        <option key={s} value={s}>
                          {formatSemesterLabel(s)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={sub.type}
                      onChange={(e) => {
                        const next = [...subjects];
                        const t = e.target.value;
                        next[i].type = t;
                        next[i].isElective = t === 'Elective';
                        next[i].electiveGroup = 'default';
                        if (t === 'Lecture') {
                          next[i].batches = [];
                          next[i].hours = 5;
                        }
                        if (t === 'Lab') {
                          if (!next[i].batches?.length) next[i].batches = ['A1', 'A2', 'B1', 'B2'];
                          next[i].hours = 2;
                        }
                        if (t === 'Elective') {
                          next[i].hours = 5;
                        }
                        setSubjects(next);
                      }}
                      className="border border-slate-200 rounded-lg px-2 py-2 text-sm"
                    >
                      <option value="Lecture">Lecture</option>
                      <option value="Lab">Lab</option>
                      <option value="Elective">Elective</option>
                    </select>
                    {sub.type === 'Lab' && (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="text-[10px] text-cyan-700 font-semibold w-full sm:w-auto">
                          Hours:
                        </span>
                        <select
                          value={sub.hours || 2}
                          onChange={(e) => {
                            const next = [...subjects];
                            next[i].hours = parseInt(e.target.value);
                            setSubjects(next);
                          }}
                          className="border border-cyan-200 text-cyan-800 rounded-lg px-1.5 py-1 text-xs bg-white focus:outline-none"
                        >
                          <option value="2">2 Hrs</option>
                          <option value="4">4 Hrs</option>
                          <option value="6">6 Hrs</option>
                          <option value="8">8 Hrs</option>
                        </select>
                        <span className="text-[10px] text-cyan-700 font-semibold w-full sm:w-auto ml-1">
                          Batches:
                        </span>
                        {ALL_BATCHES.map((b) => (
                          <label
                            key={b}
                            className={`text-xs px-2 py-1 rounded-md border cursor-pointer ${
                              sub.batches?.includes(b)
                                ? 'bg-cyan-600 text-white border-cyan-600'
                                : 'bg-white text-cyan-800 border-cyan-200'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={sub.batches?.includes(b) || false}
                              onChange={() => toggleLabBatch(i, b)}
                            />
                            {b}
                          </label>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => removeSubjectAt(i)}
                      disabled={loading}
                      className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg ml-auto disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-800">
                  <GraduationCap className="w-5 h-5 text-emerald-600" />
                  Faculty Allocation
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  <Link to="/faculty-registry" className="text-primary-600 hover:underline">
                    Faculty Registry
                  </Link>
                  {' · '}labs: pick faculty per batch
                </p>
              </div>
              <button
                onClick={addMappingRow}
                className="p-2 hover:bg-emerald-50 rounded-lg text-emerald-600"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {electiveSubjects.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase text-violet-700 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5" />
                  Elective faculty (different teacher each)
                </p>
                {electiveMappingRows.map((m) => (
                  <div
                    key={m._idx}
                    className="flex items-center gap-2 p-3 rounded-xl bg-violet-50 border border-violet-200"
                  >
                    <span className="text-sm font-semibold text-violet-900 min-w-[100px] shrink-0">
                      {m.subject_name}
                    </span>
                    <select
                      value={m.faculty_name}
                      onChange={(e) => updateMapping(m._idx, 'faculty_name', e.target.value)}
                      className="flex-1 border border-violet-200 rounded-lg px-2 py-2 text-sm bg-white"
                    >
                      <option value="">Select faculty</option>
                      {getFacultyForElectiveMapping(m._idx, m.faculty_name).map((f) => (
                        <option key={f.name} value={f.name}>
                          {facultyLabel(f)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {labSubjects.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase text-cyan-700 flex items-center gap-1">
                  <FlaskConical className="w-3.5 h-3.5" />
                  Lab faculty (assign per batch)
                </p>
                {labSubjects.map((lab) => (
                  <div
                    key={lab.name}
                    className="p-3 rounded-xl bg-cyan-50 border border-cyan-200 space-y-2"
                  >
                    <p className="text-sm font-semibold text-cyan-900">{lab.name}</p>
                    {getLabBatchesForSubject(lab).map((batch) => {
                      const row = labMappingRows.find(
                        (m) => m.subject_name === lab.name && m.batch === batch
                      );
                      if (!row) return null;
                      return (
                        <div key={batch} className="flex items-center gap-2">
                          <span className="text-xs font-bold text-cyan-800 w-10 shrink-0">
                            {batch}
                          </span>
                          <select
                            value={row.faculty_name}
                            onChange={(e) =>
                              updateMapping(row._idx, 'faculty_name', e.target.value)
                            }
                            className="flex-1 border border-cyan-200 rounded-lg px-2 py-2 text-sm bg-white"
                          >
                            <option value="">Select faculty for {batch}</option>
                            {registeredFaculty.map((f) => (
                              <option key={f.name} value={f.name}>
                                {facultyLabel(f)}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                    {getLabBatchesForSubject(lab).length === 0 && (
                      <p className="text-xs text-cyan-700">
                        Select at least one batch on the lab subject above.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-bold uppercase text-slate-600">Lectures</p>
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {mappings.map((m, i) => {
                  if (m.subject_name && !isLectureSubjectName(m.subject_name))
                    return null;
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200"
                    >
                      <select
                        value={m.subject_name}
                        onChange={(e) => updateMapping(i, 'subject_name', e.target.value)}
                        className="flex-1 border border-slate-200 rounded-lg px-2 py-2 text-sm"
                      >
                        <option value="">Subject</option>
                        {lectureSubjectNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={m.faculty_name}
                        onChange={(e) => updateMapping(i, 'faculty_name', e.target.value)}
                        className="flex-1 border border-slate-200 rounded-lg px-2 py-2 text-sm"
                      >
                        <option value="">Faculty</option>
                        {registeredFaculty.map((f) => (
                          <option key={f.name} value={f.name}>
                            {facultyLabel(f)}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => removeMappingAt(i)}
                        disabled={loading}
                        className="p-2 text-rose-500 disabled:opacity-40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;

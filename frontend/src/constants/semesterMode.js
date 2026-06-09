export const SEMESTERS_BY_MODE = {
  odd: { UG: [1, 3, 5], PG: [1, 3] },
  even: { UG: [2, 4, 6], PG: [2, 4] },
};

export const SEMESTER_MODE_STORAGE_KEY = 'semesterMode';

export const normalizeSemesterMode = (value) => {
  const v = (value || 'odd').toString().toLowerCase();
  if (v === 'odd' || v === 'even') return v;
  return 'odd';
};

export const getStoredSemesterMode = () => {
  try {
    return normalizeSemesterMode(localStorage.getItem(SEMESTER_MODE_STORAGE_KEY));
  } catch {
    return 'odd';
  }
};

export const setStoredSemesterMode = (mode) => {
  localStorage.setItem(SEMESTER_MODE_STORAGE_KEY, normalizeSemesterMode(mode));
};

export const getSemestersForProgram = (program, semesterMode) => {
  const mode = normalizeSemesterMode(semesterMode);
  return SEMESTERS_BY_MODE[mode][program] || [];
};

export const getDefaultSemester = (program, semesterMode) => {
  const list = getSemestersForProgram(program, semesterMode);
  return list[0] ?? 1;
};

export const isValidSemester = (program, semester, semesterMode) => {
  return getSemestersForProgram(program, semesterMode).includes(Number(semester));
};

export const clampSemester = (program, semester, semesterMode) => {
  const list = getSemestersForProgram(program, semesterMode);
  if (list.includes(Number(semester))) return Number(semester);
  return list[0] ?? 1;
};

export const formatSemesterMode = (mode) =>
  normalizeSemesterMode(mode) === 'odd' ? 'Odd Semester' : 'Even Semester';

/** Full readable semester label: Sem 1, Sem 2, ... */
export const formatSemesterLabel = (semester) => `Sem ${semester}`;

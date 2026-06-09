import { useState, useCallback } from 'react';
import {
  getStoredSemesterMode,
  setStoredSemesterMode,
  normalizeSemesterMode,
  getSemestersForProgram,
  getDefaultSemester,
  clampSemester,
} from '../constants/semesterMode';

export const useSemesterMode = (initialProgram = 'UG') => {
  const [semesterMode, setSemesterModeState] = useState(getStoredSemesterMode);
  const [program, setProgram] = useState(initialProgram);
  const [semester, setSemester] = useState(() =>
    getDefaultSemester(initialProgram, getStoredSemesterMode())
  );

  const setSemesterMode = useCallback(
    (mode) => {
      const normalized = normalizeSemesterMode(mode);
      setStoredSemesterMode(normalized);
      setSemesterModeState(normalized);
      setSemester((prev) => clampSemester(program, prev, normalized));
    },
    [program]
  );

  const setProgramAndClamp = useCallback(
    (prog) => {
      setProgram(prog);
      setSemester((prev) => clampSemester(prog, prev, semesterMode));
    },
    [semesterMode]
  );

  const semesters = getSemestersForProgram(program, semesterMode);

  return {
    semesterMode,
    setSemesterMode,
    program,
    setProgram: setProgramAndClamp,
    semester,
    setSemester,
    semesters,
    getSemestersForProgram: (prog) => getSemestersForProgram(prog, semesterMode),
  };
};

export default useSemesterMode;

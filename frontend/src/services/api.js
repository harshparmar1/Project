import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000/api',
});

// Add interceptor to attach X-Department and Authorization
api.interceptors.request.use(
  (config) => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      if (user.department) {
        config.headers['X-Department'] = user.department;
      }
      if (user.token) {
        config.headers['Authorization'] = `Bearer ${user.token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Auth Endpoints
export const signup = (payload) => api.post('/auth/signup', payload);
export const login = (payload) => api.post('/auth/login', payload);
export const getDepartments = () => api.get('/departments');
export const configureDepartment = (payload) => api.post('/departments', payload);

// Faculty Requests Endpoints
export const getOtherDepartmentsFaculty = () => api.get('/other-departments-faculty');
export const createFacultyRequest = (payload) => api.post('/faculty-requests', payload);
export const getSentRequests = () => api.get('/faculty-requests/sent');
export const getReceivedRequests = () => api.get('/faculty-requests/received');
export const updateFacultyRequest = (requestId, status) =>
  api.patch(`/faculty-requests/${requestId}`, { status });

// Timetable Endpoints
export const addSubjects = (subjects) => api.post('/subjects', subjects);
export const getSubjects = (semesterType) => {
  const qs = semesterType ? `?semester_type=${semesterType}` : '';
  return api.get(`/subjects${qs}`);
};
export const addFaculty = (faculty) => api.post('/faculty', faculty);
export const getFaculty = () => api.get('/faculty');
export const mapFacultySubject = (mappings) => api.post('/faculty_subject', mappings);
export const getFacultyMappings = () => api.get('/faculty_subject');
export const addElectiveAssignments = (assignments) => api.post('/elective_assignments', assignments);
export const getElectiveAssignments = (program, semester, section, semesterType) => {
  const params = new URLSearchParams();
  if (program) params.append('program', program);
  if (semester) params.append('semester', semester);
  if (section) params.append('section', section);
  if (semesterType) params.append('semester_type', semesterType);
  const qs = params.toString();
  return api.get(`/elective_assignments${qs ? `?${qs}` : ''}`);
};
export const getSemesterModes = () => api.get('/semester-modes');
export const generateTimetable = (semesterType) =>
  api.post('/generate', { semesterType });
export const getClashes = () => api.get('/clashes');
export const getFacultyTimetable = (facultyName, semesterType, program, semester) => {
  const params = new URLSearchParams();
  if (semesterType) params.append('semester_type', semesterType);
  if (program) params.append('program', program);
  if (semester != null) params.append('semester', semester);
  const qs = params.toString();
  return api.get(
    `/faculty-timetable/${encodeURIComponent(facultyName)}${qs ? `?${qs}` : ''}`
  );
};

export const getTimetable = (program, semester, section, batch, semesterType) => {
  const params = new URLSearchParams();
  if (program) params.append('program', program);
  if (semester) params.append('semester', semester);
  if (section) params.append('section', section);
  if (batch) params.append('batch', batch);
  if (semesterType) params.append('semester_type', semesterType);
  return api.get(`/timetable?${params.toString()}`);
};

export default api;

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import AdminPanel from './pages/AdminPanel';
import TimetableView from './pages/TimetableView';
import FacultyTimetable from './pages/FacultyTimetable';
import FacultyRegistry from './pages/FacultyRegistry';
import Login from './pages/Login';
import Signup from './pages/Signup';
import { LayoutDashboard, Settings, Calendar, UserCircle, UserPlus, LogOut, LogIn, Award } from 'lucide-react';

function NavigationSidebar({ user, onLogout }) {
  return (
    <nav className="w-64 bg-white border-r border-slate-200 p-6 flex flex-col justify-between h-screen sticky top-0">
      <div className="flex flex-col gap-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-600/30">
            <Calendar className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
            Timetable AI
          </h1>
        </div>

        <div className="flex flex-col gap-2">
          <Link
            to="/"
            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 transition-all group"
          >
            <LayoutDashboard className="w-5 h-5 text-slate-500 group-hover:text-primary-500" />
            <span className="font-medium">Dashboard</span>
          </Link>
          <Link
            to="/faculty-registry"
            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 transition-all group"
          >
            <UserPlus className="w-5 h-5 text-slate-500 group-hover:text-primary-500" />
            <span className="font-medium">Faculty Registry</span>
          </Link>
          <Link
            to="/admin"
            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 transition-all group"
          >
            <Settings className="w-5 h-5 text-slate-500 group-hover:text-primary-500" />
            <span className="font-medium">Admin Panel</span>
          </Link>
          <Link
            to="/faculty-timetable"
            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 transition-all group"
          >
            <UserCircle className="w-5 h-5 text-slate-500 group-hover:text-primary-500" />
            <span className="font-medium">Faculty Timetable</span>
          </Link>
        </div>
      </div>

      {user && (
        <div className="flex flex-col gap-4 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-600">
              {user.fullName?.charAt(0) || 'U'}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-slate-800 truncate">{user.fullName}</p>
              <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-0.5 truncate">
                <Award className="w-3 h-3 text-primary-500 inline shrink-0" />
                {user.department}
              </span>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-rose-600 hover:bg-rose-50 transition-all font-medium text-sm w-full text-left"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </nav>
  );
}

function MainAppRoutes({ user, onLogout }) {
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login onLoginSuccess={(u) => window.location.reload()} />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      <NavigationSidebar user={user} onLogout={onLogout} />
      <main className="flex-1 p-8 overflow-y-auto bg-slate-50">
        <Routes>
          <Route path="/" element={<TimetableView />} />
          <Route path="/faculty-registry" element={<FacultyRegistry />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/faculty-timetable" element={<FacultyTimetable />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
    
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <Router>
      <MainAppRoutes user={user} onLogout={handleLogout} />
    </Router>
  );
}

export default App;

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login, getDepartments } from '../services/api';
import { Calendar, Mail, Lock, Building2, Key, AlertCircle, ArrowRight, ChevronDown, Clock, BookOpen, GraduationCap, Bell, Pencil, Trophy, Award } from 'lucide-react';
import { motion } from 'framer-motion';

const Login = ({ onLoginSuccess }) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState('');
  const [departmentCode, setDepartmentCode] = useState('');
  const [departmentsList, setDepartmentsList] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if user is already logged in
    if (localStorage.getItem('user')) {
      navigate('/');
    }

    // Fetch departments
    getDepartments()
      .then((res) => {
        setDepartmentsList(res.data);
        if (res.data.length > 0) {
          setDepartment(res.data[0].name);
        }
      })
      .catch((err) => {
        console.error('Failed to load departments', err);
        setError('Could not fetch departments list.');
      });
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password || !department || !departmentCode) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload = {
        email,
        password,
        department,
        departmentCode,
      };
      const res = await login(payload);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      if (onLoginSuccess) {
        onLoginSuccess(res.data.user);
      }
      navigate('/');
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.detail || 'Login failed. Please check your credentials.'
      );
    } finally {
      setLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0.16, 1, 0.3, 1],
        when: "beforeChildren",
        staggerChildren: 0.06
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, ease: "easeOut" }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-200 via-sky-100 to-blue-300 text-slate-800 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Orbs with framer-motion floating animations */}
      <motion.div
        animate={{
          x: [0, 40, -20, 0],
          y: [0, -40, 20, 0],
          scale: [1, 1.05, 0.95, 1],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute top-[-10%] left-[-10%] w-[400px] h-[400px] bg-primary-300/40 rounded-full blur-[100px] pointer-events-none"
      />
      <motion.div
        animate={{
          x: [0, -50, 30, 0],
          y: [0, 40, -30, 0],
          scale: [1, 0.95, 1.05, 1],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-300/30 rounded-full blur-[120px] pointer-events-none"
      />
      <motion.div
        animate={{
          x: [0, 30, -30, 0],
          y: [0, 40, 40, 0],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute top-[30%] right-[20%] w-[300px] h-[300px] bg-sky-200/40 rounded-full blur-[80px] pointer-events-none"
      />

      {/* Floating College Symbols */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {[
          { Icon: GraduationCap, top: "15%", left: "8%", size: 48, rotate: 12, delay: 0, duration: 14 },
          { Icon: BookOpen, top: "22%", right: "10%", size: 40, rotate: -8, delay: 2, duration: 16 },
          { Icon: Pencil, top: "52%", left: "5%", size: 36, rotate: 15, delay: 4, duration: 13 },
          { Icon: Trophy, top: "48%", right: "6%", size: 44, rotate: -15, delay: 1, duration: 18 },
          { Icon: Bell, top: "80%", left: "12%", size: 38, rotate: 10, delay: 5, duration: 15 },
          { Icon: Award, top: "75%", right: "12%", size: 42, rotate: 8, delay: 3, duration: 17 },
          { Icon: Building2, top: "35%", left: "15%", size: 32, rotate: -5, delay: 6, duration: 20 },
        ].map((item, idx) => (
          <motion.div
            key={idx}
            style={{
              position: 'absolute',
              top: item.top,
              left: item.left,
              right: item.right,
            }}
            animate={{
              y: [0, -25, 25, 0],
              x: [0, 15, -15, 0],
              rotate: [item.rotate, item.rotate + 15, item.rotate - 15, item.rotate],
            }}
            transition={{
              duration: item.duration,
              repeat: Infinity,
              delay: item.delay,
              ease: "easeInOut"
            }}
            className="hidden md:flex items-center justify-center p-3 bg-white/50 backdrop-blur-sm border border-slate-200/40 rounded-2xl shadow-[0_8px_30px_rgba(8,112,184,0.04)] text-primary-500/25 pointer-events-none select-none"
          >
            <item.Icon style={{ width: item.size, height: item.size }} />
          </motion.div>
        ))}
      </div>

      {/* Grid Pattern Background */}
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-[0.25]"
        style={{
          backgroundImage: `linear-gradient(to right, rgba(2, 132, 199, 0.08) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(2, 132, 199, 0.08) 1px, transparent 1px)`,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Glowing Timetable Grid Slots */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {[
          { top: '20%', left: '30%', width: '100px', height: '50px', delay: 0 },
          { top: '40%', left: '70%', width: '150px', height: '50px', delay: 2 },
          { top: '60%', left: '15%', width: '100px', height: '100px', delay: 4 },
          { top: '10%', left: '80%', width: '100px', height: '50px', delay: 1 },
          { top: '80%', left: '60%', width: '150px', height: '50px', delay: 3 },
        ].map((slot, i) => (
          <motion.div
            key={i}
            className="absolute bg-primary-400/5 border border-primary-500/10 rounded-lg hidden md:block"
            style={{
              top: slot.top,
              left: slot.left,
              width: slot.width,
              height: slot.height,
            }}
            animate={{
              opacity: [0.1, 0.5, 0.1],
              scale: [1, 1.01, 1],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              delay: slot.delay,
              ease: "easeInOut"
            }}
          />
        ))}
      </div>

      {/* Floating Timetable/Academic Symbols */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {['T', 't', 'Sec A', 'Sec B', 'UG', 'PG', '+', '=', 'Σ', '10:00', '14:00', 'Lab', 'Lec', '⏰', '📚', '✏️', 'Mon', 'Fri'].map((sym, i) => (
          <motion.div
            key={i}
            className="absolute text-primary-600/15 font-bold select-none pointer-events-none font-mono"
            style={{
              fontSize: (i % 3 === 0 ? 20 : i % 3 === 1 ? 15 : 11) + 'px',
              left: ((i * 17) % 95) + 2 + '%',
              bottom: '-5%',
            }}
            animate={{
              y: ['0vh', '-110vh'],
              x: ['0px', (((i * 29) % 80) - 40) + 'px'],
              rotate: [0, 360],
              opacity: [0, 0.6, 0],
            }}
            transition={{
              duration: ((i * 7) % 8) + 12,
              repeat: Infinity,
              delay: (i * 2.3) % 10,
              ease: "linear",
            }}
          >
            {sym}
          </motion.div>
        ))}
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-md bg-blue-50/90 backdrop-blur-xl border border-blue-200/60 p-8 rounded-3xl shadow-[0_20px_50px_rgba(8,112,184,0.08)] relative z-10"
      >
        <div className="flex flex-col items-center gap-3 mb-8">
          <motion.div
            whileHover={{ scale: 1.08, rotate: 5 }}
            whileTap={{ scale: 0.95 }}
            className="w-12 h-12 bg-primary-600 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-600/30 cursor-pointer"
          >
            <Calendar className="text-white w-6 h-6" />
          </motion.div>
          <h2 className="text-2xl font-bold text-center bg-gradient-to-r from-primary-600 via-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Welcome Back
          </h2>
          <p className="text-sm text-slate-500">Sign in to manage your timetable</p>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 flex items-start gap-2.5 text-sm"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email */}
          <motion.div variants={itemVariants} className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 tracking-wider uppercase">
              Email Address
            </label>
            <div className="relative group">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary-500 transition-colors duration-200" />
              <input
                type="email"
                placeholder="you@college.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50/50 border border-slate-200 hover:border-slate-300 rounded-xl py-3 pl-10.5 pr-4 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 placeholder:text-slate-400 focus:bg-white focus:shadow-sm"
              />
            </div>
          </motion.div>

          {/* Password */}
          <motion.div variants={itemVariants} className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 tracking-wider uppercase">
              Password
            </label>
            <div className="relative group">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary-500 transition-colors duration-200" />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50/50 border border-slate-200 hover:border-slate-300 rounded-xl py-3 pl-10.5 pr-4 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 placeholder:text-slate-400 focus:bg-white focus:shadow-sm"
              />
            </div>
          </motion.div>

          {/* Department Selection */}
          <motion.div variants={itemVariants} className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 tracking-wider uppercase">
              Department
            </label>
            <div className="relative group">
              <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary-500 transition-colors duration-200" />
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full bg-slate-50/50 border border-slate-200 hover:border-slate-300 rounded-xl py-3 pl-10.5 pr-10 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 appearance-none focus:bg-white focus:shadow-sm"
              >
                {departmentsList.map((dept) => (
                  <option key={dept.name} value={dept.name} className="bg-white text-slate-800">
                    {dept.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none group-hover:text-slate-500 transition-colors" />
            </div>
          </motion.div>

          {/* Department Code */}
          <motion.div variants={itemVariants} className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 tracking-wider uppercase">
              Department Code
            </label>
            <div className="relative group">
              <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary-500 transition-colors duration-200" />
              <input
                type="text"
                placeholder="e.g. DS2026"
                value={departmentCode}
                onChange={(e) => setDepartmentCode(e.target.value)}
                className="w-full bg-slate-50/50 border border-slate-200 hover:border-slate-300 rounded-xl py-3 pl-10.5 pr-4 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 placeholder:text-slate-400 focus:bg-white focus:shadow-sm"
              />
            </div>
          </motion.div>

          {/* Submit Button */}
          <motion.div variants={itemVariants} className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-primary-600 via-blue-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-primary-500/20 hover:shadow-primary-500/30 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </motion.div>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="text-primary-600 hover:text-primary-500 font-semibold hover:underline">
            Sign up here
          </Link>
        </p>
      </motion.div>
    </div>
  );
};

export default Login;

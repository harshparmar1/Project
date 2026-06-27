import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login, getDepartments } from '../services/api';
import { Calendar, Mail, Lock, Building2, Key, AlertCircle, ArrowRight, ChevronDown, Clock, BookOpen, GraduationCap, Bell, Pencil, Trophy, Award } from 'lucide-react';
import { motion } from 'framer-motion';
import loginPageImage from '../assets/login-page-image.jpeg';
import jainLogo from '../assets/jain-logo.png';

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
    <div className="min-h-screen w-full bg-slate-950 flex flex-col md:flex-row text-slate-800 font-sans overflow-hidden relative">
      {/* LEFT SIDE: College Branding */}
      <div className="relative w-full md:w-[55%] lg:w-[58%] h-[35vh] md:h-screen flex items-end md:items-center justify-center overflow-hidden">
        {/* Background Image */}
        <motion.div
          initial={{ scale: 1.1, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          className="absolute inset-0 w-full h-full"
        >
          <img
            src={loginPageImage}
            alt="Jain University Campus"
            className="w-full h-full object-cover transition-transform duration-10000 hover:scale-105 ease-out"
          />
        </motion.div>

        {/* Overlay with subtle blue-toned dark theme */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/60 to-transparent md:bg-gradient-to-r md:from-slate-950/80 md:via-slate-900/40 md:to-transparent" />

        {/* Branding Overlay Info */}
        <div className="relative z-10 w-full p-6 sm:p-8 md:p-12 lg:p-16 flex flex-col gap-2 md:gap-3">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-500/10 border border-primary-400/20 backdrop-blur-md text-primary-200 text-xs font-semibold tracking-wider uppercase self-start"
          >
            <GraduationCap className="w-4 h-4 text-primary-300 animate-pulse" />
            <span>Official University Portal</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
          >
            <h1 className="text-xl sm:text-2xl md:text-4xl lg:text-5xl font-extrabold text-white tracking-tight drop-shadow-md">
              Welcome to Jain University
            </h1>
            <p className="text-base sm:text-lg md:text-xl lg:text-2xl font-semibold text-sky-200 mt-0.5 md:mt-1">
              School of Science
            </p>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.8 }}
            className="text-xs sm:text-sm text-slate-300 max-w-lg leading-relaxed hidden sm:block"
          >
            Empowering minds, shaping the future through excellence in science and technology.
            Access your courses, exams, schedules, and personalized academic planner in a single dashboard.
          </motion.p>
        </div>

        {/* Small aesthetic corner touch on Left Side */}

      </div>

      {/* RIGHT SIDE: Login Form */}
      <div className="relative w-full md:w-[45%] lg:w-[42%] min-h-[65vh] md:h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 md:p-6 lg:p-8 overflow-y-auto">
        {/* Background Decorative Orbs inside Right Panel */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <motion.div
            animate={{
              x: [0, 20, -10, 0],
              y: [0, -30, 15, 0],
            }}
            transition={{
              duration: 12,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="absolute top-[-5%] right-[-5%] w-[250px] h-[250px] bg-primary-200/40 rounded-full blur-[80px]"
          />
          <motion.div
            animate={{
              x: [0, -30, 20, 0],
              y: [0, 20, -20, 0],
            }}
            transition={{
              duration: 15,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="absolute bottom-[-5%] left-[-5%] w-[300px] h-[300px] bg-indigo-200/30 rounded-full blur-[100px]"
          />
        </div>

        {/* Floating Academic Symbols in Right Panel Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 hidden sm:block">
          {[
            { Icon: BookOpen, top: "12%", right: "12%", size: 24, rotate: 8, delay: 0 },
            { Icon: Award, top: "78%", left: "10%", size: 28, rotate: -12, delay: 2 },
            { Icon: Clock, top: "45%", right: "8%", size: 22, rotate: 15, delay: 4 },
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
                y: [0, -10, 10, 0],
                rotate: [item.rotate, item.rotate + 10, item.rotate - 10, item.rotate],
              }}
              transition={{
                duration: 8 + idx * 2,
                repeat: Infinity,
                delay: item.delay,
                ease: "easeInOut"
              }}
              className="text-primary-600/10 pointer-events-none select-none"
            >
              <item.Icon style={{ width: item.size, height: item.size }} />
            </motion.div>
          ))}
        </div>

        {/* Grid Pattern Background for form section */}
        <div
          className="absolute inset-0 z-0 pointer-events-none opacity-[0.15]"
          style={{
            backgroundImage: `linear-gradient(to right, rgba(2, 132, 199, 0.08) 1px, transparent 1px),
                              linear-gradient(to bottom, rgba(2, 132, 199, 0.08) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        />

        {/* Content Wrapper */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-md bg-white/80 backdrop-blur-xl border border-slate-200/50 p-5 sm:p-6 md:p-6 lg:p-7 rounded-2xl sm:rounded-3xl shadow-[0_20px_50px_rgba(8,112,184,0.06)] relative z-10"
        >
          {/* Logo & Branding */}
          <div className="flex flex-col items-center gap-2 mb-4">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center justify-center p-1 bg-white rounded-xl shadow-sm border border-slate-100"
            >
              <img
                src={jainLogo}
                alt="Jain University Logo"
                className="h-11 sm:h-13 w-auto object-contain"
              />
            </motion.div>
            <div className="text-center">
              <h2 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-primary-700 via-blue-700 to-indigo-700 bg-clip-text text-transparent">
                Sign In to Portal
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">Provide credentials to access timetable scheduler</p>
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 flex items-start gap-2 text-[11px] sm:text-xs"
            >
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Email Address */}
            <motion.div variants={itemVariants} className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">
                Email Address
              </label>
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-primary-600 transition-colors duration-200" />
                <input
                  type="email"
                  placeholder="you@college.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50/50 border border-slate-200/80 hover:border-slate-300 rounded-xl py-2 pl-9.5 pr-4 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all duration-200 placeholder:text-slate-400 focus:bg-white focus:shadow-sm"
                />
              </div>
            </motion.div>

            {/* Password */}
            <motion.div variants={itemVariants} className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">
                Password
              </label>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-primary-600 transition-colors duration-200" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50/50 border border-slate-200/80 hover:border-slate-300 rounded-xl py-2 pl-9.5 pr-4 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all duration-200 placeholder:text-slate-400 focus:bg-white focus:shadow-sm"
                />
              </div>
            </motion.div>

            {/* Department Selection */}
            <motion.div variants={itemVariants} className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">
                Department
              </label>
              <div className="relative group">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-primary-600 transition-colors duration-200" />
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full bg-slate-50/50 border border-slate-200/80 hover:border-slate-300 rounded-xl py-2 pl-9.5 pr-10 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all duration-200 appearance-none focus:bg-white focus:shadow-sm"
                >
                  {departmentsList.map((dept) => (
                    <option key={dept.name} value={dept.name} className="bg-white text-slate-800 text-xs">
                      {dept.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none group-hover:text-slate-500 transition-colors" />
              </div>
            </motion.div>

            {/* Department Code */}
            <motion.div variants={itemVariants} className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">
                Unique Department Code
              </label>
              <div className="relative group">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-primary-600 transition-colors duration-200" />
                <input
                  type="text"
                  placeholder="e.g. DS2026"
                  value={departmentCode}
                  onChange={(e) => setDepartmentCode(e.target.value)}
                  className="w-full bg-slate-50/50 border border-slate-200/80 hover:border-slate-300 rounded-xl py-2 pl-9.5 pr-4 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all duration-200 placeholder:text-slate-400 focus:bg-white focus:shadow-sm"
                />
              </div>
            </motion.div>

            {/* Submit Button */}
            <motion.div variants={itemVariants} className="pt-1.5">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-primary-600 via-blue-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white font-semibold py-2.5 rounded-xl shadow-md shadow-primary-500/10 hover:shadow-lg hover:shadow-primary-500/20 transition-all active:scale-[0.98] disabled:opacity-50 text-xs sm:text-sm"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Sign In to Portal</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </motion.div>
          </form>

          <p className="text-center text-xs text-slate-500 mt-4">
            Don&apos;t have an account?{' '}
            <Link to="/signup" className="text-primary-600 hover:text-primary-500 font-semibold hover:underline">
              Sign up here
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;

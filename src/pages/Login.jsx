import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Lock, 
  Mail, 
  Phone, 
  User, 
  MapPin, 
  ArrowRight, 
  CheckCircle2, 
  Sparkles, 
  Eye, 
  EyeOff, 
  UserCheck, 
  Building2, 
  Zap, 
  LogOut,
  ChevronRight,
  Shield,
  UserPlus,
  LogIn
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import wardsData from '../data/mysuru_wards.json';

export default function Login({ setActivePage }) {
  const { user, login, register, logout } = useAuth();
  const { language, t } = useLanguage();

  // Mode: 'login' | 'register'
  const [authMode, setAuthMode] = useState('login');

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register form state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regWard, setRegWard] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Status & feedback
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Sorted list of 65 MCC wards for registration dropdown
  const sortedWards = useMemo(() => {
    return (wardsData.features || [])
      .map(f => f.properties)
      .filter(p => p && p.ward_number)
      .sort((a, b) => Number(a.ward_number) - Number(b.ward_number));
  }, []);

  const routeByRole = (role) => {
    if (role === 'admin') setActivePage('admin-dashboard');
    else if (role === 'field_officer') setActivePage('officer-dashboard');
    else if (role === 'corporator') setActivePage('corporator-dashboard');
    else setActivePage('track');
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const loggedUser = await login(loginIdentifier, loginPassword);
      setSuccessMsg(
        language === 'kn' 
          ? `ಸ್ವಾಗತ, ${loggedUser.name}! ಲಾಗಿನ್ ಯಶಸ್ವಿಯಾಗಿದೆ.` 
          : `Welcome, ${loggedUser.name}! Successfully signed in.`
      );
      setTimeout(() => {
        routeByRole(loggedUser.role);
      }, 450);
    } catch (err) {
      const msg = err.message || err.response?.data?.error || (language === 'kn' ? 'ತಪ್ಪಾದ ಇಮೇಲ್ ಅಥವಾ ಪಾಸ್‌ವರ್ಡ್. ದಯವಿಟ್ಟು ಪರಿಶೀಲಿಸಿ.' : 'Invalid credentials. Please verify your email or password.');
      setErrorMsg(msg);
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (regPassword !== regConfirmPassword) {
      setErrorMsg(language === 'kn' ? 'ಪಾಸ್‌ವರ್ಡ್‌ಗಳು ಹೊಂದಾಣಿಕೆಯಾಗುತ್ತಿಲ್ಲ.' : 'Passwords do not match. Please re-enter.');
      return;
    }
    if (regPassword.length < 6) {
      setErrorMsg(language === 'kn' ? 'ಪಾಸ್‌ವರ್ಡ್ ಕನಿಷ್ಠ ೬ ಅಕ್ಷರಗಳನ್ನು ಹೊಂದಿರಬೇಕು.' : 'Password must be at least 6 characters long.');
      return;
    }

    const selectedWardObj = sortedWards.find(w => String(w.ward_number) === String(regWard));

    setLoading(true);
    try {
      const newUser = await register({
        name: regName,
        email: regEmail,
        phone: regPhone,
        password: regPassword,
        ward_id: selectedWardObj ? selectedWardObj.ward_id || selectedWardObj.ward_number : null,
        ward_name: selectedWardObj ? selectedWardObj.ward_name : 'Mysuru Resident'
      });

      if (newUser?.emailConfirmationPending) {
        setSuccessMsg(
          language === 'kn'
            ? 'ಖಾತೆ ಯಶಸ್ವಿಯಾಗಿ ರಚನೆಯಾಗಿದೆ! ದಯವಿಟ್ಟು ನಿಮ್ಮ ಇಮೇಲ್ ಪರಿಶೀಲಿಸಿ ಲಾಗಿನ್ ಮಾಡಿ.'
            : 'Registration received! Please check your email inbox to confirm your account, then sign in.'
        );
        setTimeout(() => {
          setAuthMode('login');
          setLoading(false);
        }, 2000);
      } else {
        setSuccessMsg(
          language === 'kn' 
            ? `ಖಾತೆ ಯಶಸ್ವಿಯಾಗಿ ರಚನೆಯಾಗಿದೆ! ಸ್ವಾಗತ, ${newUser.name}.` 
            : `Account created successfully! Welcome to Mysuru Civic Connect, ${newUser.name}.`
        );
        setTimeout(() => {
          routeByRole('citizen');
        }, 550);
      }
    } catch (err) {
      const msg = err.message || err.response?.data?.error || (language === 'kn' ? 'ನೋಂದಣಿ ವಿಫಲವಾಗಿದೆ. ದಯವಿಟ್ಟು ವಿವರಗಳನ್ನು ಪರಿಶೀಲಿಸಿ.' : 'Registration failed. Please check your information and try again.');
      setErrorMsg(msg);
      setLoading(false);
    }
  };

  const handlePreFill = (demoEmail, demoPass) => {
    setAuthMode('login');
    setLoginIdentifier(demoEmail);
    setLoginPassword(demoPass);
    setErrorMsg('');
  };

  const handleInstantLogin = async (demoEmail, demoPass) => {
    setAuthMode('login');
    setLoginIdentifier(demoEmail);
    setLoginPassword(demoPass);
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const loggedUser = await login(demoEmail, demoPass);
      setSuccessMsg(
        language === 'kn' 
          ? `ಸ್ವಾಗತ, ${loggedUser.name}! ಡೆಮೊ ಲಾಗಿನ್ ಸಕ್ರಿಯವಾಗಿದೆ.` 
          : `Welcome, ${loggedUser.name}! Instant demo login verified.`
      );
      setTimeout(() => {
        routeByRole(loggedUser.role);
      }, 400);
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to authenticate demo user.');
      setLoading(false);
    }
  };

  return (
    <div style={{ backgroundColor: '#faf6ec', minHeight: '100vh', padding: '40px 16px', color: '#1f241a' }}>
      <div className="container" style={{ maxWidth: '640px' }}>

        {/* Active Session Card if user is already logged in */}
        {user ? (
          <div className="card" style={{
            padding: '28px',
            backgroundColor: '#ffffff',
            borderColor: '#b8c9a3',
            boxShadow: '0 6px 24px rgba(75, 94, 40, 0.12)',
            marginBottom: '26px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
              <div style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                backgroundColor: '#edf4e4',
                color: '#4b5e28',
                border: '2px solid #4b5e28',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <UserCheck size={26} />
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#4b5e28', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {t('active_session')}
                </span>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1f241a', margin: '2px 0' }}>
                  {user.name}
                </h3>
                <div style={{ fontSize: '0.84rem', color: '#5e6654', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span>{user.email}</span>
                  {user.phone && <span>• {user.phone}</span>}
                  <span>•</span>
                  <strong style={{ color: '#b38328' }}>
                    {user.badge || user.department_name || (user.ward_name ? `Ward: ${user.ward_name}` : user.role)}
                  </strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                onClick={() => routeByRole(user.role)}
                className="btn btn-olive"
                style={{
                  flex: 1,
                  padding: '11px 18px',
                  fontSize: '0.92rem',
                  fontWeight: 800,
                  backgroundColor: '#4b5e28',
                  color: '#ffffff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <span>{user.role === 'citizen' ? (language === 'kn' ? 'ನನ್ನ ದೂರುಗಳು & ಪರಿಶೀಲನೆ' : 'My Complaints & Track') : t('go_to_dashboard')}</span>
                <ArrowRight size={16} />
              </button>

              <button
                onClick={logout}
                className="btn btn-outline"
                style={{
                  padding: '11px 16px',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  borderColor: '#fca5a5',
                  color: '#b91c1c',
                  backgroundColor: '#fff'
                }}
              >
                <LogOut size={16} /> {t('switch_account')}
              </button>
            </div>
          </div>
        ) : null}

        {/* Main Authentication Card */}
        <div className="card" style={{
          padding: '32px 28px',
          backgroundColor: '#ffffff',
          borderColor: '#e5dcbe',
          boxShadow: '0 4px 24px rgba(75, 94, 40, 0.08)'
        }}>

          {/* Mode Switcher Tabs */}
          <div style={{
            display: 'flex',
            backgroundColor: '#f6f1e2',
            padding: '4px',
            borderRadius: '10px',
            marginBottom: '24px',
            border: '1px solid #e2d7ba'
          }}>
            <button
              type="button"
              onClick={() => { setAuthMode('login'); setErrorMsg(''); }}
              style={{
                flex: 1,
                padding: '10px 14px',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                backgroundColor: authMode === 'login' ? '#ffffff' : 'transparent',
                color: authMode === 'login' ? '#3c4e1f' : '#68735d',
                boxShadow: authMode === 'login' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              <LogIn size={16} />
              <span>{language === 'kn' ? 'ಸೈನ್ ಇನ್ (ಲಾಗಿನ್)' : 'Sign In'}</span>
            </button>

            <button
              type="button"
              onClick={() => { setAuthMode('register'); setErrorMsg(''); }}
              style={{
                flex: 1,
                padding: '10px 14px',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                backgroundColor: authMode === 'register' ? '#ffffff' : 'transparent',
                color: authMode === 'register' ? '#3c4e1f' : '#68735d',
                boxShadow: authMode === 'register' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              <UserPlus size={16} />
              <span>{language === 'kn' ? 'ಹೊಸ ಖಾತೆ ರಚಿಸಿ (ನಾಗರಿಕ)' : 'Register / New Citizen'}</span>
            </button>
          </div>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '22px' }}>
            <div style={{
              width: '54px',
              height: '54px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #4b5e28, #b38328)',
              color: '#ffffff',
              border: '2px solid #d4af37',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px auto',
              boxShadow: '0 4px 12px rgba(75, 94, 40, 0.22)'
            }}>
              {authMode === 'login' ? <Lock size={26} /> : <UserPlus size={26} />}
            </div>
            
            <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1f241a', letterSpacing: '-0.02em', margin: 0 }}>
              {authMode === 'login' 
                ? (language === 'kn' ? 'ನಾಗರಿಕ & ಸಿಬ್ಬಂದಿ ಪೋರ್ಟಲ್ ಲಾಗಿನ್' : 'Sign In to Civic Portal')
                : (language === 'kn' ? 'ಹೊಸ ನಾಗರಿಕ ಖಾತೆ ನೋಂದಣಿ' : 'Register Citizen Account')}
            </h2>
            
            <p style={{ color: '#5e6654', fontSize: '0.85rem', marginTop: '4px' }}>
              {authMode === 'login'
                ? (language === 'kn' ? 'ಮೈಸೂರು ಮಹಾನಗರ ಪಾಲಿಕೆಯ ಅಧಿಕೃತ ನಾಗರಿಕ ಮತ್ತು ಸಿಬ್ಬಂದಿ ಪ್ರವೇಶ' : 'Official civic access for Mysuru residents, field officers & administrators')
                : (language === 'kn' ? 'ದೂರುಗಳನ್ನು ಸುಲಭವಾಗಿ ಸಲ್ಲಿಸಲು ಮತ್ತು ನೇರವಾಗಿ ಪರಿಶೀಲಿಸಲು ನೋಂದಾಯಿಸಿ' : 'Join Mysuru Civic Connect to track your complaints and receive resolution alerts')}
            </p>
          </div>

          {/* Success Banner */}
          {successMsg && (
            <div style={{
              backgroundColor: '#f0fdf4',
              border: '1.5px solid #86efac',
              color: '#166534',
              padding: '12px 16px',
              borderRadius: '8px',
              fontSize: '0.88rem',
              fontWeight: 600,
              marginBottom: '18px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <CheckCircle2 size={18} color="#16a34a" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div style={{
              backgroundColor: '#fef2f2',
              border: '1.5px solid #fca5a5',
              color: '#b91c1c',
              padding: '12px 16px',
              borderRadius: '8px',
              fontSize: '0.86rem',
              fontWeight: 600,
              marginBottom: '18px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Shield size={18} color="#dc2626" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* TAB 1: SIGN IN FORM */}
          {authMode === 'login' ? (
            <form onSubmit={handleLoginSubmit}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ color: '#3f4738', fontWeight: 700, fontSize: '0.85rem' }}>
                  {language === 'kn' ? 'ಇಮೇಲ್, ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಅಥವಾ ಸಿಬ್ಬಂದಿ ಗುರುತು' : 'Email Address, Mobile Number, or Staff ID'}
                </label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. citizen@example.com, 9880012345, admin@mcc.gov.in"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    style={{
                      padding: '12px 14px',
                      fontSize: '0.94rem',
                      borderRadius: '8px',
                      borderColor: '#dcd1b5'
                    }}
                  />
                </div>
                <div style={{ fontSize: '0.74rem', color: '#6e7762', marginTop: '4px' }}>
                  {language === 'kn' ? 'ಸಿಬ್ಬಂದಿ ಅಡ್ಡಹೆಸರುಗಳು: admin, roads, swm, elec, water, corporator' : 'Staff aliases accepted: admin, roads, swm, elec, water, corporator'}
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label className="form-label" style={{ color: '#3f4738', fontWeight: 700, fontSize: '0.85rem', margin: 0 }}>
                    {language === 'kn' ? 'ಪಾಸ್‌ವರ್ಡ್' : 'Password'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '0.76rem',
                      color: '#4b5e28',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontWeight: 700
                    }}
                  >
                    {showLoginPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    <span>{showLoginPassword ? (language === 'kn' ? 'ಮರೆಮಾಡಿ' : 'Hide') : (language === 'kn' ? 'ತೋರಿಸಿ' : 'Show')}</span>
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <input 
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    className="form-input"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    style={{
                      padding: '12px 14px',
                      fontSize: '0.94rem',
                      borderRadius: '8px',
                      borderColor: '#dcd1b5'
                    }}
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loading} 
                className="btn btn-olive"
                style={{
                  width: '100%',
                  padding: '13px',
                  fontSize: '1rem',
                  fontWeight: 800,
                  backgroundColor: '#4b5e28',
                  color: '#ffffff',
                  boxShadow: '0 2px 8px rgba(75, 94, 40, 0.2)'
                }}
              >
                {loading 
                  ? (language === 'kn' ? 'ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ...' : 'Signing in...') 
                  : (language === 'kn' ? 'ಪೋರ್ಟಲ್‌ಗೆ ಸೈನ್ ಇನ್ ಮಾಡಿ' : 'Sign In to Portal')}
              </button>

              <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.85rem', color: '#5e6654' }}>
                {language === 'kn' ? 'ಹೊಸ ನಾಗರಿಕರೇ?' : 'New to Mysuru Civic Connect?'}{' '}
                <button
                  type="button"
                  onClick={() => { setAuthMode('register'); setErrorMsg(''); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#4b5e28',
                    fontWeight: 800,
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  {language === 'kn' ? 'ಇಲ್ಲಿ ನೋಂದಾಯಿಸಿ' : 'Create a Citizen Account'}
                </button>
              </div>
            </form>
          ) : (
            /* TAB 2: REGISTER CITIZEN FORM */
            <form onSubmit={handleRegisterSubmit}>
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label className="form-label" style={{ color: '#3f4738', fontWeight: 700, fontSize: '0.85rem' }}>
                  {language === 'kn' ? 'ಪೂರ್ಣ ಹೆಸರು *' : 'Full Name *'}
                </label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Ramesh Kumar"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    style={{ padding: '11px 14px', fontSize: '0.92rem', borderRadius: '8px', borderColor: '#dcd1b5' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div className="form-group">
                  <label className="form-label" style={{ color: '#3f4738', fontWeight: 700, fontSize: '0.85rem' }}>
                    {language === 'kn' ? 'ಇಮೇಲ್ ವಿಳಾಸ *' : 'Email Address *'}
                  </label>
                  <input 
                    type="email"
                    required
                    className="form-input"
                    placeholder="name@example.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    style={{ padding: '11px 14px', fontSize: '0.92rem', borderRadius: '8px', borderColor: '#dcd1b5' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ color: '#3f4738', fontWeight: 700, fontSize: '0.85rem' }}>
                    {language === 'kn' ? 'ಮೊಬೈಲ್ ಸಂಖ್ಯೆ *' : 'Mobile Number (10 digits) *'}
                  </label>
                  <input 
                    type="tel"
                    required
                    className="form-input"
                    placeholder="9880012345"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    style={{ padding: '11px 14px', fontSize: '0.92rem', borderRadius: '8px', borderColor: '#dcd1b5' }}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label className="form-label" style={{ color: '#3f4738', fontWeight: 700, fontSize: '0.85rem' }}>
                  {language === 'kn' ? 'ನಿಮ್ಮ ಮೈಸೂರು ವಾರ್ಡ್ (ಐಚ್ಛಿಕ)' : 'Primary Mysuru Municipal Ward (Optional)'}
                </label>
                <select
                  value={regWard}
                  onChange={(e) => setRegWard(e.target.value)}
                  className="form-select"
                  style={{ padding: '11px 14px', fontSize: '0.92rem', borderRadius: '8px', borderColor: '#dcd1b5' }}
                >
                  <option value="">{language === 'kn' ? '-- ವಾರ್ಡ್ ಆಯ್ಕೆಮಾಡಿ (ಐಚ್ಛಿಕ) --' : '-- Select Your Ward (Optional) --'}</option>
                  {sortedWards.map(w => (
                    <option key={w.ward_number} value={w.ward_number}>
                      Ward {w.ward_number} - {w.ward_name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label className="form-label" style={{ color: '#3f4738', fontWeight: 700, fontSize: '0.85rem', margin: 0 }}>
                      {language === 'kn' ? 'ಪಾಸ್‌ವರ್ಡ್ *' : 'Password *'}
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      style={{ background: 'none', border: 'none', fontSize: '0.72rem', color: '#4b5e28', cursor: 'pointer', fontWeight: 700 }}
                    >
                      {showRegPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <input 
                    type={showRegPassword ? 'text' : 'password'}
                    required
                    placeholder="Min 6 chars"
                    className="form-input"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    style={{ padding: '11px 14px', fontSize: '0.92rem', borderRadius: '8px', borderColor: '#dcd1b5' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ color: '#3f4738', fontWeight: 700, fontSize: '0.85rem' }}>
                    {language === 'kn' ? 'ದೃಢೀಕರಿಸಿ *' : 'Confirm Password *'}
                  </label>
                  <input 
                    type={showRegPassword ? 'text' : 'password'}
                    required
                    placeholder="Repeat password"
                    className="form-input"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    style={{ padding: '11px 14px', fontSize: '0.92rem', borderRadius: '8px', borderColor: '#dcd1b5' }}
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loading} 
                className="btn btn-olive"
                style={{
                  width: '100%',
                  padding: '13px',
                  fontSize: '1rem',
                  fontWeight: 800,
                  backgroundColor: '#4b5e28',
                  color: '#ffffff',
                  boxShadow: '0 2px 8px rgba(75, 94, 40, 0.2)'
                }}
              >
                {loading 
                  ? (language === 'kn' ? 'ಖಾತೆ ರಚಿಸಲಾಗುತ್ತಿದೆ...' : 'Registering Account...') 
                  : (language === 'kn' ? 'ನಾಗರಿಕ ಖಾತೆ ರಚಿಸಿ & ಸೈನ್ ಇನ್ ಮಾಡಿ' : 'Create Citizen Account & Sign In')}
              </button>

              <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.85rem', color: '#5e6654' }}>
                {language === 'kn' ? 'ಈಗಾಗಲೇ ಖಾತೆ ಹೊಂದಿದ್ದೀರಾ?' : 'Already have an account?'}{' '}
                <button
                  type="button"
                  onClick={() => { setAuthMode('login'); setErrorMsg(''); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#4b5e28',
                    fontWeight: 800,
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  {language === 'kn' ? 'ಇಲ್ಲಿ ಸೈನ್ ಇನ್ ಮಾಡಿ' : 'Sign in here'}
                </button>
              </div>
            </form>
          )}

          {/* Citizen Benefits Box */}
          <div style={{
            marginTop: '22px',
            padding: '12px 16px',
            backgroundColor: '#fbf8f0',
            border: '1px solid #e2d7ba',
            borderRadius: '9px',
            fontSize: '0.78rem',
            color: '#5b6451',
            lineHeight: 1.5
          }}>
            <strong style={{ color: '#3c4e1f' }}>🏛️ {language === 'kn' ? 'ನಾಗರಿಕ ನೋಂದಣಿಯ ಪ್ರಯೋಜನಗಳು:' : 'Resident Privileges:'}</strong>{' '}
            {language === 'kn' 
              ? 'ದೂರು ಸಲ್ಲಿಸುವಾಗ ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಸ್ವಯಂ-ಭರ್ತಿ ಮಾಡಲಾಗುತ್ತದೆ, ನಿಮ್ಮ ವಾರ್ಡ್‌ನ ಎಲ್ಲಾ ದೂರುಗಳನ್ನು ಟ್ರ್ಯಾಕ್ ಮಾಡಬಹುದು ಮತ್ತು ಅಧಿಕಾರಿಗಳಿಂದ ತ್ವರಿತ ಪರಿಹಾರ ಪರಿಶೀಲನೆ ಪಡೆಯಬಹುದು.'
              : 'Registered citizens enjoy 1-click grievance filing, auto-filled contact verification, real-time resolution updates, and direct ward corporator visibility.'}
          </div>

          {/* Municipal Staff Demo / Quick Access Section */}
          <div style={{ marginTop: '28px', borderTop: '1.5px solid #e8dfc9', paddingTop: '20px' }}>
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#b38328'
                }}></span>
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#4b5e28', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {language === 'kn' ? '⚡ ಅಧಿಕೃತ ಸಿಬ್ಬಂದಿ ಡೆಮೊ ಲಾಗಿನ್' : '⚡ Municipal Staff & Official Demo Access'}
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6e7762', marginTop: '2px' }}>
                {language === 'kn' 
                  ? 'ಪಾಲಿಕೆ ಇಲಾಖೆಗಳು, ಇಂಜಿನಿಯರ್‌ಗಳು ಮತ್ತು ಕಾರ್ಪೊರೇಟರ್‌ಗಳ ಪರೀಕ್ಷಾರ್ಥ ೧-ಕ್ಲಿಕ್ ಲಾಗಿನ್' 
                  : '1-click access to test departmental dispatch boards, engineer verification, and corporator metrics:'}
              </div>
            </div>

            {/* List of Pre-Seeded Official Staff Roles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              
              {/* Central Administrator Card */}
              <div style={{
                padding: '12px 14px',
                backgroundColor: '#fbf8f0',
                border: '1.5px solid #d4af37',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                boxShadow: '0 2px 6px rgba(212, 175, 55, 0.12)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '8px',
                    backgroundColor: '#d4af37',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '1rem'
                  }}>
                    🏛️
                  </div>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#8c6b16' }}>
                      MCC Central Administrator
                    </div>
                    <div style={{ fontSize: '0.73rem', color: '#5e6654' }}>
                      admin@mcc.gov.in • City oversight & verification queue
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => handleInstantLogin('admin@mcc.gov.in', 'Admin@123')}
                    disabled={loading}
                    className="btn btn-olive"
                    style={{
                      padding: '7px 12px',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      backgroundColor: '#4b5e28',
                      color: '#ffffff'
                    }}
                  >
                    ⚡ Instant
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePreFill('admin@mcc.gov.in', 'Admin@123')}
                    className="btn btn-outline"
                    style={{
                      padding: '7px 10px',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      backgroundColor: '#ffffff',
                      borderColor: '#dcd1b5',
                      color: '#4b5e28'
                    }}
                  >
                    Fill
                  </button>
                </div>
              </div>

              {/* Department Officers Grid */}
              <div style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                color: '#6e7762',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginTop: '6px',
                marginBottom: '2px'
              }}>
                {language === 'kn' ? 'ಕ್ಷೇತ್ರ ಇಂಜಿನಿಯರ್‌ಗಳು & ಇಲಾಖಾ ಅಧಿಕಾರಿಗಳು' : 'Department Field Officers & Engineers'}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                
                {/* Roads Officer */}
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: '#fcfaf4',
                  border: '1.5px solid #e5dcbe',
                  borderRadius: '9px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}>
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#3e4e21', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>🛣️</span>
                      <span>Roads & Civil (EE)</span>
                    </div>
                    <div style={{ fontSize: '0.70rem', color: '#6e7762', marginTop: '2px' }}>
                      roads.officer@mcc.gov.in
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => handleInstantLogin('roads.officer@mcc.gov.in', 'Officer@123')}
                      disabled={loading}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        backgroundColor: '#4b5e28',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      ⚡ Instant
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePreFill('roads.officer@mcc.gov.in', 'Officer@123')}
                      style={{
                        padding: '6px 8px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        backgroundColor: '#ffffff',
                        border: '1px solid #dcd1b5',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        color: '#4b5e28'
                      }}
                    >
                      Fill
                    </button>
                  </div>
                </div>

                {/* SWM Officer */}
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: '#fcfaf4',
                  border: '1.5px solid #e5dcbe',
                  borderRadius: '9px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}>
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#3e4e21', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>🗑️</span>
                      <span>Health & SWM</span>
                    </div>
                    <div style={{ fontSize: '0.70rem', color: '#6e7762', marginTop: '2px' }}>
                      swm.officer@mcc.gov.in
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => handleInstantLogin('swm.officer@mcc.gov.in', 'Officer@123')}
                      disabled={loading}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        backgroundColor: '#4b5e28',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      ⚡ Instant
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePreFill('swm.officer@mcc.gov.in', 'Officer@123')}
                      style={{
                        padding: '6px 8px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        backgroundColor: '#ffffff',
                        border: '1px solid #dcd1b5',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        color: '#4b5e28'
                      }}
                    >
                      Fill
                    </button>
                  </div>
                </div>

                {/* Electrical Officer */}
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: '#fcfaf4',
                  border: '1.5px solid #e5dcbe',
                  borderRadius: '9px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}>
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#8c6b16', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>💡</span>
                      <span>Lighting & Elec (AEE)</span>
                    </div>
                    <div style={{ fontSize: '0.70rem', color: '#6e7762', marginTop: '2px' }}>
                      elec.officer@mcc.gov.in
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => handleInstantLogin('elec.officer@mcc.gov.in', 'Officer@123')}
                      disabled={loading}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        backgroundColor: '#4b5e28',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      ⚡ Instant
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePreFill('elec.officer@mcc.gov.in', 'Officer@123')}
                      style={{
                        padding: '6px 8px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        backgroundColor: '#ffffff',
                        border: '1px solid #dcd1b5',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        color: '#4b5e28'
                      }}
                    >
                      Fill
                    </button>
                  </div>
                </div>

                {/* Water Supply Officer */}
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: '#fcfaf4',
                  border: '1.5px solid #e5dcbe',
                  borderRadius: '9px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}>
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#8c6b16', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>💧</span>
                      <span>Water & Drainage (AEE)</span>
                    </div>
                    <div style={{ fontSize: '0.70rem', color: '#6e7762', marginTop: '2px' }}>
                      water.officer@mcc.gov.in
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => handleInstantLogin('water.officer@mcc.gov.in', 'Officer@123')}
                      disabled={loading}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        backgroundColor: '#4b5e28',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      ⚡ Instant
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePreFill('water.officer@mcc.gov.in', 'Officer@123')}
                      style={{
                        padding: '6px 8px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        backgroundColor: '#ffffff',
                        border: '1px solid #dcd1b5',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        color: '#4b5e28'
                      }}
                    >
                      Fill
                    </button>
                  </div>
                </div>
              </div>

              {/* Elected Corporators */}
              <div style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                color: '#6e7762',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginTop: '8px',
                marginBottom: '2px'
              }}>
                {language === 'kn' ? 'ಚುನಾಯಿತ ಜನಪ್ರತಿನಿಧಿಗಳು (ಕಾರ್ಪೊರೇಟರ್‌ಗಳು)' : 'Elected Ward Representatives (Corporators)'}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: '#fcfaf4',
                  border: '1.5px solid #e5dcbe',
                  borderRadius: '9px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}>
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#8c6b16', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>🏛️</span>
                      <span>Ward 1 (Agrahara)</span>
                    </div>
                    <div style={{ fontSize: '0.70rem', color: '#6e7762', marginTop: '2px' }}>
                      ward1.corporator@mcc.gov.in
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => handleInstantLogin('ward1.corporator@mcc.gov.in', 'Corporator@123')}
                      disabled={loading}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        backgroundColor: '#b38328',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      ⚡ Instant
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePreFill('ward1.corporator@mcc.gov.in', 'Corporator@123')}
                      style={{
                        padding: '6px 8px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        backgroundColor: '#ffffff',
                        border: '1px solid #dcd1b5',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        color: '#8c6b16'
                      }}
                    >
                      Fill
                    </button>
                  </div>
                </div>

                <div style={{
                  padding: '10px 12px',
                  backgroundColor: '#fcfaf4',
                  border: '1.5px solid #e5dcbe',
                  borderRadius: '9px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}>
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#8c6b16', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>🏛️</span>
                      <span>Ward 12 (J P Nagar)</span>
                    </div>
                    <div style={{ fontSize: '0.70rem', color: '#6e7762', marginTop: '2px' }}>
                      ward12.corporator@mcc.gov.in
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => handleInstantLogin('ward12.corporator@mcc.gov.in', 'Corporator@123')}
                      disabled={loading}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        backgroundColor: '#b38328',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      ⚡ Instant
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePreFill('ward12.corporator@mcc.gov.in', 'Corporator@123')}
                      style={{
                        padding: '6px 8px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        backgroundColor: '#ffffff',
                        border: '1px solid #dcd1b5',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        color: '#8c6b16'
                      }}
                    >
                      Fill
                    </button>
                  </div>
                </div>
              </div>

              {/* Citizen Demo Account */}
              <div style={{
                marginTop: '6px',
                padding: '10px 12px',
                backgroundColor: '#f4f8ee',
                border: '1.5px solid #b8cda2',
                borderRadius: '9px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px'
              }}>
                <div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#2d3e17', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>👤</span>
                    <span>Sample Citizen Account (Praveen Kumar)</span>
                  </div>
                  <div style={{ fontSize: '0.70rem', color: '#556643', marginTop: '2px' }}>
                    citizen@example.com • Ward 12 Resident
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => handleInstantLogin('citizen@example.com', 'Citizen@123')}
                    disabled={loading}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      backgroundColor: '#4b5e28',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    ⚡ Instant
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePreFill('citizen@example.com', 'Citizen@123')}
                    style={{
                      padding: '6px 10px',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      backgroundColor: '#ffffff',
                      border: '1px solid #b8cda2',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      color: '#2d3e17'
                    }}
                  >
                    Fill
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

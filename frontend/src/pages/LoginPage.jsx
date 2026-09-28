import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { APP_VERSION } from '../services/version';

export default function LoginPage() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Already logged in — redirect
  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await login(username, password);
      // AuthContext will update user, triggering redirect
    } catch (err) {
      setError(err.message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">🏥</div>
        </div>
        <h2 className="login-title">RBH Virtual Hospital</h2>
        <p className="login-subtitle">เข้าสู่ระบบหลังบ้าน</p>

        {error && (
          <div className="login-error" id="login-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-username">
              ชื่อผู้ใช้งาน
            </label>
            <input
              id="login-username"
              className="form-input"
              type="text"
              placeholder="กรอกชื่อผู้ใช้งาน"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              maxLength={100}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">
              รหัสผ่าน
            </label>
            <input
              id="login-password"
              className="form-input"
              type="password"
              placeholder="กรอกรหัสผ่าน"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              maxLength={128}
              required
            />
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={submitting}
            id="btn-login"
          >
            {submitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>
        <div className="login-footer-version">
          v{APP_VERSION}
        </div>
      </div>
    </div>
  );
}

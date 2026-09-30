import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { APP_VERSION, getVersionStatus, subscribeVersion, performReload } from '../services/version';
import { api } from '../api/client';
import VersionModal from './VersionModal';
import './Sidebar.css';

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout, isAdmin, canAccess } = useAuth();
  const [versionStatus, setVersionStatus] = useState(getVersionStatus());
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    // Subscribe to version changes (e.g. from API responses)
    const unsubscribe = subscribeVersion((status) => {
      setVersionStatus({ ...status });
    });

    // Check version once on mount
    api.getSystemVersion().catch(() => {});

    // Periodic check every 60 seconds
    const interval = setInterval(() => {
      api.getSystemVersion().catch(() => {});
    }, 60000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const initial = user?.displayName?.charAt(0)?.toUpperCase() || user?.name?.charAt(0)?.toUpperCase() || '?';

  const handleNavClick = () => {
    if (onClose) onClose();
  };

  const getRoleLabel = () => {
    if (user?.role_name) {
      return `${user.role_icon || '🛡️'} ${user.role_name}`;
    }
    switch (user?.role) {
      case 'admin':
        return '🛡️ ผู้ดูแลระบบ';
      case 'clinic_manager':
        return '🏥 ผู้จัดการคลินิก';
      case 'medical_records':
        return '📋 เจ้าหน้าที่เวชระเบียน';
      case 'operator':
        return '🎧 เจ้าหน้าที่คัดกรอง';
      case 'pharmacy':
        return '💊 ห้องยา';
      case 'finance':
        return '💰 การเงิน';
      default:
        return user?.role || 'ผู้ใช้งาน';
    }
  };

  const hasLineOa = isAdmin || canAccess('today_registrations') || canAccess('all_registrations');
  const hasTelemed = isAdmin || canAccess('telemed_dashboard') || canAccess('telemed_cases') || canAccess('telemed_appointments') || canAccess('prescreening');
  const hasPreScreening = isAdmin || canAccess('request_telemed_register') || canAccess('request_telemed_receive') || canAccess('request_telemed_doctor') || canAccess('request_telemed_pharmacist') || canAccess('request_telemed_approved') || canAccess('request_telemed_all');
  const hasTelemedToday = isAdmin || canAccess('telemed_today_appointments') || canAccess('telemed_today_pharmacy') || canAccess('telemed_today_finance');
  const hasSettings = isAdmin || canAccess('settings');

  return (
    <>
      {/* Mobile Backdrop */}
      <div 
        className={`sidebar-backdrop ${isOpen ? 'is-active' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className={`sidebar app-sidebar ${isOpen ? 'is-open' : ''}`} id="sidebar">
        {/* Brand Header */}
        <div className="sidebar-header-box">
          <div className="sidebar-brand-wrapper">
            <div className="sidebar-brand-left">
              <div className="sidebar-logo-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 6v12M6 12h12" />
                </svg>
              </div>
              <div className="sidebar-brand-titles">
                <h1 className="sidebar-main-title">RBH Virtual Hospital</h1>
                <div className="sidebar-sub-row">
                  <button
                    type="button"
                    className={`sidebar-version-chip ${versionStatus.hasNewVersion ? 'has-update' : ''}`}
                    onClick={() => {
                      if (versionStatus.hasNewVersion) {
                        performReload();
                      } else {
                        setIsModalOpen(true);
                      }
                    }}
                    title={
                      versionStatus.hasNewVersion
                        ? `ตรวจพบเวอร์ชันใหม่ (v${versionStatus.latestServerVersion}) คลิกเพื่ออัปเดตทันที`
                        : `เวอร์ชัน: v${APP_VERSION} (คลิกเพื่อดูรายละเอียด)`
                    }
                  >
                    <span>v{APP_VERSION}</span>
                    {versionStatus.hasNewVersion && (
                      <span style={{ color: '#d97706', display: 'inline-flex', alignItems: 'center' }}>
                        <svg className="spin-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                        </svg>
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile Close Button */}
            <button
              type="button"
              className="sidebar-mobile-close"
              onClick={onClose}
              aria-label="ปิดเมนู"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable Navigation */}
        <nav className="sidebar-scrollable-nav">
          {/* Section: LINE OA */}
          {hasLineOa && (
            <>
              <div className="sidebar-group-title">LINE OA</div>

              {(isAdmin || canAccess('today_registrations')) && (
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
                  onClick={handleNavClick}
                  id="nav-today-registrations"
                >
                  <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                    <polyline points="9 16 12 19 16 14" />
                  </svg>
                  <span>ลงทะเบียนวันนี้</span>
                </NavLink>
              )}

              {(isAdmin || canAccess('all_registrations')) && (
                <NavLink
                  to="/all"
                  className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
                  onClick={handleNavClick}
                  id="nav-all-registrations"
                >
                  <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <span>ข้อมูลลงทะเบียนทั้งหมด</span>
                </NavLink>
              )}
            </>
          )}

          {/* Section: Telemed */}
          {hasTelemed && (
            <>
              <div className="sidebar-group-title">Telemed</div>

              {(isAdmin || canAccess('telemed_dashboard')) && (
                <NavLink
                  to="/telemed-dashboard"
                  className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
                  onClick={handleNavClick}
                  id="nav-telemed-dashboard"
                >
                  <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                  <span>Dashboard Telemed</span>
                </NavLink>
              )}

              {(isAdmin || canAccess('telemed_cases')) && (
                <NavLink
                  to="/telemed-with-doctor"
                  className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
                  onClick={handleNavClick}
                  id="nav-telemed-cases"
                >
                  <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                  <span>Case Telemed วันนี้</span>
                </NavLink>
              )}

              {(isAdmin || canAccess('telemed_appointments')) && (
                <NavLink
                  to="/telemed-appointments"
                  className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
                  onClick={handleNavClick}
                  id="nav-telemed-appointments"
                >
                  <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>ใบนัด Telemed วันนี้</span>
                </NavLink>
              )}

              {(isAdmin || canAccess('prescreening')) && (
                <NavLink
                  to="/prescreening"
                  className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
                  onClick={handleNavClick}
                  id="nav-prescreening"
                >
                  <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                    <path d="M9 14l2 2 4-4" />
                  </svg>
                  <span>ข้อมูลคัดกรอง</span>
                </NavLink>
              )}
            </>
          )}

          {/* Section: Pre-screening (คำขอรับยา) */}
          {hasPreScreening && (
            <>
              <div className="sidebar-group-title">Pre-screening (คำขอรับยา)</div>

              {(isAdmin || canAccess('request_telemed_register')) && (
                <NavLink
                  to="/request-telemed/register"
                  className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
                  onClick={handleNavClick}
                  id="nav-request-telemed-register"
                >
                  <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <line x1="20" y1="8" x2="20" y2="14" />
                    <line x1="23" y1="11" x2="17" y2="11" />
                  </svg>
                  <span>ลงทะเบียน</span>
                </NavLink>
              )}

              {(isAdmin || canAccess('request_telemed_receive')) && (
                <NavLink
                  to="/request-telemed/pending-receive"
                  className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
                  onClick={handleNavClick}
                  id="nav-request-telemed-receive"
                >
                  <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                  </svg>
                  <span>รอรับเรื่อง</span>
                </NavLink>
              )}

              {(isAdmin || canAccess('request_telemed_doctor')) && (
                <NavLink
                  to="/request-telemed/pending-doctor"
                  className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
                  onClick={handleNavClick}
                  id="nav-request-telemed-doctor"
                >
                  <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12h3l3 8 4-16 3 8h4" />
                  </svg>
                  <span>รอปรึกษาแพทย์</span>
                </NavLink>
              )}

              {(isAdmin || canAccess('request_telemed_pharmacist')) && (
                <NavLink
                  to="/request-telemed/pharmacist"
                  className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
                  onClick={handleNavClick}
                  id="nav-request-telemed-pharmacist"
                >
                  <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <path d="M12 7v10" />
                    <path d="M7 12h10" />
                  </svg>
                  <span>รอปรึกษาเภสัช</span>
                </NavLink>
              )}

              {(isAdmin || canAccess('request_telemed_approved')) && (
                <NavLink
                  to="/request-telemed/approved"
                  className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
                  onClick={handleNavClick}
                  id="nav-request-telemed-approved"
                >
                  <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <span>รายการที่อนุมัติ</span>
                </NavLink>
              )}

              {(isAdmin || canAccess('request_telemed_all')) && (
                <NavLink
                  to="/request-telemed/all"
                  className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
                  onClick={handleNavClick}
                  id="nav-request-telemed-all"
                >
                  <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                  <span>ผู้ยื่นความจำนงทั้งหมด</span>
                </NavLink>
              )}
            </>
          )}

          {/* Section: Telemed Today (วันนัดจริง) */}
          {hasTelemedToday && (
            <>
              <div className="sidebar-group-title">Telemed Today (วันนัดจริง)</div>

              {(isAdmin || canAccess('telemed_today_appointments')) && (
                <NavLink
                  to="/telemed-today/appointments"
                  className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
                  onClick={handleNavClick}
                  id="nav-telemed-today-appointments"
                >
                  <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>“รับยาไม่พบแพทย์” วันนี้</span>
                </NavLink>
              )}

              {(isAdmin || canAccess('telemed_today_pharmacy')) && (
                <NavLink
                  to="/telemed-today/pharmacy"
                  className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
                  onClick={handleNavClick}
                  id="nav-telemed-today-pharmacy"
                >
                  <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
                    <path d="m8.5 8.5 7 7" />
                  </svg>
                  <span>ห้องยา</span>
                </NavLink>
              )}

              {(isAdmin || canAccess('telemed_today_finance')) && (
                <NavLink
                  to="/telemed-today/finance"
                  className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
                  onClick={handleNavClick}
                  id="nav-telemed-today-finance"
                >
                  <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                  <span>การเงิน</span>
                </NavLink>
              )}
            </>
          )}

          {/* Section: ตั้งค่า */}
          {hasSettings && (
            <>
              <div className="sidebar-group-title">ตั้งค่า</div>
              <NavLink
                to="/settings"
                className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
                onClick={handleNavClick}
                id="nav-settings"
              >
                <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                <span>ตั้งค่าระบบ</span>
              </NavLink>
            </>
          )}
        </nav>

        {/* Footer — User + Logout */}
        <div className="sidebar-bottom-card">
          <div className="sidebar-user-block">
            <div className="sidebar-avatar-circle">{initial}</div>
            <div className="sidebar-user-texts">
              <span className="sidebar-user-fullname">{user?.displayName || user?.name || user?.username}</span>
              <span className="sidebar-role-pill">
                {getRoleLabel()}
              </span>
            </div>
          </div>
          <button
            className="sidebar-btn-signout"
            onClick={logout}
            type="button"
            id="btn-logout"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            ออกจากระบบ
          </button>
        </div>
      </aside>

      <VersionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        versionStatus={versionStatus}
      />
    </>
  );
}

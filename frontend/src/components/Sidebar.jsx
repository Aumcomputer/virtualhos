import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { APP_VERSION, getVersionStatus, subscribeVersion, performReload } from '../services/version';
import { api } from '../api/client';
import VersionModal from './VersionModal';

export default function Sidebar() {
  const { user, logout, isAdmin } = useAuth();
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

  return (
    <>
      <aside className="sidebar" id="sidebar">
        {/* Brand */}
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon">🏥</div>
            <div className="sidebar-brand-text">
              <h1>RBH Virtual Hospital</h1>
              <div className="sidebar-subtitle-row">
                <span>ระบบหลังบ้าน</span>
                <button
                  type="button"
                  className={`version-badge-btn ${versionStatus.hasNewVersion ? 'has-update' : ''}`}
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
                  <span className="version-tag">v{APP_VERSION}</span>
                  {versionStatus.hasNewVersion && (
                    <span className="version-update-tag">
                      <svg className="spin-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                      </svg>
                      อัปเดต
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="sidebar-section-label">LINE OA</div>

        <NavLink
          to="/"
          end
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          id="nav-today-registrations"
        >
          <span className="nav-icon">📅</span>
          ลงทะเบียนวันนี้
        </NavLink>

        {isAdmin && (
          <NavLink
            to="/all"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            id="nav-all-registrations"
          >
            <span className="nav-icon">📋</span>
            ข้อมูลลงทะเบียนทั้งหมด
          </NavLink>
        )}

        <div className="sidebar-section-label">Telemed</div>

        <NavLink
          to="/telemed-dashboard"
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          id="nav-telemed-dashboard"
        >
          <span className="nav-icon">📊</span>
          Dashboard Telemed
        </NavLink>

        <NavLink
          to="/telemed-with-doctor"
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          id="nav-telemed-cases"
        >
          <span className="nav-icon">🏥</span>
          Case Telemed วันนี้
        </NavLink>

        <NavLink
          to="/telemed-appointments"
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          id="nav-telemed-appointments"
        >
          <span className="nav-icon">📅</span>
          ใบนัด Telemed วันนี้
        </NavLink>

        <NavLink
          to="/prescreening"
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          id="nav-prescreening"
        >
          <span className="nav-icon">📋</span>
          ข้อมูลคัดกรอง
        </NavLink>

        <div className="sidebar-section-label">Request Telemed</div>

        <NavLink
          to="/request-telemed/register"
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          id="nav-request-telemed-register"
        >
          <span className="nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
          </span>
          ลงทะเบียน
        </NavLink>

        <NavLink
          to="/request-telemed/pending-receive"
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          id="nav-request-telemed-receive"
        >
          <span className="nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
              <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
            </svg>
          </span>
          รอรับเรื่อง
        </NavLink>

        <NavLink
          to="/request-telemed/pending-doctor"
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          id="nav-request-telemed-doctor"
        >
          <span className="nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h3l3 8 4-16 3 8h4" />
            </svg>
          </span>
          รอปรึกษาแพทย์
        </NavLink>

        <NavLink
          to="/request-telemed/pharmacist"
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          id="nav-request-telemed-pharmacist"
        >
          <span className="nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M12 7v10" />
              <path d="M7 12h10" />
            </svg>
          </span>
          เภสัชกร
        </NavLink>

        <NavLink
          to="/request-telemed/approved"
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          id="nav-request-telemed-approved"
        >
          <span className="nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </span>
          รายการที่อนุมัติ
        </NavLink>

        <NavLink
          to="/request-telemed/all"
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          id="nav-request-telemed-all"
        >
          <span className="nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </span>
          ผู้ยื่นความจำนงทั้งหมด
        </NavLink>

        <NavLink
          to="/request-telemed/today"
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          id="nav-request-telemed-today"
        >
          <span className="nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <polyline points="9 15 12 12 15 15" />
            </svg>
          </span>
          &ldquo;รับยาไม่พบแพทย์&rdquo;วันนี้
        </NavLink>

        {isAdmin && (
          <>
            <div className="sidebar-section-label">ตั้งค่า</div>
            <NavLink
              to="/settings"
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              id="nav-settings"
            >
              <span className="nav-icon">⚙️</span>
              ตั้งค่าผู้ใช้งาน
            </NavLink>
          </>
        )}
      </nav>

      {/* Footer — User + Logout */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">{initial}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.displayName || user?.name}</div>
            <div className="sidebar-user-role">
              {user?.role === 'admin' ? 'Admin' : 'Viewer'}
            </div>
          </div>
        </div>
        <button
          className="btn-logout"
          onClick={logout}
          type="button"
          id="btn-logout"
        >
          <span>🚪</span>
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

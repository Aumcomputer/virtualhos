import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Sidebar() {
  const { user, logout, isAdmin } = useAuth();

  const initial = user?.displayName?.charAt(0)?.toUpperCase() || user?.name?.charAt(0)?.toUpperCase() || '?';

  return (
    <aside className="sidebar" id="sidebar">
      {/* Brand */}
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">🏥</div>
          <div className="sidebar-brand-text">
            <h1>RBH Virtual Hospital</h1>
            <span>ระบบหลังบ้าน</span>
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
          to="/request-telemed"
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          id="nav-request-telemed"
        >
          <span className="nav-icon">📦</span>
          รายชื่อผู้ยื่นความจำนงทั้งหมด
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
  );
}

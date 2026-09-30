import { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { getVersionStatus, subscribeVersion, performReload } from '../services/version';

export default function Layout() {
  const [versionStatus, setVersionStatus] = useState(getVersionStatus());
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const lastPathnameRef = useRef(location.pathname);

  useEffect(() => {
    return subscribeVersion((status) => {
      setVersionStatus({ ...status });
    });
  }, []);

  // Close sidebar on page change
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  // Auto reload when navigating to another page if a new version is detected
  useEffect(() => {
    if (versionStatus.hasNewVersion) {
      if (lastPathnameRef.current !== location.pathname) {
        // User changed page -> hard reload seamlessly to load fresh frontend bundle
        performReload();
      }
    } else {
      lastPathnameRef.current = location.pathname;
    }
  }, [location.pathname, versionStatus.hasNewVersion]);

  return (
    <div className="app-layout">
      {/* Mobile Top Navbar with Hamburger */}
      <header className="mobile-navbar">
        <button
          type="button"
          className="mobile-nav-toggle"
          onClick={() => setIsSidebarOpen(true)}
          aria-label="เปิดเมนูหลัก"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span className="mobile-nav-title">RBH Virtual Hospital</span>
        <div style={{ width: 36 }} />
      </header>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <main className="main-content">
        {versionStatus.hasNewVersion && (
          <div className="version-update-topbar">
            <div className="version-update-topbar-content">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
              <span>
                ตรวจพบเวอร์ชันใหม่ (v{versionStatus.latestServerVersion}) ระบบจะอัปเดตให้อัตโนมัติเมื่อเปลี่ยนหน้า
              </span>
            </div>
            <button
              type="button"
              className="btn-update-topbar"
              onClick={performReload}
              title="คลิกเพื่อรีโหลดเวอร์ชันใหม่ทันที"
            >
              คลิกเพื่ออัปเดตทันที
            </button>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}

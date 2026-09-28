import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { getVersionStatus, subscribeVersion, performReload } from '../services/version';

export default function Layout() {
  const [versionStatus, setVersionStatus] = useState(getVersionStatus());

  useEffect(() => {
    return subscribeVersion((status) => {
      setVersionStatus({ ...status });
    });
  }, []);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        {versionStatus.hasNewVersion && (
          <div className="version-update-topbar">
            <div className="version-update-topbar-content">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
              <span>ตรวจพบเวอร์ชันใหม่ (v{versionStatus.latestServerVersion}) มีการอัปเดตระบบ</span>
            </div>
            <button
              type="button"
              className="btn-update-topbar"
              onClick={performReload}
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

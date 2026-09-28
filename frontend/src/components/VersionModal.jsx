import { useState } from 'react';
import { APP_VERSION, APP_COMMIT, APP_UPDATED_AT, performReload } from '../services/version';
import { api } from '../api/client';

export default function VersionModal({ isOpen, onClose, versionStatus }) {
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [checkError, setCheckError] = useState('');

  if (!isOpen) return null;

  const handleCheckUpdate = async () => {
    setChecking(true);
    setCheckResult(null);
    setCheckError('');

    try {
      // 1. Check server version first
      const serverData = await api.getSystemVersion();
      // 2. Check remote repository
      const remoteData = await api.checkSystemUpdate().catch(() => null);

      const hasServerUpdate = serverData && serverData.version && serverData.version !== APP_VERSION;
      const hasRemoteUpdate = remoteData && remoteData.updateAvailable;

      setCheckResult({
        serverVersion: serverData?.version || APP_VERSION,
        serverCommit: serverData?.commit || APP_COMMIT,
        hasServerUpdate,
        hasRemoteUpdate,
        latestRemoteCommit: remoteData?.latestCommit,
        remoteMessage: remoteData?.commitMessage,
        isUpToDate: !hasServerUpdate && !hasRemoteUpdate,
      });
    } catch (err) {
      setCheckError(err.message || 'ไม่สามารถตรวจสอบการอัปเดตได้');
    } finally {
      setChecking(false);
    }
  };

  const formatDate = (isoStr) => {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '—';
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear() + 543;
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${mins} น.`;
    } catch {
      return isoStr;
    }
  };

  const isUpdateFound = versionStatus?.hasNewVersion || checkResult?.hasServerUpdate || checkResult?.hasRemoteUpdate;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content version-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="version-modal-title-group">
            <h3 className="modal-title">เกี่ยวกับระบบและเวอร์ชัน</h3>
            <span className="version-system-name">RBH Virtual Hospital</span>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="ปิด"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="modal-body version-modal-body">
          {/* Version Info Box */}
          <div className="version-info-box">
            <div className="version-info-row">
              <span className="version-info-label">เวอร์ชันที่ใช้งาน:</span>
              <span className="version-info-value font-mono font-bold">v{APP_VERSION}</span>
            </div>
            {APP_COMMIT && APP_COMMIT !== 'unknown' && (
              <div className="version-info-row">
                <span className="version-info-label">Git Commit:</span>
                <span className="version-info-value font-mono text-muted">{APP_COMMIT}</span>
              </div>
            )}
            {APP_UPDATED_AT && (
              <div className="version-info-row">
                <span className="version-info-label">อัปเดตล่าสุด:</span>
                <span className="version-info-value text-muted">{formatDate(APP_UPDATED_AT)}</span>
              </div>
            )}
          </div>

          {/* Update Status Banner */}
          {isUpdateFound ? (
            <div className="version-status-banner banner-update">
              <div className="version-status-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </div>
              <div className="version-status-text">
                <div className="font-bold">ตรวจพบเวอร์ชันใหม่พร้อมใช้งาน</div>
                <div className="text-xs">
                  {versionStatus?.latestServerVersion
                    ? `เวอร์ชันเซิร์ฟเวอร์: v${versionStatus.latestServerVersion}`
                    : checkResult?.serverVersion && checkResult.serverVersion !== APP_VERSION
                    ? `เวอร์ชันเซิร์ฟเวอร์: v${checkResult.serverVersion}`
                    : checkResult?.latestRemoteCommit
                    ? `มีโค้ดใหม่บน GitHub (Commit: ${checkResult.latestRemoteCommit})`
                    : 'ระบบมีข้อมูลเวอร์ชันใหม่ กรุณารีโหลดหน้านี้เพื่ออัปเดต'}
                </div>
              </div>
            </div>
          ) : checkResult?.isUpToDate ? (
            <div className="version-status-banner banner-success">
              <div className="version-status-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </div>
              <div className="version-status-text">
                <div className="font-bold">คุณกำลังใช้งานเวอร์ชันล่าสุดแล้ว</div>
                <div className="text-xs text-muted">ไม่พบรายการอัปเดตใหม่ในขณะนี้</div>
              </div>
            </div>
          ) : null}

          {checkError && (
            <div className="modal-error">
              {checkError}
            </div>
          )}
        </div>

        <div className="modal-footer version-modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCheckUpdate}
            disabled={checking}
          >
            {checking ? (
              <>
                <svg className="spin-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                กำลังตรวจสอบ...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                </svg>
                ตรวจสอบการอัปเดต
              </>
            )}
          </button>

          {isUpdateFound && (
            <button
              type="button"
              className="btn btn-warning"
              onClick={performReload}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              อัปเดตและรีโหลด
            </button>
          )}

          <button
            type="button"
            className="btn btn-cancel"
            onClick={onClose}
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

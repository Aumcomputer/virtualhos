import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import './PrescreeningPage.css';
import './RequestTelemedPage.css';
import './TelemedToday.css';

function getTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatThaiDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = [
      '', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
    ];
    return `${d.getDate()} ${months[d.getMonth() + 1]} ${d.getFullYear() + 543}`;
  } catch {
    return dateStr;
  }
}

function formatDoctorName(raw) {
  if (!raw) return '—';
  const clean = String(raw).trim();
  if (!clean) return '—';
  if (clean.startsWith('นพ.') || clean.startsWith('พญ.') || clean.startsWith('น.พ.') || clean.startsWith('พ.ญ.')) {
    return clean;
  }
  return `พญ./นพ. ${clean}`;
}

export default function TelemedTodayAppointmentsPage() {
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState({ total: 0, has_visit: 0, no_visit: 0 });
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState(null);
  const [toast, setToast] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getTelemedTodayAppointments({
        date: selectedDate,
        search,
      });
      setData(res.data || []);
      setSummary(res.summary || { total: 0, has_visit: 0, no_visit: 0 });
    } catch (err) {
      console.error('Error fetching today appointments:', err);
      setToast({ type: 'error', message: err.message || 'ไม่สามารถโหลดข้อมูลนัดหมายวันนี้ได้' });
    } finally {
      setLoading(false);
    }
  }, [selectedDate, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle toast timeout
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSyncVn = async (item) => {
    setSyncingId(item.id);
    try {
      const res = await api.syncTelemedTodayVn(item.id);
      if (res.success) {
        setToast({ type: 'success', message: res.message });
        fetchData();
      } else {
        setToast({ type: 'info', message: res.message });
      }
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการตรวจสอบ Visit' });
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <>
      {/* Toast Notification */}
      {toast && (
        <div className={`toast-notification toast-${toast.type === 'error' ? 'danger' : toast.type === 'success' ? 'success' : 'info'}`}>
          <div className="toast-content">
            <span>{toast.message}</span>
            <button type="button" className="toast-close" onClick={() => setToast(null)}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h2 className="page-title">
              {selectedDate === getTodayStr() ? '“รับยาไม่พบแพทย์” วันนี้' : `“รับยาไม่พบแพทย์” วันที่ ${formatThaiDate(selectedDate)}`}
            </h2>
            <p className="page-subtitle">
              รายชื่อผู้ป่วยที่ผ่านการอนุมัติ Pre-screening และมีนัดหมายรับบริการวันที่ {formatThaiDate(selectedDate)} พร้อมตรวจสอบสถานะการเปิด Visit จาก HOSxP
            </p>
          </div>
        </div>
      </div>

      <div className="page-body prescreening-container">
        {/* Stats Row */}
        <div className="prescreen-stats-grid">
          <div className="prescreen-stat-card">
            <div className="prescreen-stat-icon total">📋</div>
            <div className="prescreen-stat-content">
              <span className="prescreen-stat-label">นัดหมายทั้งหมดวันนี้</span>
              <span className="prescreen-stat-val" style={{ color: '#2563eb' }}>{summary.total}</span>
            </div>
          </div>
          <div className="prescreen-stat-card">
            <div className="prescreen-stat-icon completed">✅</div>
            <div className="prescreen-stat-content">
              <span className="prescreen-stat-label">เปิด Visit วันนี้แล้ว (มี VN)</span>
              <span className="prescreen-stat-val" style={{ color: '#059669' }}>{summary.has_visit}</span>
            </div>
          </div>
          <div className="prescreen-stat-card">
            <div className="prescreen-stat-icon pending">⏳</div>
            <div className="prescreen-stat-content">
              <span className="prescreen-stat-label">รอเวชระเบียนเปิด Visit</span>
              <span className="prescreen-stat-val" style={{ color: '#d97706' }}>{summary.no_visit}</span>
            </div>
          </div>
        </div>

        {/* Table Card containing Toolbar & Data Table */}
        <div className="table-card rtm-card">
          {/* Table Toolbar */}
          <div className="table-toolbar rtm-toolbar">
            <div className="search-box rtm-search-wrap" style={{ maxWidth: '440px' }}>
              <svg className="search-icon rtm-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="search-input rtm-search-input"
                placeholder="ค้นหา HN, ชื่อผู้ป่วย, คลินิก, แพทย์, VN..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="search-clear-btn rtm-search-clear"
                  onClick={() => setSearch('')}
                  title="ล้างการค้นหา"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="rtm-actions-right">
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569' }}>วันนัดหมาย:</span>
                <input
                  type="date"
                  className="prescreen-date-input"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
                {selectedDate !== getTodayStr() && (
                  <button
                    type="button"
                    className="btn btn-secondary rtm-btn-action"
                    onClick={() => setSelectedDate(getTodayStr())}
                    title="กลับไปดูวันนี้"
                  >
                    วันนี้
                  </button>
                )}
              </div>

              <button
                type="button"
                className="btn btn-secondary rtm-btn-refresh"
                onClick={fetchData}
                disabled={loading}
                title="รีเฟรชข้อมูล"
              >
                <svg className={loading ? 'spin-icon' : ''} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span>รีเฟรช</span>
              </button>
            </div>
          </div>

          {/* Data Table Wrapper */}
          <div className="data-table-wrapper rtm-table-container">
            <table className="data-table telemed-workflow-table rtm-table">
              <thead>
                <tr>
                  <th style={{ width: '45px', textAlign: 'center' }}>#</th>
                  <th style={{ width: '130px' }}>วันนัดหมาย</th>
                  <th style={{ width: '110px' }}>HN</th>
                  <th>ชื่อ-นามสกุล</th>
                  <th>คลินิก / แพทย์ผู้นัด</th>
                  <th>สิทธิการรักษา</th>
                  <th>เบอร์โทร</th>
                  <th style={{ textAlign: 'center', width: '160px' }}>สถานะ Visit วันนี้</th>
                  <th style={{ textAlign: 'center', width: '130px' }}>การเชื่อมโยง VN</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '48px 20px' }}>
                      <div className="loading-spinner-wrapper" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', color: 'var(--gray-600)' }}>
                        <svg className="spin-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        <span style={{ fontSize: '0.875rem' }}>กำลังโหลดและตรวจสอบข้อมูลกับ HOSxP...</span>
                      </div>
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '56px 20px' }}>
                      <div className="empty-state-box">
                        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '6px' }}>
                          ไม่มีรายการนัดหมายรับยาไม่พบแพทย์ในวันที่ {formatThaiDate(selectedDate)}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--gray-500)' }}>
                          {search ? 'ลองค้นหาด้วยคำค้นอื่น หรือล้างช่องค้นหา' : 'รายการที่ผ่านการอนุมัติในขั้นตอน Pre-screening จะปรากฏในหน้านี้เมื่อถึงวันนัดจริง'}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.map((item, idx) => {
                    const isSyncing = syncingId === item.id;
                    return (
                      <tr key={item.id} className="table-row-clickable">
                        {/* 1. Index */}
                        <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem', fontFamily: 'monospace' }}>
                          {idx + 1}
                        </td>

                        {/* 2. Appointment Date */}
                        <td>
                          <span className="appt-date-badge">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            <span>{formatThaiDate(item.nextdate)}</span>
                          </span>
                        </td>

                        {/* 3. HN */}
                        <td>
                          <span className="rtm-hn-pill font-mono">{item.hn}</span>
                        </td>

                        {/* 4. Patient Name */}
                        <td style={{ fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>
                          {item.patient_name || '—'}
                        </td>

                        {/* 5. Clinic & Doctor */}
                        <td>
                          <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.8125rem' }}>{item.clinic_name || '—'}</div>
                          <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>🩺</span>
                            <span>{formatDoctorName(item.doctor_name)}</span>
                          </div>
                        </td>

                        {/* 6. Entitlement */}
                        <td style={{ fontSize: '0.8125rem', color: '#475569' }}>
                          {item.pttype_name || '—'}
                        </td>

                        {/* 7. Phone */}
                        <td>
                          {item.phone ? (
                            <span style={{ fontSize: '0.8125rem', fontFamily: 'monospace', color: '#334155' }}>
                              {item.phone}
                            </span>
                          ) : (
                            <span style={{ color: '#cbd5e1' }}>—</span>
                          )}
                        </td>

                        {/* 8. Has Visit Status */}
                        <td style={{ textAlign: 'center' }}>
                          {item.has_visit && item.vn_today ? (
                            <div className="tt-vn-cell">
                              <span className="vn-badge-has">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span>มี Visit แล้ว</span>
                              </span>
                              <span className="tt-vn-tag">VN: {item.vn_today}</span>
                            </div>
                          ) : (
                            <span className="vn-badge-none">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                              </svg>
                              <span>ยังไม่มี Visit</span>
                            </span>
                          )}
                        </td>

                        {/* 9. Action: Sync VN */}
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn-sync-vn"
                            onClick={() => handleSyncVn(item)}
                            disabled={isSyncing}
                            title="ตรวจสอบและดึงเลข VN ของวันนี้จากฐานข้อมูล HOSxP"
                          >
                            <svg className={isSyncing ? 'spin-icon' : ''} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                            </svg>
                            <span>{isSyncing ? 'กำลังดึง...' : 'ดึง VN'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div style={{ padding: '14px 20px', borderTop: '1px solid #f1f5f9', fontSize: '0.8125rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              แสดงทั้งหมด <strong style={{ color: '#0f172a' }}>{data.length}</strong> รายการ
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              💡 เมื่อเวชระเบียนเปิด Visit ใน HOSxP ระบบจะตรวจจับและบันทึกเลข VN ให้โดยอัตโนมัติ
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

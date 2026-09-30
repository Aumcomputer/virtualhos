import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
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

function formatThaiDateTime(dateTimeStr) {
  if (!dateTimeStr) return '—';
  try {
    const d = new Date(dateTimeStr);
    if (isNaN(d.getTime())) return dateTimeStr;
    const months = [
      '', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
    ];
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${d.getDate()} ${months[d.getMonth() + 1]} ${d.getFullYear() + 543} ${hours}:${mins} น.`;
  } catch {
    return dateTimeStr;
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
    <div className="request-telemed-page">
      {/* Toast Notification */}
      {toast && (
        <div className={`rtm-toast ${toast.type}`}>
          {toast.type === 'success' ? '✓ ' : 'ℹ '}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="rtm-header">
        <div className="rtm-header-left">
          <h1 className="rtm-title">“รับยาไม่พบแพทย์” วันนี้</h1>
          <p className="rtm-subtitle">
            รายชื่อผู้ป่วยที่ผ่านการอนุมัติ Pre-screening และมีนัดหมายรับบริการวันนี้ พร้อมตรวจสอบสถานะการเปิด Visit จาก HOSxP
          </p>
        </div>
      </div>

      {/* Summary KPI Badges */}
      <div className="rtm-summary-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <div className="rtm-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', fontWeight: 600, textTransform: 'uppercase' }}>
              นัดหมายทั้งหมดวันนี้
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--gray-900)', marginTop: '4px' }}>
              {summary.total} <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--gray-500)' }}>คน</span>
            </div>
          </div>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', fontSize: '1.25rem' }}>
            📅
          </div>
        </div>

        <div className="rtm-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600, textTransform: 'uppercase' }}>
              เปิด Visit วันนี้แล้ว (มี VN)
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#059669', marginTop: '4px' }}>
              {summary.has_visit} <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--gray-500)' }}>คน</span>
            </div>
          </div>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669', fontSize: '1.25rem' }}>
            ✓
          </div>
        </div>

        <div className="rtm-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#d97706', fontWeight: 600, textTransform: 'uppercase' }}>
              รอเวชระเบียนเปิด Visit
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#d97706', marginTop: '4px' }}>
              {summary.no_visit} <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--gray-500)' }}>คน</span>
            </div>
          </div>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706', fontSize: '1.25rem' }}>
            ⏳
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="rtm-card">
        {/* Toolbar */}
        <div className="rtm-toolbar" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div className="rtm-date-picker-wrap" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--gray-600)', fontWeight: 500 }}>
                วันนัดหมาย:
              </span>
              <input
                type="date"
                className="rtm-date-input font-mono"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
              {selectedDate !== getTodayStr() && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                  onClick={() => setSelectedDate(getTodayStr())}
                >
                  วันนี้
                </button>
              )}
            </div>

            <div className="rtm-search-wrap">
              <input
                type="text"
                className="rtm-search-input"
                placeholder="ค้นหา HN, ชื่อผู้ป่วย, คลินิก, VN..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchData}
            disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <svg className={loading ? 'spin-icon' : ''} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
            <span>รีเฟรชข้อมูล</span>
          </button>
        </div>

        {/* Table */}
        <div className="table-responsive">
          <table className="queue-table">
            <thead>
              <tr>
                <th style={{ width: '48px', textAlign: 'center' }}>#</th>
                <th>วันนัดหมาย</th>
                <th>HN</th>
                <th>ชื่อ-นามสกุล</th>
                <th>คลินิก / แพทย์ผู้นัด</th>
                <th>สิทธิการรักษา</th>
                <th>เบอร์โทร</th>
                <th style={{ textAlign: 'center' }}>มี Visit วันนี้หรือยัง</th>
                <th style={{ width: '130px', textAlign: 'center' }}>การเชื่อมโยง VN</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '48px 20px' }}>
                    <div className="loading-state">
                      <svg className="spin-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                    <tr key={item.id}>
                      <td style={{ textAlign: 'center', color: 'var(--gray-400)', fontSize: '0.8125rem', fontFamily: 'monospace' }}>
                        {idx + 1}
                      </td>

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

                      <td>
                        <span className="hn-badge font-mono">{item.hn}</span>
                      </td>

                      <td>
                        <span className="font-semibold" style={{ color: 'var(--gray-900)' }}>
                          {item.patient_name || '—'}
                        </span>
                      </td>

                      <td style={{ fontSize: '0.8125rem', color: 'var(--gray-700)' }}>
                        <div style={{ fontWeight: 500 }}>{item.clinic_name || '—'}</div>
                        <div style={{ color: 'var(--gray-500)', fontSize: '0.75rem', marginTop: '2px' }}>
                          {formatDoctorName(item.doctor_name)}
                        </div>
                      </td>

                      <td style={{ fontSize: '0.8125rem', color: 'var(--gray-700)' }}>
                        {item.pttype_name || '—'}
                      </td>

                      <td>
                        {item.phone ? (
                          <span style={{ fontSize: '0.8125rem', fontFamily: 'monospace' }}>
                            {item.phone}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--gray-300)' }}>—</span>
                        )}
                      </td>

                      {/* Status: มี Visit วันนี้หรือยัง */}
                      <td style={{ textAlign: 'center' }}>
                        {item.has_visit && item.vn_today ? (
                          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                            <span className="vn-badge-has">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              <span>มี Visit แล้ว</span>
                            </span>
                            <span className="font-mono" style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: 600 }}>
                              VN: {item.vn_today}
                            </span>
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

                      {/* Action: Sync VN */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn-sync-vn"
                          onClick={() => handleSyncVn(item)}
                          disabled={isSyncing}
                          title="ตรวจสอบและดึงเลข VN ของวันนี้จากฐานข้อมูล HOSxP"
                        >
                          <svg className={isSyncing ? 'spin-icon' : ''} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', fontSize: '0.8125rem', color: 'var(--gray-500)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            แสดงทั้งหมด <strong>{data.length}</strong> รายการ
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>
            💡 เมื่อเวชระเบียนเปิด Visit ใน HOSxP ระบบจะตรวจจับและบันทึกเลข VN ให้โดยอัตโนมัติ
          </div>
        </div>
      </div>
    </div>
  );
}

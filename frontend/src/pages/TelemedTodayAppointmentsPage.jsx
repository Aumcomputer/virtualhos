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

  // Detail Modal Popup State
  const [detailModalItem, setDetailModalItem] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

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
        // If modal is open for this item, refresh modal detail as well
        if (detailModalItem?.id === item.id) {
          openDetailModal(item);
        }
      } else {
        setToast({ type: 'info', message: res.message });
      }
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการตรวจสอบ Visit' });
    } finally {
      setSyncingId(null);
    }
  };

  const openDetailModal = async (item) => {
    setDetailModalItem(item);
    setDetailData(null);
    setDetailLoading(true);
    try {
      const res = await api.getTelemedTodayDetail(item.id);
      setDetailData(res);
    } catch (err) {
      console.error('Error fetching detail:', err);
      setToast({ type: 'error', message: err.message || 'ไม่สามารถดึงข้อมูลเวชระเบียนเปรียบเทียบได้' });
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetailModal = () => {
    setDetailModalItem(null);
    setDetailData(null);
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
                  <th style={{ textAlign: 'center', width: '180px' }}>การดำเนินการ</th>
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
                      <tr
                        key={item.id}
                        className="table-row-clickable"
                        onClick={() => openDetailModal(item)}
                        title="คลิกเพื่อดูรายละเอียดผู้ป่วย (Popup)"
                      >
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

                        {/* 9. Action: Sync VN & View Details */}
                        <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
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
                            <button
                              type="button"
                              className="btn btn-secondary rtm-btn-action"
                              onClick={() => openDetailModal(item)}
                              title="ดูรายละเอียดผู้ป่วยและประวัติ"
                            >
                              👁️ ดูข้อมูล
                            </button>
                          </div>
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
              💡 คลิกที่แถวหรือปุ่ม "👁️ ดูข้อมูล" เพื่อเปิดหน้าต่าง Popup ดูรายละเอียดผู้ป่วย
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================
          Detail Modal Popup for Appointments Today
          ======================================================================== */}
      {detailModalItem && (
        <div className="visit-modal-overlay" onClick={closeDetailModal}>
          <div className="visit-modal-card" style={{ maxWidth: '1200px' }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="visit-modal-header">
              <div className="visit-modal-title">
                <span>รายละเอียดผู้ป่วย “รับยาไม่พบแพทย์” วันนี้</span>
                {detailData?.currentVn && (
                  <span className="font-mono" style={{ fontSize: '0.8125rem', color: '#0369a1', marginLeft: '10px' }}>
                    VN วันนี้: {detailData.currentVn}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="visit-modal-close"
                onClick={closeDetailModal}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="visit-modal-body" style={{ maxHeight: 'calc(85vh - 120px)', overflowY: 'auto' }}>
              {/* Quick Patient Banner */}
              <div className="patient-quick-banner rtm-patient-banner">
                <div className="patient-banner-left">
                  <div className="patient-banner-name-block">
                    <div className="patient-banner-name">{detailModalItem.patient_name}</div>
                    <div className="patient-banner-sub">
                      <span className="font-mono" style={{ fontWeight: 600, color: 'var(--primary-700)' }}>
                        HN: {detailModalItem.hn}
                      </span>
                      {detailData?.currentVisit?.age_y !== undefined && (
                        <span>• อายุ {detailData.currentVisit.age_y} ปี {detailData.currentVisit.age_m || 0} เดือน</span>
                      )}
                      {(detailData?.vnStat?.pttype_name || detailModalItem.pttype_name) && (
                        <span style={{ color: '#0369a1', fontWeight: 600 }}>
                          • สิทธิ: {detailData?.vnStat?.pttype_name || detailModalItem.pttype_name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="patient-banner-right">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {detailModalItem.has_visit && (detailModalItem.vn_today || detailData?.currentVn) ? (
                      <span className="vn-badge-has">
                        ✓ มี Visit วันนี้แล้ว (VN: {detailModalItem.vn_today || detailData?.currentVn})
                      </span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="vn-badge-none">⏳ รอเวชระเบียนเปิด Visit</span>
                        <button
                          type="button"
                          className="btn-sync-vn"
                          onClick={() => handleSyncVn(detailModalItem)}
                          disabled={syncingId === detailModalItem.id}
                        >
                          {syncingId === detailModalItem.id ? 'กำลังดึง...' : 'ดึง VN จาก HOSxP'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {detailLoading ? (
                <div style={{ textAlign: 'center', padding: '50px 20px' }}>
                  <svg className="spin-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  <p style={{ marginTop: '10px', color: 'var(--gray-600)' }}>กำลังดึงข้อมูลเวชระเบียนเปรียบเทียบจาก HOSxP...</p>
                </div>
              ) : (
                <div className="clinical-dashboard-grid" style={{ marginTop: '16px' }}>
                  {/* Left Column: Previous Visit */}
                  <div className="clinical-col left-col">
                    <div className="column-header left-col-header">
                      <div className="column-header-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                        <span>ประวัติการตรวจครั้งก่อน (Previous Visit)</span>
                      </div>
                      {detailData?.previousVisit?.vstdate && (
                        <span className="visit-date-tag">
                          ตรวจเมื่อ: {formatThaiDate(detailData.previousVisit.vstdate)}
                        </span>
                      )}
                    </div>

                    <div className="clinical-col-content">
                      {/* Vitals เก่า */}
                      <div className="clinical-card">
                        <div className="clinical-card-header">
                          <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>สัญญาณชีพ (Vital Signs) ครั้งก่อน</span>
                        </div>
                        <div className="clinical-card-body" style={{ padding: '10px' }}>
                          {detailData?.previousVisit ? (
                            <div className="vitals-matrix-clean">
                              <div className="vital-item">
                                <span className="vital-label">BP</span>
                                <span className="vital-val font-mono">{detailData.previousVisit.bps || '—'}/{detailData.previousVisit.bpd || '—'}</span>
                              </div>
                              <div className="vital-item">
                                <span className="vital-label">Pulse</span>
                                <span className="vital-val font-mono">{detailData.previousVisit.pulse || '—'}</span>
                              </div>
                              <div className="vital-item">
                                <span className="vital-label">Temp</span>
                                <span className="vital-val font-mono">{detailData.previousVisit.temperature || '—'}°C</span>
                              </div>
                              <div className="vital-item">
                                <span className="vital-label">BW</span>
                                <span className="vital-val font-mono">{detailData.previousVisit.bw || '—'} kg</span>
                              </div>
                            </div>
                          ) : (
                            <div style={{ color: 'var(--gray-400)', fontStyle: 'italic', fontSize: '0.75rem' }}>— ไม่มีข้อมูล —</div>
                          )}
                        </div>
                      </div>

                      {/* การวินิจฉัยเดิม */}
                      <div className="clinical-card">
                        <div className="clinical-card-header">
                          <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>การวินิจฉัยเดิม (Diagnoses)</span>
                        </div>
                        <div className="clinical-card-body" style={{ padding: '10px' }}>
                          {detailData?.previousVisit?.pdx_name || detailData?.previousVisit?.pdx ? (
                            <div style={{ fontSize: '0.8125rem', color: '#1e293b' }}>
                              <span style={{ fontWeight: 700, color: '#0369a1' }}>{detailData.previousVisit.pdx}</span>: {detailData.previousVisit.pdx_name || detailData.previousVisit.pdx}
                            </div>
                          ) : (
                            <div style={{ color: 'var(--gray-400)', fontStyle: 'italic', fontSize: '0.75rem' }}>— ไม่มีข้อมูล —</div>
                          )}
                        </div>
                      </div>

                      {/* ยาเดิม */}
                      <div className="clinical-card">
                        <div className="clinical-card-header">
                          <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>รายการยาเดิมที่ได้รับ ({detailData?.previousVisit?.drugs?.length || 0} รายการ)</span>
                        </div>
                        <div className="clinical-card-body" style={{ padding: '0' }}>
                          {detailData?.previousVisit?.drugs && detailData.previousVisit.drugs.length > 0 ? (
                            <table className="mini-med-table" style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>ชื่อยา</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'right', width: '60px' }}>จำนวน</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detailData.previousVisit.drugs.map((d, i) => (
                                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '6px 10px' }}>
                                      <div style={{ fontWeight: 600, color: '#1e293b' }}>{d.drug_name || d.name}</div>
                                      <div style={{ color: '#64748b', fontSize: '0.6875rem' }}>{d.usage_line1 || d.drugusage}</div>
                                    </td>
                                    <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                                      {d.qty || d.amount}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <div style={{ color: 'var(--gray-400)', fontStyle: 'italic', fontSize: '0.75rem', padding: '10px' }}>— ไม่มีรายการยา —</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Today Visit & Request Intent */}
                  <div className="clinical-col right-col">
                    <div className="column-header right-col-header">
                      <div className="column-header-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/>
                          <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <span>นัดหมายและยื่นความจำนงวันนี้ (Today Request)</span>
                      </div>
                      <span className="visit-date-tag" style={{ background: '#dbeafe', color: '#1e40af' }}>
                        นัดวันที่: {formatThaiDate(detailModalItem.nextdate)}
                      </span>
                    </div>

                    <div className="clinical-col-content">
                      {/* รายละเอียดการยื่นความจำนง */}
                      <div className="clinical-card">
                        <div className="clinical-card-header" style={{ background: '#f8fafc' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#1e293b' }}>
                            📋 ข้อมูลการยื่นความจำนงรับยาไม่พบแพทย์
                          </span>
                        </div>
                        <div className="clinical-card-body" style={{ padding: '12px 14px', fontSize: '0.8125rem' }}>
                          <div style={{ marginBottom: '8px' }}>
                            <strong style={{ color: '#0f172a' }}>เหตุผลความจำเป็น:</strong>{' '}
                            <span style={{ color: '#1e293b' }}>{detailModalItem.reason || detailData?.request?.reason || '—'}</span>
                          </div>
                          <div style={{ marginBottom: '8px' }}>
                            <strong style={{ color: '#0f172a' }}>อาการปัจจุบัน:</strong>{' '}
                            <span style={{ color: '#1e293b' }}>{detailModalItem.symptoms || detailData?.request?.symptoms || '—'}</span>
                          </div>
                          <div style={{ marginBottom: '8px' }}>
                            <strong style={{ color: '#0f172a' }}>ที่อยู่จัดส่งยา:</strong>{' '}
                            <span style={{ color: '#1e293b' }}>{detailModalItem.address || detailData?.request?.address || '—'} {detailModalItem.postcode || detailData?.request?.postcode || ''}</span>
                          </div>
                          <div style={{ marginBottom: '8px' }}>
                            <strong style={{ color: '#0f172a' }}>เบอร์โทรศัพท์:</strong>{' '}
                            <span style={{ color: '#1e293b', fontFamily: 'monospace', fontWeight: 600 }}>{detailModalItem.phone || detailData?.request?.phone || '—'}</span>
                          </div>
                        </div>
                      </div>

                      {/* ข้อมูลยา Visit ปัจจุบัน (ถ้ามี) */}
                      {detailData?.currentVisit?.drugs && detailData.currentVisit.drugs.length > 0 && (
                        <div className="clinical-card">
                          <div className="clinical-card-header">
                            <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>ยาที่แพทย์สั่งใน Visit วันนี้ ({detailData.currentVisit.drugs.length} รายการ)</span>
                          </div>
                          <div className="clinical-card-body" style={{ padding: '0' }}>
                            <table className="mini-med-table" style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>ชื่อยา</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'right', width: '60px' }}>จำนวน</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detailData.currentVisit.drugs.map((d, i) => (
                                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '6px 10px' }}>
                                      <div style={{ fontWeight: 600, color: '#1e293b' }}>{d.drug_name || d.name}</div>
                                      <div style={{ color: '#64748b', fontSize: '0.6875rem' }}>{d.usage_line1 || d.drugusage}</div>
                                    </td>
                                    <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                                      {d.qty || d.amount}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Timeline */}
                      {(detailModalItem.timeline || detailData?.request?.timeline) && (
                        <div className="clinical-card">
                          <div className="clinical-card-header">
                            <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>ประวัติและสถานะการดำเนินงาน (Timeline)</span>
                          </div>
                          <div className="clinical-card-body" style={{ padding: '10px 14px' }}>
                            <div style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                              {typeof (detailModalItem.timeline || detailData?.request?.timeline) === 'string'
                                ? (detailModalItem.timeline || detailData?.request?.timeline)
                                : JSON.stringify(detailModalItem.timeline || detailData?.request?.timeline, null, 2)}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="visit-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid #f1f5f9' }}>
              <button
                type="button"
                className="btn btn-secondary rtm-btn-action"
                onClick={closeDetailModal}
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

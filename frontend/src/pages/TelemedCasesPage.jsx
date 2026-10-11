import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api/client';
import './TelemedCasesPage.css';

function getTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatThaiDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = [
    '', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ];
  return `${d} ${months[m]} ${y + 543}`;
}

function formatShortDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear() + 543;
  return `${day}/${month}/${year}`;
}

function formatShortDateTime(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear() + 543;
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes} น.`;
  } catch {
    return dateStr;
  }
}

// ---------------------------------------------------------------------------
// Visit-type badge
// ---------------------------------------------------------------------------
function VisitTypeBadge({ type }) {
  if (type === 'screening') {
    return (
      <span className="cases-type-badge screening" style={{ backgroundColor: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>
        📋 คัดกรองแล้ว
      </span>
    );
  }
  if (type === 'with-doctor') {
    return (
      <span className="cases-type-badge with-doctor">
        👨‍⚕️ พบแพทย์
      </span>
    );
  }
  if (type === 'no-doctor') {
    return (
      <span className="cases-type-badge no-doctor">
        💊 ไม่พบแพทย์
      </span>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function TelemedCasesPage({ type }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [search, setSearch] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [selectedClinic, setSelectedClinic] = useState('');

  // Determine page mode: combined vs appointments
  const isCombined = type === 'with-doctor' || type === 'no-doctor' || type === 'combined';
  const isAppointments = type === 'appointments';

  // 'screening' | 'all' | 'with-doctor' | 'no-doctor'
  const [visitFilter, setVisitFilter] = useState(isCombined ? 'screening' : 'all');
  const [callingHn, setCallingHn] = useState(null);
  const [selectedPrescreen, setSelectedPrescreen] = useState(null);

  const pageConfig = useMemo(() => {
    if (isAppointments) {
      return {
        title: 'ใบนัด Telemed ',
        subtitle: 'รายการเคสนัดหมาย Telemed ทั้งหมด แยกตามวันที่ทำนัดหมาย',
        fetchFn: api.getTelemedAppointments,
      };
    }
    return {
      title: 'Case Telemed ',
      subtitle: 'รายการเคสนัดหมาย Telemed แยกตามวันที่นัดหมาย',
      fetchFn: api.getTelemedCasesCombined,
    };
  }, [isAppointments]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const results = await pageConfig.fetchFn(selectedDate);
      setData(results || []);
    } catch (err) {
      console.error('Failed to fetch telemed cases:', err.message);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [pageConfig, selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset filters on date change
  useEffect(() => {
    setSelectedDoctor('');
    setSelectedClinic('');
    setSearch('');
  }, [selectedDate]);

  // Default to 'screening' on combined page
  useEffect(() => {
    setVisitFilter(isCombined ? 'screening' : 'all');
  }, [type, isCombined]);

  // Unique clinics/doctors from loaded data
  const uniqueClinics = useMemo(() => {
    const set = new Set(data.map((row) => row.clinic_name || row.clinic).filter(Boolean));
    return Array.from(set).sort();
  }, [data]);

  const uniqueDoctors = useMemo(() => {
    const set = new Set(data.map((row) => row.doctor_name).filter(Boolean));
    return Array.from(set).sort();
  }, [data]);

  // Counts per visit_type (for combined mode)
  const screeningCount = useMemo(
    () => data.filter((r) => r.visit_type === 'screening').length,
    [data]
  );
  const withDoctorCount = useMemo(
    () => data.filter((r) => r.visit_type === 'with-doctor').length,
    [data]
  );
  const noDoctorCount = useMemo(
    () => data.filter((r) => r.visit_type === 'no-doctor').length,
    [data]
  );
  const allCasesCount = useMemo(
    () => data.filter((r) => r.visit_type !== 'screening').length,
    [data]
  );

  // Client-side filtering
  const filteredData = useMemo(() => {
    let temp = data;

    // Visit type filter (combined mode only)
    if (isCombined) {
      if (visitFilter === 'screening') {
        temp = temp.filter((row) => row.visit_type === 'screening');
      } else if (visitFilter === 'with-doctor') {
        temp = temp.filter((row) => row.visit_type === 'with-doctor');
      } else if (visitFilter === 'no-doctor') {
        temp = temp.filter((row) => row.visit_type === 'no-doctor');
      } else if (visitFilter === 'all') {
        temp = temp.filter((row) => row.visit_type !== 'screening');
      }
    }

    if (selectedClinic) {
      temp = temp.filter((row) => (row.clinic_name || row.clinic) === selectedClinic);
    }

    if (selectedDoctor) {
      temp = temp.filter((row) => row.doctor_name === selectedDoctor);
    }

    if (search.trim()) {
      const term = search.toLowerCase();
      temp = temp.filter((row) => {
        const hn = (row.hn || '').toLowerCase();
        const patient = (row.patient_name || '').toLowerCase();
        const doctor = (row.doctor_name || '').toLowerCase();
        const clinic = (row.clinic_name || row.clinic || '').toLowerCase();
        const note = (row.note || '').toLowerCase();
        const cc = (row.chief_complaint || '').toLowerCase();
        const pttype = (row.pttype_name || row.pttype || '').toLowerCase();
        return (
          hn.includes(term) ||
          patient.includes(term) ||
          doctor.includes(term) ||
          clinic.includes(term) ||
          pttype.includes(term) ||
          note.includes(term) ||
          cc.includes(term)
        );
      });
    }

    return temp;
  }, [data, search, selectedDoctor, selectedClinic, isCombined, visitFilter]);

  // Video call action
  const handleStartVideoCall = async (row) => {
    if (!row.is_line_registered) {
      alert(`ผู้ป่วย HN ${row.hn} (${row.patient_name || ''}) ยังไม่ได้ลงทะเบียนในระบบ LINE OA หรือ Caregiver จึงไม่สามารถเริ่ม Video Call ได้`);
      return;
    }
    if (!row.cid) {
      alert(`ไม่พบเลขประจำตัวประชาชน (CID) ของผู้ป่วย HN ${row.hn} จึงไม่สามารถเริ่ม Video Call ได้`);
      return;
    }
    try {
      setCallingHn(row.hn);
      const res = await api.createTelemedLink(row.hn, row.cid, row.patient_name, 'line');
      if (res.doctor_link) {
        const width = 1200;
        const height = 800;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        window.open(
          res.doctor_link,
          `telemed-${row.hn}-line`,
          `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes,menubar=no,toolbar=no,status=no`
        );
      } else {
        alert('ระบบสร้างลิงก์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }
    } catch (err) {
      console.error('Error starting video call:', err);
      alert('เกิดข้อผิดพลาดในการสร้างลิงก์ Video Call: ' + err.message);
    } finally {
      setCallingHn(null);
    }
  };

  const isToday = selectedDate === getTodayStr();

  return (
    <>
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h2 className="page-title">
              {pageConfig.title}
              <span className="page-title-date-badge">
                {isToday ? 'วันนี้' : formatThaiDate(selectedDate)}
              </span>
            </h2>
            <p className="page-subtitle">{pageConfig.subtitle}</p>
          </div>
        </div>
      </div>

      <div className="page-body telemed-cases-container">
        {/* Stats */}
        <div className="cases-stats-grid">
          {isCombined && (
            <div className="cases-stat-card" style={{ borderColor: visitFilter === 'screening' ? '#86efac' : '#e2e8f0' }}>
              <div className="cases-stat-icon" style={{ backgroundColor: '#dcfce7', border: '1px solid #bbf7d0' }}>📋</div>
              <div className="cases-stat-info">
                <span className="cases-stat-label">คัดกรองแล้ว (Screening)</span>
                <span className="cases-stat-val" style={{ color: '#15803d' }}>{screeningCount}</span>
              </div>
            </div>
          )}

          <div className="cases-stat-card">
            <div className="cases-stat-icon total">👥</div>
            <div className="cases-stat-info">
              <span className="cases-stat-label">ใบนัดทั้งหมด (HOSxP)</span>
              <span className="cases-stat-val" style={{ color: '#2563eb' }}>{allCasesCount}</span>
            </div>
          </div>

          {isCombined && (
            <>
              <div className="cases-stat-card">
                <div className="cases-stat-icon doctor">👨‍⚕️</div>
                <div className="cases-stat-info">
                  <span className="cases-stat-label">พบแพทย์</span>
                  <span className="cases-stat-val" style={{ color: '#059669' }}>{withDoctorCount}</span>
                </div>
              </div>
              <div className="cases-stat-card">
                <div className="cases-stat-icon no-doctor">💊</div>
                <div className="cases-stat-info">
                  <span className="cases-stat-label">ไม่พบแพทย์</span>
                  <span className="cases-stat-val" style={{ color: '#d97706' }}>{noDoctorCount}</span>
                </div>
              </div>
            </>
          )}

          <div className="cases-stat-card">
            <div className="cases-stat-icon filter">🔍</div>
            <div className="cases-stat-info">
              <span className="cases-stat-label">ตรงตามคำค้นหา</span>
              <span className="cases-stat-val">{filteredData.length}</span>
            </div>
          </div>
        </div>

        {/* Table & Filters Card */}
        <div className="cases-toolbar-card">
          <div className="cases-filter-bar">
            {/* Visit-type filter buttons (combined mode only) */}
            {isCombined && (
              <div className="cases-type-pill-group" role="group" aria-label="กรองประเภทการพบแพทย์">
                <button
                  id="filter-screening"
                  className={`cases-type-pill${visitFilter === 'screening' ? ' is-active' : ''}`}
                  onClick={() => setVisitFilter('screening')}
                  style={{
                    backgroundColor: visitFilter === 'screening' ? '#0f766e' : undefined,
                    color: visitFilter === 'screening' ? '#ffffff' : undefined,
                  }}
                >
                  📋 คัดกรองแล้ว
                  <span className="cases-type-count">{screeningCount}</span>
                </button>
                <button
                  id="filter-all"
                  className={`cases-type-pill${visitFilter === 'all' ? ' is-active' : ''}`}
                  onClick={() => setVisitFilter('all')}
                >
                  ทั้งหมด (ใบนัด)
                  <span className="cases-type-count">{allCasesCount}</span>
                </button>
                <button
                  id="filter-with-doctor"
                  className={`cases-type-pill${visitFilter === 'with-doctor' ? ' is-active' : ''}`}
                  onClick={() => setVisitFilter('with-doctor')}
                >
                  👨‍⚕️ พบแพทย์
                  <span className="cases-type-count">{withDoctorCount}</span>
                </button>
                <button
                  id="filter-no-doctor"
                  className={`cases-type-pill${visitFilter === 'no-doctor' ? ' is-active' : ''}`}
                  onClick={() => setVisitFilter('no-doctor')}
                >
                  💊 ไม่พบแพทย์
                  <span className="cases-type-count">{noDoctorCount}</span>
                </button>
              </div>
            )}

            <div className="cases-inputs-row">
              <div className="cases-search-box">
                <svg className="cases-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  className="cases-search-input"
                  type="text"
                  placeholder="ค้นหา HN, ผู้ป่วย, แพทย์, แผนก, อาการ..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  id="search-telemed"
                />
              </div>

              <div className="cases-filter-select-group">
                <label htmlFor="clinic-filter">แผนก:</label>
                <select
                  id="clinic-filter"
                  className="cases-select"
                  value={selectedClinic}
                  onChange={(e) => setSelectedClinic(e.target.value)}
                >
                  <option value="">ทั้งหมด</option>
                  {uniqueClinics.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="cases-filter-select-group">
                <label htmlFor="doctor-filter">แพทย์:</label>
                <select
                  id="doctor-filter"
                  className="cases-select"
                  value={selectedDoctor}
                  onChange={(e) => setSelectedDoctor(e.target.value)}
                >
                  <option value="">ทั้งหมด</option>
                  {uniqueDoctors.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div className="cases-filter-select-group">
                <label htmlFor="date-picker">วันที่:</label>
                <input
                  id="date-picker"
                  className="cases-date-input"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="loading-container" style={{ padding: '48px 0' }}>
              <div className="spinner"></div>
              <span className="loading-text" style={{ marginTop: 12, color: '#64748b' }}>กำลังโหลดข้อมูล...</span>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="empty-state" style={{ padding: '48px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                {visitFilter === 'screening' ? 'ยังไม่มีผู้ป่วยคัดกรองในวันที่เลือก' : 'ไม่พบข้อมูล'}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                {visitFilter === 'screening'
                  ? 'ไม่มีผู้ป่วยที่กรอกแบบคัดกรอง (Prescreening) สำหรับวันที่นัดหมายนี้'
                  : 'ไม่มีข้อมูลเคสที่ตรงกับเงื่อนไขในวันที่เลือก'}
              </div>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table" id="telemed-cases-table">
                <thead>
                  <tr>
                    <th style={{ width: '45px', textAlign: 'center' }}>#</th>
                    <th style={{ width: '105px' }}>HN</th>
                    <th>ชื่อคนไข้</th>
                    <th style={{ minWidth: '150px' }}>สิทธิการรักษา</th>
                    <th>ชื่อแพทย์</th>
                    <th>แผนก / Clinic</th>
                    {visitFilter === 'screening' ? (
                      <>
                        <th style={{ minWidth: '150px' }}>สัญญาณชีพ (Vital Signs)</th>
                        <th style={{ minWidth: '180px' }}>อาการสำคัญ</th>
                        <th style={{ width: '130px' }}>วันเวลาคัดกรอง</th>
                        <th style={{ width: '150px', textAlign: 'center' }}>Video Call (Line OA)</th>
                      </>
                    ) : (
                      <>
                        {isCombined && (
                          <th style={{ width: '120px' }}>วันที่ออกใบนัด</th>
                        )}
                        {isCombined && visitFilter === 'all' && (
                          <th style={{ width: '130px', textAlign: 'center' }}>ประเภท</th>
                        )}
                        {isAppointments && <th style={{ width: '120px' }}>Visit Date</th>}
                        {isAppointments && (
                          <th style={{ width: '120px', textAlign: 'center' }}>Line Connected</th>
                        )}
                        <th>Note</th>
                        <th style={{ width: '140px', textAlign: 'center' }}>Video Call</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row, idx) => (
                    <tr key={`${row.hn}-${idx}`}>
                      <td style={{ color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center' }}>{idx + 1}</td>
                      <td>
                        {row.hn ? (
                          <span className="font-mono font-bold" style={{ color: '#1e293b' }}>{row.hn}</span>
                        ) : (
                          <span style={{ color: '#cbd5e1' }}>-</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>
                        {row.patient_name || '-'}
                      </td>
                      <td>
                        {row.pttype_name ? (
                          <div style={{ fontSize: '12px', color: '#0369a1', lineHeight: 1.35 }}>
                            <span style={{ fontWeight: 500 }}>{row.pttype_name}</span>
                            {row.pttype && (
                              <span className="font-mono" style={{ fontSize: '11px', color: '#64748b', marginLeft: '4px' }}>
                                ({row.pttype})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '12px' }}>-</span>
                        )}
                      </td>
                      <td style={{ color: '#334155', fontWeight: 500 }}>{row.doctor_name || '-'}</td>
                      <td>
                        <span className="cases-clinic-badge">
                          {row.clinic_name || row.clinic || '-'}
                        </span>
                      </td>

                      {visitFilter === 'screening' ? (
                        <>
                          <td>
                            <div style={{ fontSize: '12px', lineHeight: 1.45, color: '#334155' }}>
                              {(row.sbp || row.dbp) && (
                                <div>
                                  <strong>BP:</strong> {row.sbp || '-'}/{row.dbp || '-'} mmHg
                                </div>
                              )}
                              {row.pulse && (
                                <div>
                                  <strong>ชีพจร:</strong> {row.pulse} /นาที
                                </div>
                              )}
                              {row.temperature && (
                                <div>
                                  <strong>อุณหภูมิ:</strong> {row.temperature} °C
                                </div>
                              )}
                              {row.spo2 && (
                                <div>
                                  <strong>SpO2:</strong> {row.spo2}%
                                </div>
                              )}
                              {!row.sbp && !row.pulse && !row.temperature && (
                                <span style={{ color: '#94a3b8' }}>-</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontSize: '13px', color: '#475569', maxWidth: '280px' }}>
                              {row.chief_complaint ? (
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebKitLineClamp: 2, WebKitBoxOrient: 'vertical' }}>
                                  {row.chief_complaint}
                                </div>
                              ) : (
                                <span style={{ color: '#94a3b8' }}>-</span>
                              )}
                              <button
                                type="button"
                                onClick={() => setSelectedPrescreen(row)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#0284c7',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  padding: 0,
                                  marginTop: '4px',
                                }}
                              >
                                🔍 ดูรายละเอียดคัดกรอง
                              </button>
                            </div>
                          </td>
                          <td>
                            <span style={{ color: '#475569', fontSize: '0.8125rem' }}>
                              {formatShortDateTime(row.completed_at)}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {row.is_line_registered ? (
                              <button
                                type="button"
                                onClick={() => handleStartVideoCall(row)}
                                disabled={callingHn === row.hn || !row.cid}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '6px 14px',
                                  borderRadius: '8px',
                                  backgroundColor: row.cid ? '#06c755' : '#e2e8f0',
                                  color: row.cid ? '#ffffff' : '#94a3b8',
                                  border: 'none',
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  cursor: callingHn === row.hn || !row.cid ? 'not-allowed' : 'pointer',
                                  boxShadow: row.cid ? '0 2px 6px rgba(6, 199, 85, 0.25)' : 'none',
                                  transition: 'all 0.15s ease',
                                }}
                                title={
                                  !row.cid
                                    ? 'ไม่พบ CID สำหรับเปิด Video Call'
                                    : row.line_type === 'CAREGIVER'
                                    ? 'โทรวิดีโอคอลหาผู้ดูแล (Caregiver)'
                                    : 'โทรวิดีโอคอลหาผู้ป่วยผ่าน Line OA'
                                }
                              >
                                {callingHn === row.hn ? (
                                  'กำลังสร้างห้อง...'
                                ) : (
                                  <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                      <polygon points="23 7 16 12 23 17 23 7" />
                                      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                    </svg>
                                    <span>{row.line_type === 'CAREGIVER' ? 'Video Call (ผู้ดูแล)' : 'Video Call'}</span>
                                  </>
                                )}
                              </button>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '5px 10px',
                                  borderRadius: '6px',
                                  backgroundColor: '#f1f5f9',
                                  color: '#94a3b8',
                                  border: '1px solid #e2e8f0',
                                  fontSize: '11px',
                                  fontWeight: '500',
                                }}
                                title="ผู้ป่วยยังไม่ได้ลงทะเบียนในระบบ LINE OA หรือ Caregiver จึงไม่สามารถเริ่ม Video Call ได้"
                              >
                                🚫 ไม่ได้ลงทะเบียน
                              </span>
                            )}
                          </td>
                        </>
                      ) : (
                        <>
                          {isCombined && (
                            <td>
                              <span style={{ color: '#475569', fontSize: '0.8125rem' }}>
                                {formatShortDate(row.vstdate)}
                              </span>
                            </td>
                          )}
                          {isCombined && visitFilter === 'all' && (
                            <td style={{ textAlign: 'center' }}>
                              <VisitTypeBadge type={row.visit_type} />
                            </td>
                          )}
                          {isAppointments && (
                            <td>
                              <span style={{ color: '#475569', fontSize: '0.8125rem' }}>
                                {formatShortDate(row.nextdate)}
                              </span>
                            </td>
                          )}
                          {isAppointments && (
                            <td style={{ textAlign: 'center' }}>
                              {row.line_connected ? (
                                <span className="cases-line-connected-badge">
                                  ✓ เชื่อมแล้ว
                                </span>
                              ) : (
                                <span style={{ color: '#cbd5e1' }}>-</span>
                              )}
                            </td>
                          )}
                          <td>
                            <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                              {row.note || '-'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {row.is_line_registered ? (
                              <button
                                type="button"
                                onClick={() => handleStartVideoCall(row)}
                                disabled={callingHn === row.hn || !row.cid}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '5px 10px',
                                  borderRadius: '6px',
                                  backgroundColor: row.cid ? '#06c755' : '#f1f5f9',
                                  color: row.cid ? '#ffffff' : '#94a3b8',
                                  border: 'none',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  cursor: callingHn === row.hn || !row.cid ? 'not-allowed' : 'pointer',
                                }}
                                title={
                                  !row.cid
                                    ? 'ไม่พบ CID สำหรับเปิด Video Call'
                                    : row.line_type === 'CAREGIVER'
                                    ? 'โทรวิดีโอคอลหาผู้ดูแล (Caregiver)'
                                    : 'โทรวิดีโอคอลหาผู้ป่วยผ่าน Line OA'
                                }
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <polygon points="23 7 16 12 23 17 23 7" />
                                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                </svg>
                                <span>{row.line_type === 'CAREGIVER' ? 'Call (ผู้ดูแล)' : 'Call'}</span>
                              </button>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-block',
                                  color: '#cbd5e1',
                                  fontSize: '11px',
                                }}
                                title="ยังไม่ลงทะเบียน LINE OA หรือ Caregiver"
                              >
                                -
                              </span>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && filteredData.length > 0 && (
            <div className="table-footer" style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
              <div className="table-info" style={{ color: '#64748b', fontSize: '0.8125rem' }}>
                แสดง <strong>{filteredData.length}</strong> จาก {data.length} รายการ
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal ดูผลการคัดกรองฉบับเต็ม */}
      {selectedPrescreen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
            backdropFilter: 'blur(2px)',
          }}
          onClick={() => setSelectedPrescreen(null)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              maxWidth: '650px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                  📋 รายละเอียดผลการคัดกรอง (Prescreening)
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                  ผู้ป่วย: <strong>{selectedPrescreen.patient_name}</strong> (HN: {selectedPrescreen.hn})
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                  {selectedPrescreen.pttype_name && (
                    <span style={{ fontSize: '12px', background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: '6px', fontWeight: 600 }}>
                      สิทธิ: {selectedPrescreen.pttype_name} {selectedPrescreen.pttype ? `(${selectedPrescreen.pttype})` : ''}
                    </span>
                  )}
                  {selectedPrescreen.is_line_registered ? (
                    <span style={{ fontSize: '12px', background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '6px', fontWeight: 600 }}>
                      ✓ ลงทะเบียน {selectedPrescreen.line_type === 'CAREGIVER' ? 'Caregiver แล้ว' : 'LINE OA แล้ว'}
                    </span>
                  ) : (
                    <span style={{ fontSize: '12px', background: '#fef2f2', color: '#dc2626', padding: '3px 8px', borderRadius: '6px', fontWeight: 500, border: '1px solid #fee2e2' }}>
                      🚫 ยังไม่ได้ลงทะเบียน LINE OA หรือ Caregiver
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPrescreen(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            {/* Vital Signs Grid */}
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', marginBottom: '16px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 600, color: '#334155' }}>🩺 สัญญาณชีพและข้อมูลกายภาพ</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', fontSize: '13px' }}>
                <div><strong>ความดันโลหิต (BP):</strong> {selectedPrescreen.sbp || '-'}/{selectedPrescreen.dbp || '-'} mmHg</div>
                <div><strong>ชีพจร:</strong> {selectedPrescreen.pulse || '-'} ครั้ง/นาที</div>
                <div><strong>อุณหภูมิ:</strong> {selectedPrescreen.temperature || '-'} °C</div>
                <div><strong>SpO2:</strong> {selectedPrescreen.spo2 ? `${selectedPrescreen.spo2}%` : '-'}</div>
                <div><strong>น้ำหนัก:</strong> {selectedPrescreen.weight || '-'} กก.</div>
                <div><strong>ส่วนสูง:</strong> {selectedPrescreen.height || '-'} ซม.</div>
              </div>
            </div>

            {/* Clinical Notes */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ marginBottom: '12px' }}>
                <strong style={{ fontSize: '13px', color: '#334155' }}>อาการสำคัญที่ต้องการปรึกษา (Chief Complaint):</strong>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', marginTop: '4px', fontSize: '13px', color: '#1e293b', whiteSpace: 'pre-wrap' }}>
                  {selectedPrescreen.chief_complaint || 'ไม่ได้ระบุ'}
                </div>
              </div>

              {selectedPrescreen.current_medications && (
                <div style={{ marginBottom: '12px' }}>
                  <strong style={{ fontSize: '13px', color: '#334155' }}>ยาเดิมที่รับประทานอยู่:</strong>
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', marginTop: '4px', fontSize: '13px', color: '#1e293b', whiteSpace: 'pre-wrap' }}>
                    {selectedPrescreen.current_medications}
                  </div>
                </div>
              )}

              {selectedPrescreen.additional_notes && (
                <div style={{ marginBottom: '12px' }}>
                  <strong style={{ fontSize: '13px', color: '#334155' }}>ข้อมูลเพิ่มเติม / ข้อกังวล:</strong>
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', marginTop: '4px', fontSize: '13px', color: '#1e293b', whiteSpace: 'pre-wrap' }}>
                    {selectedPrescreen.additional_notes}
                  </div>
                </div>
              )}

              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '12px' }}>
                <div><strong>เบอร์โทรศัพท์:</strong> {selectedPrescreen.phone || '-'}</div>
                <div><strong>ที่อยู่จัดส่งยา:</strong> {selectedPrescreen.address || '-'} {selectedPrescreen.postal_code || ''}</div>
                <div><strong>วันเวลาที่ส่งแบบคัดกรอง:</strong> {formatShortDateTime(selectedPrescreen.completed_at)}</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
              <button
                type="button"
                onClick={() => setSelectedPrescreen(null)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = selectedPrescreen;
                  setSelectedPrescreen(null);
                  handleStartVideoCall(target);
                }}
                disabled={!selectedPrescreen.cid || !selectedPrescreen.is_line_registered}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: selectedPrescreen.cid && selectedPrescreen.is_line_registered ? '#06c755' : '#e2e8f0',
                  color: selectedPrescreen.cid && selectedPrescreen.is_line_registered ? '#fff' : '#94a3b8',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: selectedPrescreen.cid && selectedPrescreen.is_line_registered ? 'pointer' : 'not-allowed',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                title={
                  !selectedPrescreen.is_line_registered
                    ? 'ผู้ป่วยยังไม่ได้ลงทะเบียน LINE OA หรือ Caregiver จึงไม่สามารถโทรได้'
                    : !selectedPrescreen.cid
                    ? 'ไม่พบ CID สำหรับเริ่มโทร'
                    : 'เริ่มโทร Video Call ทันที'
                }
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
                <span>
                  {selectedPrescreen.is_line_registered
                    ? (selectedPrescreen.line_type === 'CAREGIVER' ? 'เริ่ม Video Call (ผู้ดูแล)' : 'เริ่ม Video Call ทันที')
                    : 'ยังไม่ลงทะเบียน LINE'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

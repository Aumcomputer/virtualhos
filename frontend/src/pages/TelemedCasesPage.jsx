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
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      const parts = String(dateStr).split('-');
      if (parts.length < 3) return dateStr;
      const [y, m, day] = parts.map(Number);
      const months = [
        '', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
      ];
      return `${day} ${months[m]} ${y + 543}`;
    }
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const year = d.getFullYear() + 543;
    const months = [
      '', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
    ];
    return `${day} ${months[month]} ${year}`;
  } catch {
    return dateStr;
  }
}

function formatThaiDateTime(dateTimeStr) {
  if (!dateTimeStr) return '—';
  try {
    const d = new Date(dateTimeStr);
    if (isNaN(d.getTime())) return dateTimeStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.getMonth() + 1;
    const year = d.getFullYear() + 543;
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const months = [
      '', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
    ];
    return `${day} ${months[month]} ${year} ${hours}:${mins} น.`;
  } catch {
    return dateTimeStr;
  }
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

function formatPhone(raw) {
  if (!raw) return '—';
  const clean = String(raw).replace(/\D/g, '');
  if (clean.length === 10) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
  }
  if (clean.length === 9) {
    return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5)}`;
  }
  return raw;
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
  const [loadingPrescreenHn, setLoadingPrescreenHn] = useState(null);
  const [prescreenImages, setPrescreenImages] = useState([]);
  const [lightboxImageSrc, setLightboxImageSrc] = useState(null);

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
      const res = await api.createTelemedLink(row.hn, row.cid, row.patient_name, 'line', row.vn);
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

  const handleRowClick = async (row) => {
    // 1. ถ้าแถวข้อมูลมีรายละเอียดผลการคัดกรองอยู่แล้ว (เช่น มาจากแท็บ screening หรือดึงมาแล้ว)
    if (
      row.chief_complaint !== undefined ||
      row.sbp !== undefined ||
      row.visit_type === 'screening' ||
      row.is_prescreening
    ) {
      setSelectedPrescreen(row);
      if (row.id) {
        try {
          const imgs = await api.getPrescreeningImages(row.id);
          setPrescreenImages(imgs || []);
        } catch {
          setPrescreenImages([]);
        }
      } else {
        setPrescreenImages([]);
      }
      return;
    }

    // 2. ถ้ายังไม่มีรายละเอียด ลองค้นหาจากตาราง tele_prescreening ผ่าน API โดยใช้ HN
    if (!row.hn) return;

    try {
      setLoadingPrescreenHn(row.hn);
      const data = await api.getPrescreeningByHn(row.hn, selectedDate);
      if (data) {
        const merged = { ...row, ...data };
        setSelectedPrescreen(merged);
        if (data.id) {
          try {
            const imgs = await api.getPrescreeningImages(data.id);
            setPrescreenImages(imgs || []);
          } catch {
            setPrescreenImages([]);
          }
        } else {
          setPrescreenImages([]);
        }
      }
    } catch (err) {
      console.warn('Prescreening fetch failed:', err.message);
      alert(`ไม่พบข้อมูลแบบคัดกรอง (tele_prescreening) สำหรับผู้ป่วย HN ${row.hn}`);
    } finally {
      setLoadingPrescreenHn(null);
    }
  };

  const isToday = selectedDate === getTodayStr();

  return (
    <div className="telemed-cases-page-root" style={{ fontFamily: "'Sarabun', 'TH Sarabun New', sans-serif" }}>
      <div className="page-header" style={{ fontFamily: "'Sarabun', 'TH Sarabun New', sans-serif" }}>
        <div className="page-title-row">
          <div>
            <h2 className="page-title" style={{ fontFamily: "'Sarabun', 'TH Sarabun New', sans-serif" }}>
              {pageConfig.title}
              <span className="page-title-date-badge" style={{ fontFamily: "'Sarabun', 'TH Sarabun New', sans-serif" }}>
                {isToday ? 'วันนี้' : formatThaiDate(selectedDate)}
              </span>
            </h2>
            <p className="page-subtitle" style={{ fontFamily: "'Sarabun', 'TH Sarabun New', sans-serif" }}>{pageConfig.subtitle}</p>
          </div>
        </div>
      </div>

      <div className="page-body telemed-cases-container" style={{ fontFamily: "'Sarabun', 'TH Sarabun New', sans-serif" }}>
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
                    <th style={{ width: '120px' }}>VN</th>
                    <th>ชื่อคนไข้</th>
                    <th style={{ minWidth: '150px' }}>สิทธิการรักษา</th>
                    <th>ชื่อแพทย์</th>
                    <th>แผนก / Clinic</th>
                    {visitFilter === 'screening' ? (
                      <th style={{ width: '150px', textAlign: 'center' }}>Video Call (Line OA)</th>
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
                        <th style={{ width: '140px', textAlign: 'center' }}>Video Call</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row, idx) => (
                    <tr 
                      key={`${row.hn}-${idx}`}
                      onClick={() => handleRowClick(row)}
                      style={{ cursor: 'pointer' }}
                      title="คลิกที่แถวเพื่อดูรายละเอียดจากตาราง tele_prescreening"
                    >
                      <td style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', fontWeight: 'normal' }}>
                        {loadingPrescreenHn === row.hn ? '⏳' : idx + 1}
                      </td>
                      <td style={{ color: '#334155', fontSize: '13px', fontWeight: 'normal' }}>
                        {row.hn || '-'}
                      </td>
                      <td style={{ color: row.vn ? '#1e293b' : '#94a3b8', fontSize: '13px', fontWeight: 'normal' }}>
                        {row.vn ? (
                          <span title={row.vn_oapp ? `VN วันนี้: ${row.vn} (VN วันที่ทำนัด: ${row.vn_oapp})` : `VN วันนี้: ${row.vn}`}>
                            {row.vn}
                          </span>
                        ) : (
                          <span title={row.vn_oapp ? `ยังไม่เปิด Visit วันนี้ (VN วันที่ทำนัด: ${row.vn_oapp})` : 'ยังไม่เปิด Visit วันนี้'} style={{ color: '#94a3b8' }}>
                            -
                          </span>
                        )}
                      </td>
                      <td style={{ color: '#334155', fontSize: '13px', fontWeight: 'normal' }}>
                        {row.patient_name || '-'}
                      </td>
                      <td style={{ color: '#334155', fontSize: '13px', fontWeight: 'normal' }}>
                        {row.pttype_name ? (
                          <div>
                            <span>{row.pttype_name}</span>
                            {row.pttype && (
                              <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '4px' }}>
                                ({row.pttype})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>-</span>
                        )}
                      </td>
                      <td style={{ color: '#334155', fontSize: '13px', fontWeight: 'normal' }}>{row.doctor_name || '-'}</td>
                      <td style={{ color: '#334155', fontSize: '13px', fontWeight: 'normal' }}>
                        {row.clinic_name || row.clinic || '-'}
                      </td>

                      {visitFilter === 'screening' ? (
                        <td style={{ textAlign: 'center' }}>
                          {row.is_line_registered ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartVideoCall(row);
                              }}
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
                                fontWeight: 'normal',
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
                                fontWeight: 'normal',
                              }}
                              title="ผู้ป่วยยังไม่ได้ลงทะเบียนในระบบ LINE OA หรือ Caregiver จึงไม่สามารถเริ่ม Video Call ได้"
                            >
                              🚫 ไม่ได้ลงทะเบียน
                            </span>
                          )}
                        </td>
                      ) : (
                        <>
                          {isCombined && (
                            <td style={{ color: '#334155', fontSize: '13px', fontWeight: 'normal' }}>
                              {formatShortDate(row.vstdate)}
                            </td>
                          )}
                          {isCombined && visitFilter === 'all' && (
                            <td style={{ textAlign: 'center', fontSize: '13px', fontWeight: 'normal' }}>
                              <VisitTypeBadge type={row.visit_type} />
                            </td>
                          )}
                          {isAppointments && (
                            <td style={{ color: '#334155', fontSize: '13px', fontWeight: 'normal' }}>
                              {formatShortDate(row.nextdate)}
                            </td>
                          )}
                          {isAppointments && (
                            <td style={{ textAlign: 'center', fontSize: '13px', fontWeight: 'normal' }}>
                              {row.line_connected ? (
                                <span className="cases-line-connected-badge" style={{ fontWeight: 'normal' }}>
                                  ✓ เชื่อมแล้ว
                                </span>
                              ) : (
                                <span style={{ color: '#cbd5e1' }}>-</span>
                              )}
                            </td>
                          )}
                          <td style={{ textAlign: 'center' }}>
                            {row.is_line_registered ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartVideoCall(row);
                                }}
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
                                  fontWeight: 'normal',
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

      {/* Modal ดูผลการคัดกรองจากตาราง tele_prescreening */}
      {selectedPrescreen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '24px 16px',
            backdropFilter: 'blur(3px)',
            fontFamily: "'Sarabun', 'TH Sarabun New', sans-serif",
          }}
          onClick={() => setSelectedPrescreen(null)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              maxWidth: '1280px',
              width: '95%',
              maxHeight: '94vh',
              overflowY: 'auto',
              padding: '26px 32px',
              boxShadow: '0 20px 40px -8px rgba(0,0,0,0.22)',
              fontFamily: "'Sarabun', 'TH Sarabun New', sans-serif",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Title Row with Close Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>
                  รายละเอียดข้อมูลคัดกรองก่อนพบแพทย์
                </h3>
                <span style={{ fontSize: '13px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #dbeafe', padding: '3px 10px', borderRadius: '6px', fontWeight: 600 }}>
                  HN: {selectedPrescreen.hn}
                </span>
                {selectedPrescreen.is_line_registered ? (
                  <span style={{ fontSize: '12.5px', background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '6px', fontWeight: 600 }}>
                    {selectedPrescreen.line_type === 'CAREGIVER' ? 'ลงทะเบียน Caregiver' : 'ลงทะเบียน LINE OA'}
                  </span>
                ) : (
                  <span style={{ fontSize: '12.5px', background: '#fef2f2', color: '#dc2626', padding: '3px 8px', borderRadius: '6px', border: '1px solid #fee2e2' }}>
                    ยังไม่ลงทะเบียน LINE
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedPrescreen(null)}
                style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}
                title="ปิดหน้าต่าง"
              >
                ✕
              </button>
            </div>

            {/* Patient Quick Banner (แถบหัวเรื่องด้านบนตามรูป) */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px',
              marginBottom: '18px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
                  {selectedPrescreen.patient_name || '—'}
                </div>
                <div style={{ fontSize: '14.5px', color: '#475569', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 700, color: '#2563eb' }}>
                    HN: {selectedPrescreen.hn}
                  </span>
                  <span>• วันนัดหมาย: {formatThaiDate(selectedPrescreen.appointment_date || selectedPrescreen.vstdate || selectedPrescreen.nextdate)}</span>
                  <span>• คลินิก: {selectedPrescreen.clinic_name || selectedPrescreen.clinic || '—'}</span>
                  <span>• แพทย์: {selectedPrescreen.doctor_name || '—'}</span>
                </div>
              </div>
              <div>
                {(selectedPrescreen.status === 'completed' || selectedPrescreen.status === 'confirmed' || selectedPrescreen.sbp || selectedPrescreen.chief_complaint) ? (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '6px 14px',
                    borderRadius: '9999px',
                    background: '#ecfdf5',
                    color: '#15803d',
                    border: '1px solid #bbf7d0',
                    fontSize: '13.5px',
                    fontWeight: 600,
                  }}>
                    กรอกข้อมูลสำเร็จ
                  </span>
                ) : (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '6px 14px',
                    borderRadius: '9999px',
                    background: '#fef3c7',
                    color: '#b45309',
                    border: '1px solid #fde68a',
                    fontSize: '13.5px',
                    fontWeight: 600,
                  }}>
                    รอกรอกข้อมูล
                  </span>
                )}
              </div>
            </div>

            {/* 3 Columns Layout (3 กล่องการ์ดหลัก) */}
            {(() => {
              const bpVal = (selectedPrescreen.sbp && selectedPrescreen.dbp)
                ? `${selectedPrescreen.sbp}/${selectedPrescreen.dbp}`
                : (selectedPrescreen.sbp || selectedPrescreen.dbp || '—');

              let bmiVal = '—';
              if (selectedPrescreen.bmi) {
                bmiVal = selectedPrescreen.bmi;
              } else if (Number(selectedPrescreen.weight) > 0 && Number(selectedPrescreen.height) > 0) {
                const w = Number(selectedPrescreen.weight);
                const h = Number(selectedPrescreen.height) / 100;
                bmiVal = (w / (h * h)).toFixed(2);
              }

              const formatSmoking = (smoking, detail) => {
                const s = smoking?.trim();
                if (!s || s === 'ไม่สูบ' || s === 'no' || s === '0' || s === '-') {
                  return <span style={{ color: '#64748b' }}>ไม่สูบ</span>;
                }
                const extra = detail?.trim() ? ` (${detail.trim()})` : '';
                return <span style={{ color: '#dc2626', fontWeight: 600 }}>สูบ{extra}</span>;
              };

              const formatAlcohol = (alcohol, detail) => {
                const a = alcohol?.trim();
                if (!a || a === 'ไม่ดื่ม' || a === 'no' || a === '0' || a === '-') {
                  return <span style={{ color: '#64748b' }}>ไม่ดื่ม</span>;
                }
                const extra = detail?.trim() ? ` (${detail.trim()})` : '';
                return <span style={{ color: '#dc2626', fontWeight: 600 }}>ดื่ม{extra}</span>;
              };

              return (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: '16px',
                  marginBottom: '16px',
                }}>
                  {/* Column 1: ข้อมูลทั่วไปและการติดต่อ */}
                  <div style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '18px 20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}>
                    <div style={{
                      fontSize: '15.5px',
                      fontWeight: 700,
                      color: '#1e40af',
                      paddingBottom: '10px',
                      marginBottom: '14px',
                      borderBottom: '1px solid #f1f5f9',
                    }}>
                      ข้อมูลทั่วไปและการติดต่อ
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <tbody>
                        <tr>
                          <td style={{ color: '#64748b', fontWeight: 600, width: '90px', padding: '6px 0', verticalAlign: 'top' }}>HN:</td>
                          <td style={{ color: '#1e293b', padding: '6px 0', fontWeight: 600 }}>{selectedPrescreen.hn}</td>
                        </tr>
                        <tr>
                          <td style={{ color: '#64748b', fontWeight: 600, padding: '6px 0', verticalAlign: 'top' }}>ชื่อคนไข้:</td>
                          <td style={{ color: '#0f172a', fontWeight: 700, padding: '6px 0' }}>{selectedPrescreen.patient_name || '—'}</td>
                        </tr>
                        <tr>
                          <td style={{ color: '#64748b', fontWeight: 600, padding: '6px 0', verticalAlign: 'top' }}>สิทธิ์การรักษา:</td>
                          <td style={{ color: '#0369a1', fontWeight: 600, padding: '6px 0' }}>
                            {selectedPrescreen.pttype_name
                              ? `${selectedPrescreen.pttype_name}${selectedPrescreen.pttype ? ` (${selectedPrescreen.pttype})` : ''}`
                              : (selectedPrescreen.pttype || '—')}
                          </td>
                        </tr>
                        <tr>
                          <td style={{ color: '#64748b', fontWeight: 600, padding: '6px 0', verticalAlign: 'top' }}>ที่อยู่:</td>
                          <td style={{ color: '#1e293b', padding: '6px 0', lineHeight: '1.5' }}>{selectedPrescreen.address || 'ไม่มีข้อมูลที่อยู่'}</td>
                        </tr>
                        <tr>
                          <td style={{ color: '#64748b', fontWeight: 600, padding: '6px 0', verticalAlign: 'top' }}>รหัสไปรษณีย์:</td>
                          <td style={{ color: '#1e293b', padding: '6px 0' }}>{selectedPrescreen.postal_code || '—'}</td>
                        </tr>
                        <tr>
                          <td style={{ color: '#64748b', fontWeight: 600, padding: '6px 0', verticalAlign: 'top' }}>เบอร์โทร:</td>
                          <td style={{ color: '#1e293b', padding: '6px 0' }}>{formatPhone(selectedPrescreen.phone)}</td>
                        </tr>
                        <tr>
                          <td style={{ color: '#64748b', fontWeight: 600, padding: '6px 0', verticalAlign: 'top' }}>นัดหมาย:</td>
                          <td style={{ color: '#1e293b', padding: '6px 0' }}>
                            {formatThaiDate(selectedPrescreen.appointment_date || selectedPrescreen.vstdate || selectedPrescreen.nextdate)} {selectedPrescreen.note ? `(${selectedPrescreen.note})` : ''}
                          </td>
                        </tr>
                        <tr>
                          <td style={{ color: '#64748b', fontWeight: 600, padding: '6px 0', verticalAlign: 'top' }}>ส่ง LINE:</td>
                          <td style={{ color: '#1e293b', padding: '6px 0' }}>
                            {formatThaiDateTime(selectedPrescreen.line_sent_timestamp || selectedPrescreen.completed_at || selectedPrescreen.created_at)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Column 2: ผลการคัดกรองสัญญาณชีพ (8 กล่องการ์ดเหมือนแบบที่แล้ว) */}
                  <div style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '18px 20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}>
                    <div style={{
                      fontSize: '15.5px',
                      fontWeight: 700,
                      color: '#1e40af',
                      paddingBottom: '10px',
                      marginBottom: '14px',
                      borderBottom: '1px solid #f1f5f9',
                    }}>
                      ผลการคัดกรองสัญญาณชีพ
                    </div>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: '10px',
                    }}>
                      {/* BP */}
                      <div style={{
                        border: '1px solid #dbe2ea',
                        borderRadius: '10px',
                        background: '#ffffff',
                        padding: '12px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        minHeight: '74px',
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#5b6e88', marginBottom: '4px' }}>
                          BP (ความดัน)
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>
                            {bpVal}
                          </span>
                          <span style={{ fontSize: '12.5px', color: '#8c9fb5', fontWeight: 500 }}>
                            mmHg
                          </span>
                        </div>
                      </div>

                      {/* Pulse */}
                      <div style={{
                        border: '1px solid #dbe2ea',
                        borderRadius: '10px',
                        background: '#ffffff',
                        padding: '12px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        minHeight: '74px',
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#5b6e88', marginBottom: '4px' }}>
                          Pulse (ชีพจร)
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>
                            {selectedPrescreen.pulse || '—'}
                          </span>
                          <span style={{ fontSize: '12.5px', color: '#8c9fb5', fontWeight: 500 }}>
                            bpm
                          </span>
                        </div>
                      </div>

                      {/* Temp */}
                      <div style={{
                        border: '1px solid #dbe2ea',
                        borderRadius: '10px',
                        background: '#ffffff',
                        padding: '12px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        minHeight: '74px',
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#5b6e88', marginBottom: '4px' }}>
                          Temp (อุณหภูมิ)
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>
                            {selectedPrescreen.temperature || '—'}
                          </span>
                          <span style={{ fontSize: '12.5px', color: '#8c9fb5', fontWeight: 500 }}>
                            °C
                          </span>
                        </div>
                      </div>

                      {/* RR */}
                      <div style={{
                        border: '1px solid #dbe2ea',
                        borderRadius: '10px',
                        background: '#ffffff',
                        padding: '12px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        minHeight: '74px',
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#5b6e88', marginBottom: '4px' }}>
                          RR (การหายใจ)
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>
                            {selectedPrescreen.rr || '—'}
                          </span>
                          <span style={{ fontSize: '12.5px', color: '#8c9fb5', fontWeight: 500 }}>
                            /m
                          </span>
                        </div>
                      </div>

                      {/* Weight */}
                      <div style={{
                        border: '1px solid #dbe2ea',
                        borderRadius: '10px',
                        background: '#ffffff',
                        padding: '12px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        minHeight: '74px',
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#5b6e88', marginBottom: '4px' }}>
                          น้ำหนัก
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>
                            {selectedPrescreen.weight || '—'}
                          </span>
                          <span style={{ fontSize: '12.5px', color: '#8c9fb5', fontWeight: 500 }}>
                            kg
                          </span>
                        </div>
                      </div>

                      {/* Height */}
                      <div style={{
                        border: '1px solid #dbe2ea',
                        borderRadius: '10px',
                        background: '#ffffff',
                        padding: '12px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        minHeight: '74px',
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#5b6e88', marginBottom: '4px' }}>
                          ส่วนสูง
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>
                            {selectedPrescreen.height || '—'}
                          </span>
                          <span style={{ fontSize: '12.5px', color: '#8c9fb5', fontWeight: 500 }}>
                            cm
                          </span>
                        </div>
                      </div>

                      {/* BMI */}
                      <div style={{
                        border: '1px solid #dbe2ea',
                        borderRadius: '10px',
                        background: '#ffffff',
                        padding: '12px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        minHeight: '74px',
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#5b6e88', marginBottom: '4px' }}>
                          BMI
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>
                            {bmiVal}
                          </span>
                          <span style={{ fontSize: '12.5px', color: '#8c9fb5', fontWeight: 500 }}>
                            kg/m²
                          </span>
                        </div>
                      </div>

                      {/* SpO2 */}
                      <div style={{
                        border: '1px solid #dbe2ea',
                        borderRadius: '10px',
                        background: '#ffffff',
                        padding: '12px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        minHeight: '74px',
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#5b6e88', marginBottom: '4px' }}>
                          SpO2 (ออกซิเจน)
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>
                            {selectedPrescreen.spo2 ? selectedPrescreen.spo2 : '—'}
                          </span>
                          <span style={{ fontSize: '12.5px', color: '#8c9fb5', fontWeight: 500 }}>
                            %
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Column 3: อาการและประวัติ */}
                  <div style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '18px 20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}>
                    <div style={{
                      fontSize: '15.5px',
                      fontWeight: 700,
                      color: '#1e40af',
                      paddingBottom: '10px',
                      marginBottom: '14px',
                      borderBottom: '1px solid #f1f5f9',
                    }}>
                      อาการและประวัติ
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <span style={{ fontWeight: 600, color: '#475569', fontSize: '14px' }}>อาการสำคัญ (CC):</span>
                        <div style={{
                          padding: '10px 14px',
                          background: '#f8fafc',
                          border: '1px solid #f1f5f9',
                          borderRadius: '8px',
                          marginTop: '6px',
                          whiteSpace: 'pre-wrap',
                          color: '#0f172a',
                          fontSize: '14.5px',
                          minHeight: '48px',
                          lineHeight: '1.6',
                        }}>
                          {selectedPrescreen.chief_complaint?.trim() || 'ไม่มี'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', fontSize: '14px', marginTop: '2px' }}>
                        <div>
                          <span style={{ fontWeight: 600, color: '#475569' }}>ดื่มสุรา:</span>{' '}
                          {formatAlcohol(selectedPrescreen.alcohol, selectedPrescreen.alcohol_detail)}
                        </div>
                        <div>
                          <span style={{ fontWeight: 600, color: '#475569' }}>สูบบุหรี่:</span>{' '}
                          {formatSmoking(selectedPrescreen.smoking, selectedPrescreen.smoking_detail)}
                        </div>
                      </div>

                      {selectedPrescreen.current_medications?.trim() && (
                        <div style={{ marginTop: '4px' }}>
                          <span style={{ fontWeight: 600, color: '#475569', fontSize: '13.5px' }}>ยาเดิมที่รับประทานอยู่:</span>
                          <div style={{
                            padding: '8px 12px',
                            background: '#f8fafc',
                            border: '1px solid #f1f5f9',
                            borderRadius: '8px',
                            marginTop: '4px',
                            fontSize: '13.5px',
                            color: '#0f172a',
                            whiteSpace: 'pre-wrap',
                          }}>
                            {selectedPrescreen.current_medications}
                          </div>
                        </div>
                      )}

                      {selectedPrescreen.additional_notes?.trim() && (
                        <div style={{ marginTop: '4px' }}>
                          <span style={{ fontWeight: 600, color: '#475569', fontSize: '13.5px' }}>ข้อมูลเพิ่มเติม / ข้อกังวล:</span>
                          <div style={{
                            padding: '8px 12px',
                            background: '#f8fafc',
                            border: '1px solid #f1f5f9',
                            borderRadius: '8px',
                            marginTop: '4px',
                            fontSize: '13.5px',
                            color: '#0f172a',
                            whiteSpace: 'pre-wrap',
                          }}>
                            {selectedPrescreen.additional_notes}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* รูปภาพแนบเพิ่มเติม (ด้านล่าง) */}
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#1e40af', marginBottom: '8px' }}>
                รูปภาพแนบเพิ่มเติม ({prescreenImages ? prescreenImages.length : 0} รูป)
              </div>
              {prescreenImages && prescreenImages.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '8px' }}>
                  {prescreenImages.map((img) => (
                    <button
                      type="button"
                      key={img.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxImageSrc(`/api/prescreening/images/${img.id}`);
                      }}
                      style={{
                        padding: 0,
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        background: '#fff',
                      }}
                      title="คลิกเพื่อดูภาพขนาดเต็ม"
                    >
                      <img
                        src={`/api/prescreening/images/${img.id}`}
                        alt="รูปภาพคัดกรอง"
                        style={{ width: '70px', height: '70px', objectFit: 'cover', display: 'block' }}
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '14px', color: '#94a3b8', fontStyle: 'italic', padding: '4px 0' }}>
                  ไม่มีรูปภาพแนบสำหรับเคสนี้
                </div>
              )}
            </div>

            {/* ปุ่มกดด้านล่าง Modal */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '18px', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => setSelectedPrescreen(null)}
                style={{
                  padding: '10px 22px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#475569',
                  fontSize: '14.5px',
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
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: selectedPrescreen.cid && selectedPrescreen.is_line_registered ? '#06c755' : '#e2e8f0',
                  color: selectedPrescreen.cid && selectedPrescreen.is_line_registered ? '#fff' : '#94a3b8',
                  fontSize: '14.5px',
                  fontWeight: 600,
                  cursor: selectedPrescreen.cid && selectedPrescreen.is_line_registered ? 'pointer' : 'not-allowed',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
                title={
                  !selectedPrescreen.is_line_registered
                    ? 'ผู้ป่วยยังไม่ได้ลงทะเบียน LINE OA หรือ Caregiver จึงไม่สามารถโทรได้'
                    : !selectedPrescreen.cid
                    ? 'ไม่พบ CID สำหรับเริ่มโทร'
                    : 'เริ่มโทร Video Call ทันที'
                }
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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

      {/* Lightbox ดูรูปภาพขนาดเต็ม */}
      {lightboxImageSrc && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px',
            fontFamily: "'Sarabun', 'TH Sarabun New', sans-serif",
          }}
          onClick={() => setLightboxImageSrc(null)}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img
              src={lightboxImageSrc}
              alt="ภาพขนาดเต็ม"
              style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: '8px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
            />
            <button
              type="button"
              onClick={() => setLightboxImageSrc(null)}
              style={{
                position: 'absolute',
                top: '-15px',
                right: '-15px',
                background: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '16px',
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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

// ---------------------------------------------------------------------------
// Visit-type badge
// ---------------------------------------------------------------------------
function VisitTypeBadge({ type }) {
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
  // 'all' | 'with-doctor' | 'no-doctor'
  const [visitFilter, setVisitFilter] = useState('all');

  // Determine page mode: combined vs appointments
  const isCombined = type === 'with-doctor' || type === 'no-doctor' || type === 'combined';
  const isAppointments = type === 'appointments';

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
      setData(results);
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

  // Reset visitFilter when navigating away from combined page
  useEffect(() => {
    setVisitFilter('all');
  }, [type]);

  // Unique clinics/doctors from loaded data
  const uniqueClinics = useMemo(() => {
    const set = new Set(data.map((row) => row.clinic_name).filter(Boolean));
    return Array.from(set).sort();
  }, [data]);

  const uniqueDoctors = useMemo(() => {
    const set = new Set(data.map((row) => row.doctor_name).filter(Boolean));
    return Array.from(set).sort();
  }, [data]);

  // Counts per visit_type (for combined mode only)
  const withDoctorCount = useMemo(
    () => data.filter((r) => r.visit_type === 'with-doctor').length,
    [data]
  );
  const noDoctorCount = useMemo(
    () => data.filter((r) => r.visit_type === 'no-doctor').length,
    [data]
  );

  // Client-side filtering
  const filteredData = useMemo(() => {
    let temp = data;

    // Visit type filter (combined mode only)
    if (isCombined && visitFilter !== 'all') {
      temp = temp.filter((row) => row.visit_type === visitFilter);
    }

    if (selectedClinic) {
      temp = temp.filter((row) => row.clinic_name === selectedClinic);
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
        const clinic = (row.clinic_name || '').toLowerCase();
        const note = (row.note || '').toLowerCase();
        return (
          hn.includes(term) ||
          patient.includes(term) ||
          doctor.includes(term) ||
          clinic.includes(term) ||
          note.includes(term)
        );
      });
    }

    return temp;
  }, [data, search, selectedDoctor, selectedClinic, isCombined, visitFilter]);

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
          <div className="cases-stat-card">
            <div className="cases-stat-icon total">📋</div>
            <div className="cases-stat-info">
              <span className="cases-stat-label">จำนวนเคสทั้งหมด</span>
              <span className="cases-stat-val" style={{ color: '#2563eb' }}>{data.length}</span>
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
                  id="filter-all"
                  className={`cases-type-pill${visitFilter === 'all' ? ' is-active' : ''}`}
                  onClick={() => setVisitFilter('all')}
                >
                  ทั้งหมด
                  <span className="cases-type-count">{data.length}</span>
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
                  placeholder="ค้นหา HN, ผู้ป่วย, แพทย์, แผนก..."
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
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>ไม่พบข้อมูล</div>
              <div style={{ fontSize: '0.875rem', color: '#64748b' }}>ไม่มีข้อมูลเคสที่ตรงกับเงื่อนไขในวันที่เลือก</div>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table" id="telemed-cases-table">
                <thead>
                  <tr>
                    <th style={{ width: '50px' }}>#</th>
                    <th style={{ width: '110px' }}>HN</th>
                    <th>ชื่อคนไข้</th>
                    <th>ชื่อแพทย์</th>
                    <th>แผนก / Clinic</th>
                    {isCombined && (
                      <th style={{ width: '130px' }}>วันที่ออกใบนัด</th>
                    )}
                    {isCombined && visitFilter === 'all' && (
                      <th style={{ width: '150px', textAlign: 'center' }}>ประเภท</th>
                    )}
                    {isAppointments && <th style={{ width: '130px' }}>Visit Date</th>}
                    {isAppointments && (
                      <th style={{ width: '130px', textAlign: 'center' }}>Line Connected</th>
                    )}
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row, idx) => (
                    <tr key={`${row.hn}-${idx}`}>
                      <td style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{idx + 1}</td>
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
                      <td style={{ color: '#334155', fontWeight: 500 }}>{row.doctor_name || '-'}</td>
                      <td>
                        <span className="cases-clinic-badge">
                          {row.clinic_name || '-'}
                        </span>
                      </td>
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
                        <span
                          style={{ fontSize: '0.8125rem', color: '#64748b' }}
                        >
                          {row.note || '-'}
                        </span>
                      </td>
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
    </>
  );
}

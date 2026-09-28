import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api/client';

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
      <span className="visit-type-badge visit-type-with-doctor">
        👨‍⚕️ พบแพทย์
      </span>
    );
  }
  if (type === 'no-doctor') {
    return (
      <span className="visit-type-badge visit-type-no-doctor">
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

      <div className="page-body">
        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">จำนวนเคสทั้งหมด</div>
            <div className="stat-value primary">{data.length}</div>
          </div>
          {isCombined && (
            <>
              <div className="stat-card">
                <div className="stat-label">พบแพทย์</div>
                <div className="stat-value success">{withDoctorCount}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">ไม่พบแพทย์</div>
                <div className="stat-value warning">{noDoctorCount}</div>
              </div>
            </>
          )}
          <div className="stat-card">
            <div className="stat-label">เคสที่ตรงตามคำค้นหา</div>
            <div className="stat-value">{filteredData.length}</div>
          </div>
        </div>

        {/* Table */}
        <div className="table-card">
          <div className="table-toolbar">
            {/* Visit-type filter buttons (combined mode only) */}
            {isCombined && (
              <div className="visit-filter-group" role="group" aria-label="กรองประเภทการพบแพทย์">
                <button
                  id="filter-all"
                  className={`visit-filter-btn${visitFilter === 'all' ? ' active' : ''}`}
                  onClick={() => setVisitFilter('all')}
                >
                  ทั้งหมด
                  <span className="visit-filter-count">{data.length}</span>
                </button>
                <button
                  id="filter-with-doctor"
                  className={`visit-filter-btn with-doctor${visitFilter === 'with-doctor' ? ' active' : ''}`}
                  onClick={() => setVisitFilter('with-doctor')}
                >
                  👨‍⚕️ พบแพทย์
                  <span className="visit-filter-count">{withDoctorCount}</span>
                </button>
                <button
                  id="filter-no-doctor"
                  className={`visit-filter-btn no-doctor${visitFilter === 'no-doctor' ? ' active' : ''}`}
                  onClick={() => setVisitFilter('no-doctor')}
                >
                  💊 ไม่พบแพทย์
                  <span className="visit-filter-count">{noDoctorCount}</span>
                </button>
              </div>
            )}

            <div className="search-box">
              <span className="search-icon">🔍</span>
              <input
                className="search-input"
                type="text"
                placeholder="ค้นหา HN, ชื่อผู้ป่วย, ชื่อแพทย์, คลินิก, บันทึก..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                id="search-telemed"
              />
            </div>

            <div className="date-picker-group">
              <label htmlFor="clinic-filter">คลินิก:</label>
              <select
                id="clinic-filter"
                className="filter-select"
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

            <div className="date-picker-group">
              <label htmlFor="doctor-filter">แพทย์:</label>
              <select
                id="doctor-filter"
                className="filter-select"
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

            <div className="date-picker-group">
              <label htmlFor="date-picker">วันที่:</label>
              <input
                id="date-picker"
                className="date-input"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="loading-container">
              <div className="spinner"></div>
              <span className="loading-text">กำลังโหลดข้อมูล...</span>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📭</div>
              <div className="empty-state-title">ไม่พบข้อมูล</div>
              <div className="empty-state-text">ไม่มีข้อมูลเคสที่ตรงกับเงื่อนไขในวันที่เลือก</div>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table" id="telemed-cases-table">
                <thead>
                  <tr>
                    <th style={{ width: '60px' }}>#</th>
                    <th style={{ width: '120px' }}>HN</th>
                    <th>ชื่อคนไข้</th>
                    <th>ชื่อแพทย์</th>
                    <th>Clinic</th>
                    {isCombined && (
                      <th style={{ width: '140px' }}>วันที่ออกใบนัด</th>
                    )}
                    {isCombined && visitFilter === 'all' && (
                      <th style={{ width: '160px', textAlign: 'center' }}>ประเภท</th>
                    )}
                    {isAppointments && <th style={{ width: '140px' }}>Visit Date</th>}
                    {isAppointments && (
                      <th style={{ width: '140px', textAlign: 'center' }}>Line Connected</th>
                    )}
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row, idx) => (
                    <tr key={`${row.hn}-${idx}`}>
                      <td>{idx + 1}</td>
                      <td>
                        {row.hn ? (
                          <span className="hn-text">{row.hn}</span>
                        ) : (
                          <span style={{ color: 'var(--gray-400)' }}>-</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--gray-800)' }}>
                        {row.patient_name || '-'}
                      </td>
                      <td>{row.doctor_name || '-'}</td>
                      <td>
                        <span
                          className="ver-badge"
                          style={{
                            background: 'var(--primary-light)',
                            color: 'var(--primary)',
                            border: 'none',
                          }}
                        >
                          {row.clinic_name || '-'}
                        </span>
                      </td>
                      {isCombined && (
                        <td>
                          <span className="date-text" style={{ fontWeight: 500 }}>
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
                          <span className="date-text" style={{ fontWeight: 500 }}>
                            {formatShortDate(row.nextdate)}
                          </span>
                        </td>
                      )}
                      {isAppointments && (
                        <td style={{ textAlign: 'center' }}>
                          {row.line_connected ? (
                            <span style={{ fontSize: '1.2rem' }}>✅</span>
                          ) : (
                            <span style={{ color: 'var(--gray-300)' }}>-</span>
                          )}
                        </td>
                      )}
                      <td>
                        <span
                          className="note-text"
                          style={{ fontSize: '0.8125rem', color: 'var(--gray-600)' }}
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
            <div className="table-footer">
              <div className="table-info">
                แสดง {filteredData.length} จาก {data.length} รายการ
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api } from '../api/client';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayStr() {
  return toDateStr(new Date());
}

function getPresetRange(preset) {
  const today = new Date();
  switch (preset) {
    case 'today':
      return { startDate: getTodayStr(), endDate: getTodayStr() };
    case 'month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { startDate: toDateStr(start), endDate: getTodayStr() };
    }
    case '3month': {
      const start = new Date(today);
      start.setMonth(start.getMonth() - 3);
      return { startDate: toDateStr(start), endDate: getTodayStr() };
    }
    default:
      return null;
  }
}

function formatThaiShortDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------
function groupBy(visits, keyFn, labelFn) {
  const map = new Map();
  visits.forEach((v) => {
    const key = keyFn(v);
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, { key, label: labelFn(v), count: 0, visits: [] });
    }
    const entry = map.get(key);
    entry.count += 1;
    entry.visits.push(v);
  });
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function StatCard({ label, value, color = 'primary' }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${color}`}>{value.toLocaleString()}</div>
    </div>
  );
}

// Inline detail rows ใต้แถวที่คลิก
function InlineDetailRows({ visits, colSpan, onClose }) {
  const ref = useRef(null);

  // scroll into view เมื่อ open
  useEffect(() => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  return (
    <tr className="inline-detail-row" ref={ref}>
      <td colSpan={colSpan} style={{ padding: 0 }}>
        <div className="inline-detail-panel">
          {/* Header */}
          <div className="inline-detail-header">
            <span className="inline-detail-title">
              🔍 รายละเอียด
              <span className="detail-panel-count" style={{ marginLeft: 8 }}>{visits.length} เคส</span>
            </span>
            <button
              className="detail-panel-close"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              id="inline-detail-close-btn"
              aria-label="ปิดรายละเอียด"
            >
              ✕
            </button>
          </div>

          {/* Detail table */}
          <div className="data-table-wrapper">
            <table className="data-table inline-detail-table" id="dashboard-detail-table">
              <thead>
                <tr>
                  <th style={{ width: '46px' }}>#</th>
                  <th style={{ width: '100px' }}>HN</th>
                  <th>ชื่อคนไข้</th>
                  <th style={{ width: '100px' }}>วันที่</th>
                  <th>แผนก</th>
                  <th>แพทย์</th>
                  <th style={{ width: '90px' }}>ICD-10</th>
                  <th>Diagnosis</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((v, idx) => (
                  <tr key={`${v.vn}-${idx}`} className="inline-detail-data-row">
                    <td style={{ color: 'var(--gray-400)', fontSize: '0.8rem' }}>{idx + 1}</td>
                    <td>
                      <span className="hn-text">{v.hn || '-'}</span>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--gray-800)' }}>
                      {v.patient_name || '-'}
                    </td>
                    <td>
                      <span className="date-text">{formatThaiShortDate(v.vstdate)}</span>
                    </td>
                    <td>
                      <span
                        className="ver-badge"
                        style={{ background: '#eff6ff', color: 'var(--primary-700)', border: 'none' }}
                      >
                        {v.spclty_name || '-'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--gray-700)' }}>{v.doctor_name || '-'}</td>
                    <td>
                      {v.icd10 ? (
                        <span className="icd-code-badge">{v.icd10}</span>
                      ) : (
                        <span style={{ color: 'var(--gray-300)' }}>-</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--gray-600)' }}>
                      {v.icd10_name || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  );
}

function SummaryTable({ rows, selectedKey, onSelect }) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📭</div>
        <div className="empty-state-title">ไม่พบข้อมูล</div>
        <div className="empty-state-text">ไม่มีข้อมูลในช่วงวันที่เลือก</div>
      </div>
    );
  }

  const total = rows.reduce((s, r) => s + r.count, 0);
  // colSpan: #, label, count, pct = 4 columns
  const COL_SPAN = 4;

  return (
    <div className="data-table-wrapper">
      <table className="data-table" id="dashboard-summary-table">
        <thead>
          <tr>
            <th style={{ width: '60px' }}>#</th>
            <th>ชื่อ</th>
            <th style={{ width: '130px', textAlign: 'right' }}>จำนวนเคส</th>
            <th style={{ width: '140px', textAlign: 'right' }}>สัดส่วน (%)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const pct = total > 0 ? ((row.count / total) * 100).toFixed(1) : '0.0';
            const isSelected = row.key === selectedKey;

            return (
              <>
                {/* Summary row */}
                <tr
                  key={row.key}
                  className={`summary-row-clickable${isSelected ? ' selected' : ''}`}
                  onClick={() => onSelect(isSelected ? null : row.key)}
                  title={isSelected ? 'คลิกเพื่อปิดรายละเอียด' : 'คลิกเพื่อดูรายละเอียด'}
                >
                  <td>
                    {idx < 3 ? (
                      <span className={`rank-badge rank-${idx + 1}`}>{idx + 1}</span>
                    ) : (
                      <span style={{ color: 'var(--gray-400)', fontSize: '0.875rem' }}>{idx + 1}</span>
                    )}
                  </td>
                  <td>
                    <span style={{ fontWeight: 500, color: 'var(--gray-800)' }}>{row.label}</span>
                    {isSelected && (
                      <span className="expand-indicator">▲ ซ่อน</span>
                    )}
                    {!isSelected && (
                      <span className="expand-indicator"></span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="dash-count-badge">{row.count.toLocaleString()}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="pct-bar-wrap">
                      <div className="pct-bar-fill" style={{ width: `${pct}%` }} />
                      <span className="pct-bar-label">{pct}%</span>
                    </div>
                  </td>
                </tr>

                {/* Inline detail — appears directly below clicked row */}
                {isSelected && (
                  <InlineDetailRows
                    key={`detail-${row.key}`}
                    visits={row.visits}
                    colSpan={COL_SPAN}
                    onClose={() => onSelect(null)}
                  />
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function TelemedDashboardPage() {
  const today = getTodayStr();

  const [preset, setPreset] = useState('month');
  const [startDate, setStartDate] = useState(() => getPresetRange('month').startDate);
  const [endDate, setEndDate] = useState(today);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('doctor'); // 'clinic' | 'doctor' | 'icd'
  const [selectedKey, setSelectedKey] = useState(null);

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    setLoading(true);
    setSelectedKey(null);
    try {
      const results = await api.getTelemedDashboard(startDate, endDate);
      setVisits(results);
    } catch (err) {
      console.error('Dashboard fetch error:', err.message);
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset selection when tab changes
  useEffect(() => {
    setSelectedKey(null);
  }, [activeTab]);

  // ---------------------------------------------------------------------------
  // Preset buttons
  // ---------------------------------------------------------------------------
  const handlePreset = (p) => {
    setPreset(p);
    const range = getPresetRange(p);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  const handleCustomDate = (field, val) => {
    setPreset('custom');
    if (field === 'start') setStartDate(val);
    else setEndDate(val);
  };

  // ---------------------------------------------------------------------------
  // Aggregations (memoized)
  // ---------------------------------------------------------------------------
  const byClinic = useMemo(
    () => groupBy(visits, (v) => v.spclty_name || '(ไม่ระบุแผนก)', (v) => v.spclty_name || '(ไม่ระบุแผนก)'),
    [visits]
  );
  const byDoctor = useMemo(
    () => groupBy(
      visits,
      (v) => v.doctor_code || '(ไม่ระบุ)',
      (v) => v.doctor_name || '(ไม่ระบุแพทย์)'
    ),
    [visits]
  );
  const byIcd = useMemo(
    () => groupBy(
      visits,
      (v) => v.icd10 || '(ไม่ระบุ)',
      (v) => v.icd10 ? `${v.icd10} — ${v.icd10_name || ''}` : '(ไม่ระบุ ICD)'
    ),
    [visits]
  );

  const summaryRows = activeTab === 'clinic' ? byClinic : activeTab === 'doctor' ? byDoctor : byIcd;

  // Stats
  const uniqueDoctors = useMemo(() => new Set(visits.map((v) => v.doctor_code).filter(Boolean)).size, [visits]);
  const uniqueClinics = useMemo(() => new Set(visits.map((v) => v.spclty_name).filter(Boolean)).size, [visits]);
  const uniqueIcds = useMemo(() => new Set(visits.map((v) => v.icd10).filter(Boolean)).size, [visits]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h2 className="page-title">📊 Dashboard Telemed</h2>
            <p className="page-subtitle">
              สถิติเคส Telemed จากข้อมูล Visit
            </p>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Date Range Picker */}
        <div className="date-range-card">
          <div className="date-range-presets">
            <span className="date-range-label">ช่วงเวลา:</span>
            <button
              id="preset-today"
              className={`date-range-btn${preset === 'today' ? ' active' : ''}`}
              onClick={() => handlePreset('today')}
            >
              วันนี้
            </button>
            <button
              id="preset-month"
              className={`date-range-btn${preset === 'month' ? ' active' : ''}`}
              onClick={() => handlePreset('month')}
            >
              เดือนนี้
            </button>
            <button
              id="preset-3month"
              className={`date-range-btn${preset === '3month' ? ' active' : ''}`}
              onClick={() => handlePreset('3month')}
            >
              3 เดือน
            </button>
            <div className="date-range-custom">
              <span className="date-range-label" style={{ marginLeft: 8 }}>กำหนดเอง:</span>
              <input
                id="custom-start-date"
                type="date"
                className={`date-input${preset === 'custom' ? ' custom-active' : ''}`}
                value={startDate}
                max={endDate}
                onChange={(e) => handleCustomDate('start', e.target.value)}
              />
              <span style={{ color: 'var(--gray-400)', fontSize: '0.875rem' }}>ถึง</span>
              <input
                id="custom-end-date"
                type="date"
                className={`date-input${preset === 'custom' ? ' custom-active' : ''}`}
                value={endDate}
                min={startDate}
                max={today}
                onChange={(e) => handleCustomDate('end', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="stats-row">
          <StatCard label="จำนวนเคสทั้งหมด" value={visits.length} color="primary" />
          <StatCard label="จำนวนแพทย์" value={uniqueDoctors} color="success" />
          <StatCard label="จำนวนแผนก" value={uniqueClinics} color="accent" />
          <StatCard label="จำนวน ICD-10" value={uniqueIcds} color="warning" />
        </div>

        {/* Tabs + Summary Table */}
        <div className="table-card">
          {/* Tab bar */}
          <div className="dash-tabs">
            <button
              id="tab-clinic"
              className={`dash-tab${activeTab === 'clinic' ? ' active' : ''}`}
              onClick={() => setActiveTab('clinic')}
            >
              🏢 ตามแผนก
              <span className="dash-tab-count">{byClinic.length}</span>
            </button>
            <button
              id="tab-doctor"
              className={`dash-tab${activeTab === 'doctor' ? ' active' : ''}`}
              onClick={() => setActiveTab('doctor')}
            >
              👨‍⚕️ ตามแพทย์
              <span className="dash-tab-count">{byDoctor.length}</span>
            </button>
            <button
              id="tab-icd"
              className={`dash-tab${activeTab === 'icd' ? ' active' : ''}`}
              onClick={() => setActiveTab('icd')}
            >
              🔬 ตาม ICD-10
              <span className="dash-tab-count">{byIcd.length}</span>
            </button>
            <div style={{ flex: 1 }} />
            {selectedKey && (
              <button
                className="date-range-btn"
                onClick={() => setSelectedKey(null)}
                id="clear-selection-btn"
              >
                ✕ ล้างการเลือก
              </button>
            )}
          </div>

          {loading ? (
            <div className="loading-container">
              <div className="spinner" />
              <span className="loading-text">กำลังโหลดข้อมูล...</span>
            </div>
          ) : (
            <SummaryTable
              rows={summaryRows}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
            />
          )}

          {!loading && visits.length > 0 && (
            <div className="table-footer">
              <div className="table-info">
                รวม {visits.length.toLocaleString()} เคส ตั้งแต่{' '}
                {formatThaiShortDate(startDate)} ถึง {formatThaiShortDate(endDate)}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

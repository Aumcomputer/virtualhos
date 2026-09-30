import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api } from '../api/client';
import './TelemedDashboardPage.css';

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
function StatCard({ label, value, icon, iconType = 'blue' }) {
  return (
    <div className="dash-stat-card">
      <div className={`dash-stat-icon-wrap dash-stat-icon-${iconType}`}>
        {icon}
      </div>
      <div className="dash-stat-content">
        <span className="dash-stat-label">{label}</span>
        <span className="dash-stat-val">{value.toLocaleString()}</span>
      </div>
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
        <div className="dash-inline-detail-wrapper">
          {/* Header */}
          <div className="dash-inline-header">
            <span className="dash-inline-title">
              🔍 รายละเอียดเคส
              <span className="dash-inline-count">{visits.length} เคส</span>
            </span>
            <button
              className="dash-inline-close-btn"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              id="inline-detail-close-btn"
              aria-label="ปิดรายละเอียด"
            >
              ✕
            </button>
          </div>

          {/* Sub-table */}
          <div className="dash-sub-table-container">
            <table className="dash-sub-table" id="dashboard-detail-table">
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
                  <tr key={`${v.vn}-${idx}`}>
                    <td style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{idx + 1}</td>
                    <td>
                      <span className="font-mono font-bold" style={{ color: '#1e293b' }}>{v.hn || '-'}</span>
                    </td>
                    <td style={{ fontWeight: 600, color: '#0f172a' }}>
                      {v.patient_name || '-'}
                    </td>
                    <td>
                      <span style={{ color: '#475569' }}>{formatThaiShortDate(v.vstdate)}</span>
                    </td>
                    <td>
                      <span className="dash-dept-pill">
                        {v.spclty_name || '-'}
                      </span>
                    </td>
                    <td style={{ color: '#334155', fontWeight: 500 }}>{v.doctor_name || '-'}</td>
                    <td>
                      {v.icd10 ? (
                        <span className="dash-icd-pill">{v.icd10}</span>
                      ) : (
                        <span style={{ color: '#cbd5e1' }}>-</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: '#64748b' }}>
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
      <div className="empty-state" style={{ padding: '48px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>ไม่พบข้อมูล</div>
        <div style={{ fontSize: '0.875rem', color: '#64748b' }}>ไม่มีข้อมูลในช่วงวันที่เลือก</div>
      </div>
    );
  }

  const total = rows.reduce((s, r) => s + r.count, 0);
  const COL_SPAN = 4;

  return (
    <div className="data-table-wrapper">
      <table className="data-table" id="dashboard-summary-table">
        <thead>
          <tr>
            <th style={{ width: '60px' }}>#</th>
            <th>ชื่อรายการ</th>
            <th style={{ width: '130px', textAlign: 'right' }}>จำนวนเคส</th>
            <th style={{ width: '160px', textAlign: 'right' }}>สัดส่วน (%)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const pct = total > 0 ? ((row.count / total) * 100).toFixed(1) : '0.0';
            const isSelected = row.key === selectedKey;

            return (
              <React.Fragment key={row.key}>
                {/* Summary row */}
                <tr
                  className={`dash-summary-row${isSelected ? ' is-selected' : ''}`}
                  onClick={() => onSelect(isSelected ? null : row.key)}
                  title={isSelected ? 'คลิกเพื่อปิดรายละเอียด' : 'คลิกเพื่อดูรายละเอียด'}
                >
                  <td>
                    {idx === 0 ? (
                      <span className="dash-rank-pill dash-rank-gold">1</span>
                    ) : idx === 1 ? (
                      <span className="dash-rank-pill dash-rank-silver">2</span>
                    ) : idx === 2 ? (
                      <span className="dash-rank-pill dash-rank-bronze">3</span>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '0.8125rem', fontWeight: 600, paddingLeft: 6 }}>{idx + 1}</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>{row.label}</span>
                      <span style={{ fontSize: '0.75rem', color: isSelected ? '#2563eb' : '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {isSelected ? '▲ ซ่อน' : '▼ ดูเคส'}
                      </span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="dash-count-pill">{row.count.toLocaleString()}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="dash-pct-bar-wrapper">
                      <div className="dash-pct-bar-fill" style={{ width: `${pct}%` }} />
                      <span className="dash-pct-bar-text">{pct}%</span>
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
              </React.Fragment>
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

      <div className="page-body telemed-dashboard-container">
        {/* Date Range Picker */}
        <div className="dash-toolbar-card">
          <div className="dash-presets-group">
            <span className="dash-toolbar-label">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              ช่วงเวลา:
            </span>
            <button
              id="preset-today"
              className={`dash-preset-btn${preset === 'today' ? ' is-active' : ''}`}
              onClick={() => handlePreset('today')}
            >
              วันนี้
            </button>
            <button
              id="preset-month"
              className={`dash-preset-btn${preset === 'month' ? ' is-active' : ''}`}
              onClick={() => handlePreset('month')}
            >
              เดือนนี้
            </button>
            <button
              id="preset-3month"
              className={`dash-preset-btn${preset === '3month' ? ' is-active' : ''}`}
              onClick={() => handlePreset('3month')}
            >
              3 เดือน
            </button>
          </div>

          <div className="dash-custom-dates">
            <span className="dash-toolbar-label">กำหนดเอง:</span>
            <input
              id="custom-start-date"
              type="date"
              className={`dash-date-field${preset === 'custom' ? ' is-custom-active' : ''}`}
              value={startDate}
              max={endDate}
              onChange={(e) => handleCustomDate('start', e.target.value)}
            />
            <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>ถึง</span>
            <input
              id="custom-end-date"
              type="date"
              className={`dash-date-field${preset === 'custom' ? ' is-custom-active' : ''}`}
              value={endDate}
              min={startDate}
              max={today}
              onChange={(e) => handleCustomDate('end', e.target.value)}
            />
          </div>
        </div>

        {/* Stat Cards */}
        <div className="dash-stats-grid">
          <StatCard label="จำนวนเคสทั้งหมด" value={visits.length} icon="🩺" iconType="blue" />
          <StatCard label="จำนวนแพทย์" value={uniqueDoctors} icon="👨‍⚕️" iconType="emerald" />
          <StatCard label="จำนวนแผนก" value={uniqueClinics} icon="🏥" iconType="indigo" />
          <StatCard label="จำนวน ICD-10" value={uniqueIcds} icon="🔬" iconType="amber" />
        </div>

        {/* Tabs + Summary Table */}
        <div className="dash-main-card">
          {/* Tab bar */}
          <div className="dash-tabs-bar">
            <div className="dash-tab-pill-group">
              <button
                id="tab-clinic"
                className={`dash-tab-pill${activeTab === 'clinic' ? ' is-active' : ''}`}
                onClick={() => setActiveTab('clinic')}
              >
                🏢 ตามแผนก
                <span className="dash-tab-count-badge">{byClinic.length}</span>
              </button>
              <button
                id="tab-doctor"
                className={`dash-tab-pill${activeTab === 'doctor' ? ' is-active' : ''}`}
                onClick={() => setActiveTab('doctor')}
              >
                👨‍⚕️ ตามแพทย์
                <span className="dash-tab-count-badge">{byDoctor.length}</span>
              </button>
              <button
                id="tab-icd"
                className={`dash-tab-pill${activeTab === 'icd' ? ' is-active' : ''}`}
                onClick={() => setActiveTab('icd')}
              >
                🔬 ตาม ICD-10
                <span className="dash-tab-count-badge">{byIcd.length}</span>
              </button>
            </div>

            {selectedKey && (
              <button
                className="dash-btn-clear-selection"
                onClick={() => setSelectedKey(null)}
                id="clear-selection-btn"
              >
                ✕ ล้างการเลือก
              </button>
            )}
          </div>

          {loading ? (
            <div className="loading-container" style={{ padding: '48px 0' }}>
              <div className="spinner" />
              <span className="loading-text" style={{ marginTop: 12, color: '#64748b' }}>กำลังโหลดข้อมูล...</span>
            </div>
          ) : (
            <SummaryTable
              rows={summaryRows}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
            />
          )}

          {!loading && visits.length > 0 && (
            <div className="table-footer" style={{ padding: '14px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
              <div className="table-info" style={{ color: '#64748b', fontSize: '0.8125rem' }}>
                รวม <strong>{visits.length.toLocaleString()}</strong> เคส ตั้งแต่{' '}
                {formatThaiShortDate(startDate)} ถึง {formatThaiShortDate(endDate)}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

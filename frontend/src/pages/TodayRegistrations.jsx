import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';

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

export default function TodayRegistrations() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getLineIdsToday(selectedDate, search);
      setData(result.data);
      setTotal(result.total);
    } catch (err) {
      console.error('Failed to fetch today data', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalHealthId = data.filter((r) => r.has_health_id).length;
  const pendingHealthId = Math.max(0, total - totalHealthId);
  const healthIdPercent = total > 0 ? Math.round((totalHealthId / total) * 100) : 0;
  const isToday = selectedDate === getTodayStr();

  const handlePhoneUpdated = (id, newPhone) => {
    setData((prev) => prev.map((item) => (item.id === id ? { ...item, phone: newPhone } : item)));
  };

  return (
    <>
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h2 className="page-title">
              {isToday ? 'ลงทะเบียนวันนี้' : `ลงทะเบียนวันที่ ${formatThaiDate(selectedDate)}`}
            </h2>
            <p className="page-subtitle">
              {isToday
                ? 'รายชื่อผู้ป่วยที่ลงทะเบียนและเชื่อมต่อบัญชี LINE OA วันนี้'
                : `รายชื่อผู้ป่วยที่ลงทะเบียนในวันที่ ${formatThaiDate(selectedDate)}`}
            </p>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Modern Stats Grid */}
        <div className="loa-stats-grid">
          {/* Card 1: Total Today */}
          <div className="loa-stat-card">
            <div className="loa-stat-info">
              <span className="loa-stat-label">ลงทะเบียนวันนี้</span>
              <div className="loa-stat-value-group">
                <span className="loa-stat-value" style={{ color: '#2563eb' }}>{total}</span>
                <span className="loa-stat-unit">คน</span>
              </div>
              <span className="loa-stat-badge blue">
                {isToday ? 'ผู้ป่วยใหม่ประจำวัน' : formatThaiDate(selectedDate)}
              </span>
            </div>
            <div className="loa-stat-icon-wrapper blue">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
          </div>

          {/* Card 2: Verified Health ID */}
          <div className="loa-stat-card">
            <div className="loa-stat-info">
              <span className="loa-stat-label">ยืนยัน Health ID แล้ว</span>
              <div className="loa-stat-value-group">
                <span className="loa-stat-value" style={{ color: '#059669' }}>{totalHealthId}</span>
                <span className="loa-stat-unit">คน</span>
              </div>
              <span className="loa-stat-badge green">
                {healthIdPercent}% ของผู้ลงทะเบียน
              </span>
            </div>
            <div className="loa-stat-icon-wrapper green">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
          </div>

          {/* Card 3: Pending Health ID */}
          <div className="loa-stat-card">
            <div className="loa-stat-info">
              <span className="loa-stat-label">ยังไม่ลงทะเบียน Health ID</span>
              <div className="loa-stat-value-group">
                <span className="loa-stat-value" style={{ color: '#d97706' }}>{pendingHealthId}</span>
                <span className="loa-stat-unit">คน</span>
              </div>
              <span className="loa-stat-badge amber">
                รอยืนยันตัวตน
              </span>
            </div>
            <div className="loa-stat-icon-wrapper amber">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
          </div>
        </div>

        {/* Modern Table Card */}
        <div className="loa-card">
          <div className="loa-toolbar">
            <div className="loa-toolbar-left">
              <div className="loa-search-box">
                <span className="loa-search-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </span>
                <input
                  className="loa-search-input"
                  type="text"
                  placeholder="ค้นหา ชื่อ-สกุล, HN, เบอร์โทร..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  id="search-today"
                />
                {search && (
                  <button
                    type="button"
                    className="loa-search-clear"
                    onClick={() => setSearch('')}
                    title="ล้างข้อความค้นหา"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="loa-toolbar-right">
              <div className="loa-date-picker-wrap">
                <span className="loa-date-label">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  วันที่:
                </span>
                <input
                  id="date-picker"
                  className="loa-date-input"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  max={getTodayStr()}
                />
              </div>

              {!isToday && (
                <button
                  type="button"
                  className="loa-today-btn"
                  onClick={() => setSelectedDate(getTodayStr())}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                  กลับไปวันนี้
                </button>
              )}
            </div>
          </div>

          <DataTable data={data} loading={loading} onPhoneUpdated={handlePhoneUpdated} />

          {data.length > 0 && (
            <div className="loa-footer">
              <div className="loa-footer-info">
                แสดงผล <strong>{data.length}</strong> จากทั้งหมด <strong>{total}</strong> รายการ
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

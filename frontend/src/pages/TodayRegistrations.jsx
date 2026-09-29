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
                ? 'รายชื่อผู้ป่วยที่ลงทะเบียน LINE OA วันนี้'
                : 'รายชื่อผู้ป่วยที่ลงทะเบียนในวันที่เลือก'}
            </p>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">ลงทะเบียนวันนี้</div>
            <div className="stat-value primary">{total}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">ลงทะเบียน Health ID</div>
            <div className="stat-value success">{totalHealthId}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">ยังไม่ลงทะเบียน Health ID</div>
            <div className="stat-value accent">{total - totalHealthId}</div>
          </div>
        </div>

        {/* Table */}
        <div className="table-card">
          <div className="table-toolbar">
            <div className="search-box">
              <span className="search-icon">🔍</span>
              <input
                className="search-input"
                type="text"
                placeholder="ค้นหา ชื่อ, HN, เบอร์โทร..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                id="search-today"
              />
            </div>
            <div className="date-picker-group">
              <label htmlFor="date-picker">เลือกวันที่:</label>
              <input
                id="date-picker"
                className="date-input"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={getTodayStr()}
              />
            </div>
          </div>

          <DataTable data={data} loading={loading} onPhoneUpdated={handlePhoneUpdated} />

          {data.length > 0 && (
            <div className="table-footer">
              <div className="table-info">
                ทั้งหมด {total} รายการ
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

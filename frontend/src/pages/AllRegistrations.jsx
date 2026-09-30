import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import DataTable from '../components/DataTable';

export default function AllRegistrations() {
  const { user, isAdmin } = useAuth();
  const canAccess = isAdmin || user?.role === 'request_telemed';
  const navigate = useNavigate();

  // Redirect users without access
  useEffect(() => {
    if (!canAccess) {
      navigate('/', { replace: true });
    }
  }, [canAccess, navigate]);

  if (!canAccess) return null;

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const limit = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getLineIds(page, limit, search);
      setData(result.data);
      setPagination(result.pagination);
    } catch (err) {
      console.error('Failed to fetch data', err);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1); // reset page when search changes
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const totalHealthId = data.filter((r) => r.has_health_id).length;

  const handlePhoneUpdated = (id, newPhone) => {
    setData((prev) => prev.map((item) => (item.id === id ? { ...item, phone: newPhone } : item)));
  };

  return (
    <>
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h2 className="page-title">ข้อมูลลงทะเบียน LINE OA ทั้งหมด</h2>
            <p className="page-subtitle">รายชื่อและประวัติผู้ป่วยที่ลงทะเบียนเชื่อมต่อบัญชี LINE OA ทั้งหมดในระบบ</p>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Modern Stats Grid */}
        <div className="loa-stats-grid">
          {/* Card 1: Total */}
          <div className="loa-stat-card">
            <div className="loa-stat-info">
              <span className="loa-stat-label">ลงทะเบียนทั้งหมด</span>
              <div className="loa-stat-value-group">
                <span className="loa-stat-value" style={{ color: '#2563eb' }}>{pagination.total}</span>
                <span className="loa-stat-unit">คน</span>
              </div>
              <span className="loa-stat-badge blue">ฐานข้อมูลระบบทั้งหมด</span>
            </div>
            <div className="loa-stat-icon-wrapper blue">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
          </div>

          {/* Card 2: Health ID in Current Page */}
          <div className="loa-stat-card">
            <div className="loa-stat-info">
              <span className="loa-stat-label">ยืนยัน Health ID ในหน้านี้</span>
              <div className="loa-stat-value-group">
                <span className="loa-stat-value" style={{ color: '#059669' }}>{totalHealthId}</span>
                <span className="loa-stat-unit">/ {data.length} คน</span>
              </div>
              <span className="loa-stat-badge green">
                {data.length > 0 ? Math.round((totalHealthId / data.length) * 100) : 0}% ของหน้านี้
              </span>
            </div>
            <div className="loa-stat-icon-wrapper green">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
          </div>

          {/* Card 3: Pagination Position */}
          <div className="loa-stat-card">
            <div className="loa-stat-info">
              <span className="loa-stat-label">หน้าปัจจุบัน</span>
              <div className="loa-stat-value-group">
                <span className="loa-stat-value" style={{ color: '#475569' }}>{page}</span>
                <span className="loa-stat-unit">/ {pagination.totalPages || 1} หน้า</span>
              </div>
              <span className="loa-stat-badge amber">
                จำกัด {limit} รายการ/หน้า
              </span>
            </div>
            <div className="loa-stat-icon-wrapper amber">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </div>
          </div>
        </div>

        {/* Modern Table Card */}
        <div className="loa-card">
          <div className="loa-toolbar">
            <div className="loa-toolbar-left" style={{ maxWidth: '480px' }}>
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
                  placeholder="ค้นหา ชื่อ-สกุล, HN, เบอร์โทร, CID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  id="search-all"
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
              <div style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 500 }}>
                ทั้งหมด <strong>{pagination.total}</strong> รายการ
              </div>
            </div>
          </div>

          <DataTable data={data} loading={loading} onPhoneUpdated={handlePhoneUpdated} />

          {/* Modern Pagination */}
          {pagination.totalPages > 1 && (
            <div className="loa-footer">
              <div className="loa-footer-info">
                แสดง <strong>{(page - 1) * limit + 1}–{Math.min(page * limit, pagination.total)}</strong> จาก <strong>{pagination.total}</strong> รายการ
              </div>
              <div className="loa-pagination">
                <button
                  type="button"
                  className="loa-page-btn"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  id="btn-prev"
                  title="หน้าก่อนหน้า"
                >
                  ◀
                </button>
                {Array.from({ length: Math.min(pagination.totalPages, 7) }, (_, i) => {
                  let pageNum;
                  if (pagination.totalPages <= 7) {
                    pageNum = i + 1;
                  } else if (page <= 4) {
                    pageNum = i + 1;
                  } else if (page >= pagination.totalPages - 3) {
                    pageNum = pagination.totalPages - 6 + i;
                  } else {
                    pageNum = page - 3 + i;
                  }
                  return (
                    <button
                      type="button"
                      key={pageNum}
                      className={`loa-page-btn ${pageNum === page ? 'active' : ''}`}
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="loa-page-btn"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage(page + 1)}
                  id="btn-next"
                  title="หน้าถัดไป"
                >
                  ▶
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

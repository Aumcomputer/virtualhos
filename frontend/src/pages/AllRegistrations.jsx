import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import DataTable from '../components/DataTable';

export default function AllRegistrations() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  // Redirect non-admin users to Telemed page
  useEffect(() => {
    if (!isAdmin) {
      navigate('/telemed-with-doctor', { replace: true });
    }
  }, [isAdmin, navigate]);

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
      console.error('Failed to fetch data');
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

  return (
    <>
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h2 className="page-title">ข้อมูลลงทะเบียน LINE OA</h2>
            <p className="page-subtitle">รายชื่อผู้ป่วยที่ลงทะเบียนเชื่อมต่อ LINE OA ทั้งหมด</p>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">ลงทะเบียนทั้งหมด</div>
            <div className="stat-value primary">{pagination.total}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">ลงทะเบียน Health ID</div>
            <div className="stat-value success">{totalHealthId}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">หน้าปัจจุบัน</div>
            <div className="stat-value">{page} / {pagination.totalPages || 1}</div>
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
                id="search-all"
              />
            </div>
          </div>

          <DataTable data={data} loading={loading} />

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="table-footer">
              <div className="table-info">
                แสดง {(page - 1) * limit + 1}–{Math.min(page * limit, pagination.total)} จาก {pagination.total} รายการ
              </div>
              <div className="pagination">
                <button
                  className="pagination-btn"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  id="btn-prev"
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
                      key={pageNum}
                      className={`pagination-btn${pageNum === page ? ' active' : ''}`}
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  className="pagination-btn"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage(page + 1)}
                  id="btn-next"
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

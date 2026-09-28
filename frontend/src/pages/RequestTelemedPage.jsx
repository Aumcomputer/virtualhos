import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

function formatThaiDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    const parts = String(dateStr).split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, day] = parts.map(Number);
    const months = [
      '', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
    ];
    return `${day} ${months[m]} ${y + 543}`;
  }
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear() + 543;
  const months = [
    '', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
  ];
  return `${day} ${months[month]} ${year}`;
}

function formatThaiDateTime(dateTimeStr) {
  if (!dateTimeStr) return '-';
  const d = new Date(dateTimeStr);
  if (isNaN(d.getTime())) return dateTimeStr;

  const day = String(d.getDate()).padStart(2, '0');
  const month = d.getMonth() + 1;
  const year = d.getFullYear() + 543;
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  const months = [
    '', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
  ];
  return `${day} ${months[month]} ${year} ${hours}:${mins} น.`;
}

function getStatusBadgeConfig(status) {
  const str = String(status || '').trim();
  if (str.includes('รอตรวจสอบ')) {
    return {
      label: 'รอตรวจสอบ',
      className: 'status-pill-pending',
      style: {
        background: '#fef3c7',
        color: '#92400e',
        border: '1px solid #fde68a',
      },
    };
  }
  if (str.includes('สามารถจัดส่งได้') && !str.includes('ไม่สามารถ')) {
    return {
      label: 'สามารถจัดส่งได้',
      className: 'status-pill-approved',
      style: {
        background: '#dcfce7',
        color: '#166534',
        border: '1px solid #bbf7d0',
      },
    };
  }
  if (str.includes('ไม่สามารถจัดส่งได้')) {
    return {
      label: 'ไม่สามารถจัดส่งได้',
      className: 'status-pill-rejected',
      style: {
        background: '#fee2e2',
        color: '#991b1b',
        border: '1px solid #fecaca',
      },
    };
  }
  if (str.includes('จัดส่งเรียบร้อย')) {
    return {
      label: 'จัดส่งเรียบร้อย',
      className: 'status-pill-delivered',
      style: {
        background: '#e0f2fe',
        color: '#075985',
        border: '1px solid #bae6fd',
      },
    };
  }
  return {
    label: str || 'ไม่ระบุ',
    className: 'status-pill-default',
    style: {
      background: 'var(--gray-100)',
      color: 'var(--gray-600)',
      border: '1px solid var(--gray-200)',
    },
  };
}

export default function RequestTelemedPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    delivered: 0,
  });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [selectedItem, setSelectedItem] = useState(null);
  const limit = 20;

  // Workflow states in modal
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [rejecting, setRejecting] = useState(false);
  const [rejectRemark, setRejectRemark] = useState('');
  const [trackingInput, setTrackingInput] = useState('');
  const [isEditingTracking, setIsEditingTracking] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getRequestTelemed({
        page,
        limit,
        search,
        status: statusFilter,
      });
      setData(result.data || []);
      setSummary(result.summary || {});
      setPagination(result.pagination || { total: 0, totalPages: 1 });
    } catch (err) {
      console.error('Failed to fetch request-telemed data:', err.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  // Debounced search reset to page 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Sync modal sub-states when selectedItem changes
  const handleOpenModal = (item) => {
    setSelectedItem(item);
    setFeedback({ type: '', message: '' });
    setRejecting(false);
    setRejectRemark(item.remark || '');
    setTrackingInput(item.tracking_number || '');
    setIsEditingTracking(!item.tracking_number);
  };

  const handleStatusFilterChange = (status) => {
    setStatusFilter(status);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setPage(1);
  };

  // 1. รับเรื่อง
  const handleReceive = async () => {
    if (!selectedItem) return;
    setActionLoading(true);
    setFeedback({ type: '', message: '' });
    try {
      const res = await api.receiveRequestTelemed(selectedItem.id);
      setSelectedItem(res.data);
      setData((prev) => prev.map((item) => (item.id === res.data.id ? res.data : item)));
      setFeedback({ type: 'success', message: 'รับเรื่องเรียบร้อยแล้ว' });
      fetchData();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการรับเรื่อง' });
    } finally {
      setActionLoading(false);
    }
  };

  // 2. อนุมัติ / ไม่อนุมัติ
  const handleApprove = async (approveStatus) => {
    if (!selectedItem) return;
    if (approveStatus === 'N' && !rejecting) {
      setRejecting(true);
      return;
    }

    if (approveStatus === 'N' && !rejectRemark.trim()) {
      setFeedback({ type: 'error', message: 'กรุณาระบุเหตุผลที่ไม่อนุมัติ' });
      return;
    }

    setActionLoading(true);
    setFeedback({ type: '', message: '' });
    try {
      const res = await api.approveRequestTelemed(selectedItem.id, {
        approve: approveStatus,
        remark: approveStatus === 'N' ? rejectRemark.trim() : (selectedItem.remark || ''),
      });
      setSelectedItem(res.data);
      setData((prev) => prev.map((item) => (item.id === res.data.id ? res.data : item)));
      setRejecting(false);
      setFeedback({
        type: 'success',
        message: approveStatus === 'Y' ? 'อนุมัติเรียบร้อยแล้ว (สามารถจัดส่งได้)' : 'บันทึกสถานะไม่อนุมัติเรียบร้อยแล้ว',
      });
      fetchData();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการบันทึกผลการพิจารณา' });
    } finally {
      setActionLoading(false);
    }
  };

  // 3. บันทึกเลขพัสดุ
  const handleSaveTracking = async () => {
    if (!selectedItem) return;
    if (!trackingInput.trim()) {
      setFeedback({ type: 'error', message: 'กรุณาระบุเลขพัสดุ (Tracking Number)' });
      return;
    }

    setActionLoading(true);
    setFeedback({ type: '', message: '' });
    try {
      const res = await api.updateDeliveryRequestTelemed(selectedItem.id, {
        tracking_number: trackingInput.trim(),
      });
      setSelectedItem(res.data);
      setData((prev) => prev.map((item) => (item.id === res.data.id ? res.data : item)));
      setIsEditingTracking(false);
      setFeedback({ type: 'success', message: 'บันทึกเลขพัสดุและจัดส่งเรียบร้อยแล้ว' });
      fetchData();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการบันทึกเลขพัสดุ' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h2 className="page-title">รายชื่อผู้ยื่นความจำนงรับยาไม่พบแพทย์ทั้งหมด</h2>
            <p className="page-subtitle">
              รายการคำขอบริการ Telemedicine และจัดส่งยา/เวชภัณฑ์ทางไปรษณีย์ (ตาราง virtualhos.req_telemed)
            </p>
          </div>
          <div className="page-actions">
            <button
              className="btn btn-secondary"
              onClick={fetchData}
              disabled={loading}
              title="รีเฟรชข้อมูล"
            >
              รีเฟรช
            </button>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Stat Cards */}
        <div className="stats-row">
          <div
            className={`stat-card ${statusFilter === '' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatusFilterChange('')}
            style={{ cursor: 'pointer' }}
          >
            <div className="stat-label">คำขอทั้งหมด</div>
            <div className="stat-value primary">{summary.total || 0}</div>
          </div>

          <div
            className={`stat-card ${statusFilter === 'รอตรวจสอบ' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatusFilterChange(statusFilter === 'รอตรวจสอบ' ? '' : 'รอตรวจสอบ')}
            style={{ cursor: 'pointer' }}
          >
            <div className="stat-label">รอตรวจสอบ</div>
            <div className="stat-value accent" style={{ color: '#d97706' }}>
              {summary.pending || 0}
            </div>
          </div>

          <div
            className={`stat-card ${statusFilter === 'สามารถจัดส่งได้' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatusFilterChange(statusFilter === 'สามารถจัดส่งได้' ? '' : 'สามารถจัดส่งได้')}
            style={{ cursor: 'pointer' }}
          >
            <div className="stat-label">สามารถจัดส่งได้</div>
            <div className="stat-value success">{summary.approved || 0}</div>
          </div>

          <div
            className={`stat-card ${statusFilter === 'ไม่สามารถจัดส่งได้' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatusFilterChange(statusFilter === 'ไม่สามารถจัดส่งได้' ? '' : 'ไม่สามารถจัดส่งได้')}
            style={{ cursor: 'pointer' }}
          >
            <div className="stat-label">ไม่สามารถจัดส่งได้</div>
            <div className="stat-value warning" style={{ color: '#dc2626' }}>
              {summary.rejected || 0}
            </div>
          </div>

          <div
            className={`stat-card ${statusFilter === 'จัดส่งเรียบร้อย' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatusFilterChange(statusFilter === 'จัดส่งเรียบร้อย' ? '' : 'จัดส่งเรียบร้อย')}
            style={{ cursor: 'pointer' }}
          >
            <div className="stat-label">จัดส่งเรียบร้อย</div>
            <div className="stat-value info" style={{ color: '#0288d1' }}>
              {summary.delivered || 0}
            </div>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="table-card" style={{ marginBottom: '16px' }}>
          <div className="table-toolbar" style={{ flexWrap: 'wrap', gap: '12px' }}>
            <div className="search-box" style={{ flex: '1 1 320px' }}>
              <input
                className="search-input"
                type="text"
                placeholder="ค้นหา HN, ชื่อผู้ป่วย, เบอร์โทร, คลินิก, ผู้รับเรื่อง, ผู้อนุมัติ, เลขพัสดุ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                id="search-req-telemed"
                style={{ paddingLeft: '14px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <select
                className="form-control"
                value={statusFilter}
                onChange={(e) => handleStatusFilterChange(e.target.value)}
                style={{
                  height: '42px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--gray-300)',
                  padding: '0 12px',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  backgroundColor: '#ffffff',
                }}
              >
                <option value="">ทุกสถานะ (ทั้งหมด)</option>
                <option value="รอตรวจสอบ">รอตรวจสอบ</option>
                <option value="สามารถจัดส่งได้">สามารถจัดส่งได้</option>
                <option value="ไม่สามารถจัดส่งได้">ไม่สามารถจัดส่งได้</option>
                <option value="จัดส่งเรียบร้อย">จัดส่งเรียบร้อย</option>
              </select>

              {(search || statusFilter) && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleClearFilters}
                  style={{ height: '42px', padding: '0 14px' }}
                >
                  ล้างตัวกรอง
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="table-card">
          <div className="table-container" style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '50px', textAlign: 'center' }}>#</th>
                  <th style={{ minWidth: '130px' }}>วันที่ยื่น</th>
                  <th style={{ minWidth: '100px' }}>HN</th>
                  <th style={{ minWidth: '160px' }}>ชื่อ-สกุล</th>
                  <th style={{ minWidth: '120px' }}>เบอร์โทร</th>
                  <th style={{ minWidth: '110px' }}>วันนัดหมาย</th>
                  <th style={{ minWidth: '180px' }}>คลินิก / แพทย์</th>
                  <th style={{ minWidth: '180px' }}>เหตุผล / อาการ</th>
                  <th style={{ minWidth: '160px', textAlign: 'center' }}>สถานะ / ผู้รับเรื่อง</th>
                  <th style={{ minWidth: '130px' }}>เลขพัสดุ</th>
                  <th style={{ minWidth: '90px', textAlign: 'center' }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="11" style={{ textAlign: 'center', padding: '40px' }}>
                      <div className="spinner" style={{ margin: '0 auto 12px' }}></div>
                      <div style={{ color: 'var(--gray-500)' }}>กำลังโหลดข้อมูล...</div>
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan="11" style={{ textAlign: 'center', padding: '48px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--gray-700)', fontSize: '1.05rem' }}>
                        ไม่พบรายการผู้ยื่นความจำนง
                      </div>
                      <div style={{ color: 'var(--gray-500)', fontSize: '0.875rem', marginTop: '4px' }}>
                        {search || statusFilter ? 'ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ' : 'ยังไม่มีข้อมูลในระบบ'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.map((item, index) => {
                    const badge = getStatusBadgeConfig(item.status);
                    const rowNumber = (page - 1) * limit + index + 1;

                    return (
                      <tr key={item.id} className="hover-row">
                        <td style={{ textAlign: 'center', color: 'var(--gray-500)', fontSize: '0.85rem' }}>
                          {rowNumber}
                        </td>
                        <td>
                          <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                            {formatThaiDateTime(item.created_at)}
                          </div>
                        </td>
                        <td>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              background: '#e0e7ff',
                              color: '#3730a3',
                              borderRadius: 'var(--radius-full)',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.hn}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--gray-800)', fontSize: '0.875rem' }}>
                            {item.patient_name || '-'}
                          </div>
                        </td>
                        <td>
                          {item.phone ? (
                            <span style={{ fontSize: '0.85rem', color: 'var(--gray-700)', whiteSpace: 'nowrap' }}>
                              {item.phone}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--gray-400)' }}>-</span>
                          )}
                        </td>
                        <td>
                          <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--gray-700)' }}>
                            {formatThaiDate(item.nextdate)}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--primary-700)' }}>
                            {item.clinic_name || '-'}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '2px' }}>
                            {item.doctor_name || '-'}
                          </div>
                        </td>
                        <td>
                          {item.reason && (
                            <div style={{ fontSize: '0.85rem', color: 'var(--gray-800)' }}>
                              <span style={{ fontWeight: 500 }}>เหตุผล:</span> {item.reason}
                            </div>
                          )}
                          {item.symptoms && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)', marginTop: '2px' }}>
                              <span style={{ fontWeight: 500 }}>อาการ:</span> {item.symptoms}
                            </div>
                          )}
                          {!item.reason && !item.symptoms && (
                            <span style={{ color: 'var(--gray-400)' }}>-</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '4px 10px',
                              borderRadius: 'var(--radius-full)',
                              fontSize: '0.8125rem',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              ...badge.style,
                            }}
                          >
                            {badge.label}
                          </span>
                          <div style={{ fontSize: '0.75rem', color: item.received_by ? 'var(--primary-700)' : '#9ca3af', marginTop: '4px' }}>
                            {item.received_by ? (
                              <span>รับ: {item.received_by}</span>
                            ) : (
                              <span>ยังไม่ได้รับเรื่อง</span>
                            )}
                          </div>
                        </td>
                        <td>
                          {item.tracking_number ? (
                            <span
                              style={{
                                display: 'inline-block',
                                fontFamily: 'monospace',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                background: '#f1f5f9',
                                color: '#0f172a',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                border: '1px solid #cbd5e1',
                              }}
                            >
                              {item.tracking_number}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--gray-400)', fontSize: '0.85rem' }}>-</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{
                              padding: '4px 10px',
                              fontSize: '0.8125rem',
                              borderRadius: 'var(--radius-sm)',
                              whiteSpace: 'nowrap',
                            }}
                            onClick={() => handleOpenModal(item)}
                          >
                            จัดการ
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="table-footer" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ color: 'var(--gray-600)', fontSize: '0.875rem' }}>
                แสดงลำดับที่ {(page - 1) * limit + 1} ถึง {Math.min(page * limit, pagination.total)} จากทั้งหมด {pagination.total} รายการ
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  style={{ padding: '6px 14px' }}
                >
                  ก่อนหน้า
                </button>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, padding: '0 8px' }}>
                  หน้า {page} / {pagination.totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((prev) => Math.min(prev + 1, pagination.totalPages))}
                  style={{ padding: '6px 14px' }}
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal จัดการคำขอ (Workflow Modal) */}
      {selectedItem && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="modal-content"
            style={{
              background: '#ffffff',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '720px',
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--gray-200)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--gray-900)' }}>
                  จัดการคำขอยื่นความจำนง Telemed
                </h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>
                  รหัสคำขอ #{selectedItem.id} (oapp_id: {selectedItem.oapp_id}) • วันที่ยื่น: {formatThaiDateTime(selectedItem.created_at)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: 'var(--gray-500)',
                  padding: '4px 8px',
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Feedback Alert */}
            {feedback.message && (
              <div
                style={{
                  margin: '16px 24px 0',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.9rem',
                  background: feedback.type === 'success' ? '#dcfce7' : '#fee2e2',
                  color: feedback.type === 'success' ? '#166534' : '#991b1b',
                  border: `1px solid ${feedback.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                }}
              >
                {feedback.message}
              </div>
            )}

            {/* Modal Body */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Status Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 18px',
                  background: '#f8fafc',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--gray-200)',
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--gray-700)' }}>สถานะปัจจุบัน</span>
                {(() => {
                  const badge = getStatusBadgeConfig(selectedItem.status);
                  return (
                    <span
                      style={{
                        padding: '5px 14px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        ...badge.style,
                      }}
                    >
                      {badge.label}
                    </span>
                  );
                })()}
              </div>

              {/* 1. Patient Info */}
              <div>
                <h4 style={{ margin: '0 0 10px', fontSize: '1rem', color: 'var(--primary-700)', borderBottom: '2px solid var(--primary-100)', paddingBottom: '6px' }}>
                  ข้อมูลผู้ป่วยและการนัดหมาย
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', fontSize: '0.9rem' }}>
                  <div>
                    <span style={{ color: 'var(--gray-500)' }}>ชื่อผู้ป่วย:</span>{' '}
                    <strong>{selectedItem.patient_name || '-'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--gray-500)' }}>HN:</span>{' '}
                    <strong style={{ color: '#3730a3' }}>{selectedItem.hn}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--gray-500)' }}>เบอร์โทรศัพท์:</span>{' '}
                    <strong>{selectedItem.phone || '-'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--gray-500)' }}>วันนัดหมาย:</span>{' '}
                    <strong>{formatThaiDate(selectedItem.nextdate)}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--gray-500)' }}>คลินิก:</span>{' '}
                    <strong>{selectedItem.clinic_name || '-'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--gray-500)' }}>แพทย์:</span>{' '}
                    <strong>{selectedItem.doctor_name || '-'}</strong>
                  </div>
                </div>
              </div>

              {/* 2. Address */}
              <div>
                <h4 style={{ margin: '0 0 10px', fontSize: '1rem', color: 'var(--primary-700)', borderBottom: '2px solid var(--primary-100)', paddingBottom: '6px' }}>
                  ที่อยู่สำหรับจัดส่งยา / เวชภัณฑ์
                </h4>
                <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 'var(--radius-md)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                  <div>{selectedItem.address || 'ไม่ระบุที่อยู่'}</div>
                  {selectedItem.postcode && (
                    <div style={{ marginTop: '4px', fontWeight: 600, color: 'var(--gray-700)' }}>
                      รหัสไปรษณีย์: {selectedItem.postcode}
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Reason & Symptoms */}
              <div>
                <h4 style={{ margin: '0 0 10px', fontSize: '1rem', color: 'var(--primary-700)', borderBottom: '2px solid var(--primary-100)', paddingBottom: '6px' }}>
                  เหตุผลความจำนงและอาการ
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px', fontSize: '0.9rem' }}>
                  <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontWeight: 600, color: 'var(--gray-700)', marginBottom: '4px' }}>
                      เหตุผลที่ยื่นความจำนง:
                    </div>
                    <div style={{ color: 'var(--gray-800)' }}>{selectedItem.reason || '-'}</div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontWeight: 600, color: 'var(--gray-700)', marginBottom: '4px' }}>
                      อาการของผู้ป่วย:
                    </div>
                    <div style={{ color: 'var(--gray-800)' }}>{selectedItem.symptoms || '-'}</div>
                  </div>
                </div>
              </div>

              {/* 4. WORKFLOW ACTION PANEL (อยู่ล่างสุด) */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: 'var(--radius-md)',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  marginTop: '10px',
                }}
              >
                <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                  <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--gray-800)' }}>
                    การดำเนินงานและอัปเดตสถานะ
                  </h4>
                </div>

                {/* ขั้นตอนที่ 1: การรับเรื่อง */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-md)', padding: '14px 16px' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '8px', color: 'var(--gray-800)' }}>
                    ขั้นตอนที่ 1: การรับเรื่อง
                  </div>
                  {selectedItem.received_by ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ fontSize: '0.9rem', color: '#166534', background: '#f0fdf4', padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid #bbf7d0' }}>
                        <strong>รับเรื่องโดย:</strong> {selectedItem.received_by} ({formatThaiDateTime(selectedItem.received_at)})
                      </div>
                      <span style={{ fontSize: '0.8rem', color: '#15803d', fontWeight: 600 }}>รับเรื่องแล้ว</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                      <span style={{ fontSize: '0.875rem', color: '#d97706' }}>
                        ยังไม่มีผู้รับเรื่องนี้ กรุณากดปุ่มเพื่อรับเรื่องเข้าดำเนินการ
                      </span>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleReceive}
                        disabled={actionLoading}
                        style={{ padding: '8px 18px', fontSize: '0.875rem', fontWeight: 600 }}
                      >
                        กดรับเรื่อง
                      </button>
                    </div>
                  )}
                </div>

                {/* ขั้นตอนที่ 2: ตรวจสอบและ Approve / Not Approve (แสดงต่อเมื่อกดรับเรื่องแล้วเท่านั้น) */}
                {selectedItem.received_by && (
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-md)', padding: '14px 16px' }}>
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--gray-800)' }}>
                        ขั้นตอนที่ 2: ตรวจสอบความพร้อมการรับยา (Approve)
                      </div>
                    </div>

                    {(!selectedItem.approve || selectedItem.approve === 'PENDING') ? (
                      <div>
                        {!rejecting ? (
                          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn btn-success"
                              onClick={() => handleApprove('Y')}
                              disabled={actionLoading}
                              style={{
                                padding: '8px 16px',
                                fontSize: '0.875rem',
                                background: '#16a34a',
                                borderColor: '#16a34a',
                                color: '#ffffff',
                                borderRadius: 'var(--radius-sm)',
                              }}
                            >
                              อนุมัติ (สามารถจัดส่งได้)
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger"
                              onClick={() => setRejecting(true)}
                              disabled={actionLoading}
                              style={{
                                padding: '8px 16px',
                                fontSize: '0.875rem',
                                background: '#dc2626',
                                borderColor: '#dc2626',
                                color: '#ffffff',
                                borderRadius: 'var(--radius-sm)',
                              }}
                            >
                              ไม่อนุมัติ (ไม่สามารถจัดส่งได้)
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#dc2626' }}>
                              ระบุเหตุผลที่ไม่อนุมัติ / หมายเหตุแจ้งผู้ป่วย:
                            </label>
                            <textarea
                              className="form-control"
                              rows={3}
                              placeholder="เช่น ผู้ป่วยมียาเดิมเหลือ, แพทย์ต้องการตรวจซ้ำที่โรงพยาบาล, มีนัดเจาะเลือด..."
                              value={rejectRemark}
                              onChange={(e) => setRejectRemark(e.target.value)}
                              style={{
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--gray-300)',
                                padding: '8px 12px',
                                fontSize: '0.875rem',
                              }}
                            />
                            <div style={{ display: 'flex', gap: '10px' }}>
                              <button
                                type="button"
                                className="btn btn-danger"
                                onClick={() => handleApprove('N')}
                                disabled={actionLoading}
                                style={{
                                  padding: '6px 16px',
                                  fontSize: '0.875rem',
                                  background: '#dc2626',
                                  borderColor: '#dc2626',
                                  color: '#ffffff',
                                }}
                              >
                                ยืนยันไม่อนุมัติ
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setRejecting(false)}
                                disabled={actionLoading}
                                style={{ padding: '6px 14px', fontSize: '0.875rem' }}
                              >
                                ยกเลิก
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        {selectedItem.approve === 'Y' ? (
                          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 14px', borderRadius: 'var(--radius-sm)', color: '#166534', fontSize: '0.9rem' }}>
                            <div><strong>อนุมัติแล้ว (สามารถจัดส่งได้)</strong></div>
                            <div style={{ fontSize: '0.8rem', color: '#15803d', marginTop: '4px' }}>
                              ผู้อนุมัติ: {selectedItem.approve_by || '-'} ({formatThaiDateTime(selectedItem.approve_at)})
                            </div>
                          </div>
                        ) : (
                          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: 'var(--radius-sm)', color: '#991b1b', fontSize: '0.9rem' }}>
                            <div><strong>ไม่อนุมัติ (ไม่สามารถจัดส่งได้)</strong></div>
                            <div style={{ fontSize: '0.85rem', color: '#7f1d1d', marginTop: '4px' }}>
                              <strong>เหตุผล:</strong> {selectedItem.remark || 'ไม่ระบุเหตุผล'}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#b91c1c', marginTop: '2px' }}>
                              ผู้พิจารณา: {selectedItem.approve_by || '-'} ({formatThaiDateTime(selectedItem.approve_at)})
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ขั้นตอนที่ 3: รอส่งยา & ใส่ Tracking Number (แสดงเมื่อ approve = Y เท่านั้น) */}
                {selectedItem.approve === 'Y' && (
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-md)', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--gray-800)' }}>
                        ขั้นตอนที่ 3: จัดส่งยาและบันทึก Tracking Number
                      </div>
                      {selectedItem.tracking_number && !isEditingTracking && (
                        <button
                          type="button"
                          onClick={() => setIsEditingTracking(true)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--primary-600)',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          แก้ไขเลขพัสดุ
                        </button>
                      )}
                    </div>

                    {isEditingTracking ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="ระบุเลขพัสดุไปรษณีย์ เช่น ED123456789TH"
                            value={trackingInput}
                            onChange={(e) => setTrackingInput(e.target.value)}
                            style={{
                              flex: '1 1 240px',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--gray-300)',
                              padding: '8px 12px',
                              fontSize: '0.9rem',
                              fontFamily: 'monospace',
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleSaveTracking}
                            disabled={actionLoading}
                            style={{ padding: '8px 18px', fontSize: '0.875rem' }}
                          >
                            บันทึกจัดส่งเรียบร้อย
                          </button>
                          {selectedItem.tracking_number && (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => {
                                setIsEditingTracking(false);
                                setTrackingInput(selectedItem.tracking_number);
                              }}
                              style={{ padding: '8px 14px', fontSize: '0.875rem' }}
                            >
                              ยกเลิก
                            </button>
                          )}
                        </div>
                        <span style={{ fontSize: '0.78rem', color: 'var(--gray-500)' }}>
                          เมื่อบันทึกแล้ว สถานะจะเปลี่ยนเป็น "จัดส่งเรียบร้อย" และคนไข้จะเห็นเลขพัสดุใน LINE OA ทันที
                        </span>
                      </div>
                    ) : (
                      <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '10px 14px', borderRadius: 'var(--radius-sm)', color: '#0369a1', fontSize: '0.9rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span><strong>เลขพัสดุ (Tracking Number):</strong></span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', background: '#ffffff', padding: '2px 8px', borderRadius: '4px', border: '1px solid #7dd3fc' }}>
                            {selectedItem.tracking_number}
                          </span>
                        </div>
                        {selectedItem.delivery_at && (
                          <div style={{ fontSize: '0.8rem', color: '#0284c7', marginTop: '4px' }}>
                            บันทึกจัดส่งเมื่อ: {formatThaiDateTime(selectedItem.delivery_at)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--gray-200)',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedItem(null)}
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

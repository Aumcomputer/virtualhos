import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../api/client';

function formatThaiDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = [
      '', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
    ];
    return `${d.getDate()} ${months[d.getMonth() + 1]} ${d.getFullYear() + 543}`;
  } catch {
    return dateStr;
  }
}

function formatThaiDateTime(dateTimeStr) {
  if (!dateTimeStr) return '—';
  try {
    const d = new Date(dateTimeStr);
    if (isNaN(d.getTime())) return dateTimeStr;
    const months = [
      '', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
    ];
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${d.getDate()} ${months[d.getMonth() + 1]} ${d.getFullYear() + 543} ${hours}:${mins} น.`;
  } catch {
    return dateTimeStr;
  }
}

function getStatusBadgeConfig(status) {
  const str = String(status || '').trim();
  if (str.includes('รอตรวจสอบ')) {
    return {
      label: 'รอตรวจสอบ',
      style: { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' },
    };
  }
  if (str.includes('รอปรึกษาแพทย์')) {
    return {
      label: 'รอปรึกษาแพทย์',
      style: { background: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe' },
    };
  }
  if (str.includes('รอเภสัช')) {
    return {
      label: 'รอเภสัชกร',
      style: { background: '#f3e8ff', color: '#6b21a8', border: '1px solid #e9d5ff' },
    };
  }
  if (str.includes('สามารถจัดส่งได้') && !str.includes('ไม่สามารถ')) {
    return {
      label: 'อนุมัติแล้ว (พร้อมส่ง)',
      style: { background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' },
    };
  }
  if (str.includes('ไม่สามารถจัดส่งได้') || str.includes('ไม่อนุมัติ')) {
    return {
      label: str.includes('แพทย์') ? 'แพทย์ไม่อนุมัติ' : str.includes('ยา') ? 'ยาส่งไม่ได้' : 'ไม่อนุมัติ',
      style: { background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' },
    };
  }
  if (str.includes('จัดส่งเรียบร้อย')) {
    return {
      label: 'จัดส่งเรียบร้อย',
      style: { background: '#e0f2fe', color: '#075985', border: '1px solid #bae6fd' },
    };
  }
  return {
    label: str || 'ไม่ระบุ',
    style: { background: 'var(--gray-100)', color: 'var(--gray-600)', border: '1px solid var(--gray-200)' },
  };
}

const STAGE_META = {
  receive: {
    title: 'คิวรอรับเรื่อง',
    subtitle: 'คำขอรับยาไม่พบแพทย์ที่ยื่นเข้ามาใหม่ รอเจ้าหน้าที่ประจำคลินิกตรวจสอบและกดรับเรื่อง',
    emptyText: 'ไม่มีรายการที่รอรับเรื่องในขณะนี้',
  },
  doctor: {
    title: 'คิวรอปรึกษาแพทย์',
    subtitle: 'รายการที่รับเรื่องแล้ว อยู่ระหว่างประสานแพทย์ผู้นัดเพื่อพิจารณาความเหมาะสมในการรับยาไม่พบแพทย์',
    emptyText: 'ไม่มีรายการที่รอปรึกษาแพทย์ในขณะนี้',
  },
  pharmacist: {
    title: 'คิวเภสัชกร',
    subtitle: 'รายการที่แพทย์อนุมัติแล้ว อยู่ระหว่างเภสัชกรตรวจสอบความพร้อมของยาและความปลอดภัยในการจัดส่ง',
    emptyText: 'ไม่มีรายการที่รอเภสัชกรตรวจสอบในขณะนี้',
  },
  approved: {
    title: 'รายการที่อนุมัติ (พร้อมจัดส่งยา)',
    subtitle: 'รายการที่ผ่านการอนุมัติครบถ้วนจากแพทย์และเภสัชกร รอจัดยาและบันทึกเลขพัสดุเพื่อจัดส่ง',
    emptyText: 'ไม่มีรายการที่รอจัดส่งในขณะนี้',
  },
  today: {
    title: '“รับยาไม่พบแพทย์” วันนี้',
    subtitle: 'คำขอรับยาไม่พบแพทย์ที่มีวันนัดหมายตรงกับวันนี้',
    emptyText: 'ไม่มีรายการคำขอรับยาไม่พบแพทย์ที่มีนัดหมายในวันนี้',
  },
  all: {
    title: 'ผู้ยื่นความจำนงทั้งหมด',
    subtitle: 'ประวัติและสถานะคำขอรับยาไม่พบแพทย์ทั้งหมดในระบบ สามารถค้นหา กรอง และตรวจสอบขั้นตอนได้',
    emptyText: 'ไม่พบรายการคำขอตามเงื่อนไขที่ระบุ',
  },
};

export default function RequestTelemedPage({ stage = 'all' }) {
  const meta = STAGE_META[stage] || STAGE_META.all;

  // Data states
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    total: 0,
    receive: 0,
    doctor: 0,
    pharmacist: 0,
    approved: 0,
    today: 0,
    rejected: 0,
    delivered: 0,
  });

  // Filters & sorting states
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const limit = 20;

  // Notifications
  const [toast, setToast] = useState({ type: '', message: '' });

  // Clinical Visit Modal states
  const [visitModalItem, setVisitModalItem] = useState(null);
  const [visitDetail, setVisitDetail] = useState(null);
  const [visitLoading, setVisitLoading] = useState(false);
  const [visitError, setVisitError] = useState('');

  // Reject Modal states
  const [rejectModalItem, setRejectModalItem] = useState(null);
  const [rejectTargetRole, setRejectTargetRole] = useState('doctor'); // 'doctor' | 'pharmacist'
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [rejectError, setRejectError] = useState('');

  // Delivery Modal states
  const [deliveryModalItem, setDeliveryModalItem] = useState(null);
  const [deliveryTracking, setDeliveryTracking] = useState('');
  const [deliverySubmitting, setDeliverySubmitting] = useState(false);
  const [deliveryError, setDeliveryError] = useState('');

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getRequestTelemed({
        page,
        limit,
        search,
        status: stage === 'all' ? statusFilter : '',
        stage,
        sortBy,
        sortOrder,
      });
      setData(res.data || []);
      setSummary(res.summary || {});
      setPagination(res.pagination || { total: 0, totalPages: 1 });
    } catch (err) {
      console.error('Fetch req_telemed error:', err);
      setToast({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, stage, sortBy, sortOrder]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset page when search or stage changes
  useEffect(() => {
    setPage(1);
  }, [search, stage, statusFilter]);

  // Clear toast after 4s
  useEffect(() => {
    if (toast.message) {
      const timer = setTimeout(() => setToast({ type: '', message: '' }), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Handle Sort Click
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder(column.includes('date') || column === 'id' ? 'desc' : 'asc');
    }
  };

  // Helper to remove item immediately from current view when moved
  const removeRowFromView = (id) => {
    if (stage !== 'all' && stage !== 'today') {
      setData((prev) => prev.filter((r) => r.id !== id));
    }
  };

  // 1. รับเรื่อง (Receive)
  const handleReceive = async (item) => {
    try {
      await api.receiveRequestTelemed(item.id);
      removeRowFromView(item.id);
      setToast({ type: 'success', message: `รับเรื่องสำหรับ HN ${item.hn} เรียบร้อยแล้ว (ย้ายไปคิวรอปรึกษาแพทย์)` });
      fetchData();
      if (visitModalItem?.id === item.id) setVisitModalItem(null);
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการรับเรื่อง' });
    }
  };

  // 2. แพทย์อนุมัติ (Doctor Approve)
  const handleDoctorApprove = async (item) => {
    try {
      await api.doctorActionRequestTelemed(item.id, { approve: 'APPROVED' });
      removeRowFromView(item.id);
      setToast({ type: 'success', message: `บันทึกแพทย์อนุมัติสำหรับ HN ${item.hn} เรียบร้อยแล้ว (ย้ายไปคิวเภสัชกร)` });
      fetchData();
      if (visitModalItem?.id === item.id) setVisitModalItem(null);
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการบันทึกแพทย์อนุมัติ' });
    }
  };

  // 3. เภสัชกรอนุมัติ ยาส่งได้ (Pharmacy Approve)
  const handlePharmacyApprove = async (item) => {
    try {
      await api.pharmacyActionRequestTelemed(item.id, { approve: 'APPROVED' });
      removeRowFromView(item.id);
      setToast({ type: 'success', message: `เภสัชกรอนุมัติสำหรับ HN ${item.hn} เรียบร้อยแล้ว (ย้ายไปรายการที่อนุมัติ)` });
      fetchData();
      if (visitModalItem?.id === item.id) setVisitModalItem(null);
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการบันทึกเภสัชกรอนุมัติ' });
    }
  };

  // Open Reject Modal
  const openRejectModal = (item, role) => {
    setRejectModalItem(item);
    setRejectTargetRole(role);
    setRejectReason('');
    setRejectError('');
  };

  // Confirm Reject
  const handleConfirmReject = async (e) => {
    e.preventDefault();
    if (!rejectModalItem) return;
    const cleanReason = rejectReason.trim();
    if (!cleanReason) {
      setRejectError('กรุณากรอกเหตุผลความจำเป็นที่ไม่อนุมัติ (บังคับกรอก)');
      return;
    }

    setRejectSubmitting(true);
    setRejectError('');
    try {
      if (rejectTargetRole === 'doctor') {
        await api.doctorActionRequestTelemed(rejectModalItem.id, {
          approve: 'REJECTED',
          remark: cleanReason,
        });
        setToast({ type: 'success', message: `บันทึกแพทย์ไม่อนุมัติสำหรับ HN ${rejectModalItem.hn} เรียบร้อยแล้ว (ย้ายไปผู้ยื่นความจำนงทั้งหมด)` });
      } else {
        await api.pharmacyActionRequestTelemed(rejectModalItem.id, {
          approve: 'REJECTED',
          remark: cleanReason,
        });
        setToast({ type: 'success', message: `บันทึกเภสัชกรไม่อนุมัติ (ยาส่งไม่ได้) สำหรับ HN ${rejectModalItem.hn} เรียบร้อยแล้ว` });
      }

      removeRowFromView(rejectModalItem.id);
      setRejectModalItem(null);
      fetchData();
      if (visitModalItem?.id === rejectModalItem.id) setVisitModalItem(null);
    } catch (err) {
      setRejectError(err.message || 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setRejectSubmitting(false);
    }
  };

  // Open Delivery Modal
  const openDeliveryModal = (item) => {
    setDeliveryModalItem(item);
    setDeliveryTracking(item.tracking_number || '');
    setDeliveryError('');
  };

  // Confirm Delivery
  const handleConfirmDelivery = async (e) => {
    e.preventDefault();
    if (!deliveryModalItem) return;
    const cleanTracking = deliveryTracking.trim();
    if (!cleanTracking) {
      setDeliveryError('กรุณากรอกหมายเลขพัสดุ (Tracking Number)');
      return;
    }

    setDeliverySubmitting(true);
    setDeliveryError('');
    try {
      await api.updateDeliveryRequestTelemed(deliveryModalItem.id, {
        tracking_number: cleanTracking,
      });
      removeRowFromView(deliveryModalItem.id);
      setToast({ type: 'success', message: `บันทึกจัดส่งยาเรียบร้อยแล้ว (เลขพัสดุ: ${cleanTracking})` });
      setDeliveryModalItem(null);
      fetchData();
      if (visitModalItem?.id === deliveryModalItem.id) setVisitModalItem(null);
    } catch (err) {
      setDeliveryError(err.message || 'เกิดข้อผิดพลาดในการบันทึกเลขพัสดุ');
    } finally {
      setDeliverySubmitting(false);
    }
  };

  // Open Clinical Visit Detail Modal
  const openVisitModal = async (item) => {
    setVisitModalItem(item);
    setVisitDetail(null);
    setVisitLoading(true);
    setVisitError('');

    try {
      const res = await api.getVisitDetail(item.id);
      setVisitDetail(res);
    } catch (err) {
      console.error('Error fetching visit detail:', err);
      setVisitError(err.message || 'ไม่สามารถดึงข้อมูลประวัติการตรวจได้');
    } finally {
      setVisitLoading(false);
    }
  };

  // Render sorting indicator
  const renderSortArrow = (column) => {
    if (sortBy !== column) {
      return (
        <span className="sort-indicator inactive" aria-hidden="true">
          ↕
        </span>
      );
    }
    return (
      <span className="sort-indicator active" aria-hidden="true">
        {sortOrder === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  // Helper to parse line-separated clinical strings
  const parseLines = (text) => {
    if (!text) return [];
    return String(text)
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  };

  return (
    <>
      {/* Toast Notification */}
      {toast.message && (
        <div className={`toast-notification toast-${toast.type}`}>
          <div className="toast-content">
            <span>{toast.message}</span>
            <button type="button" className="toast-close" onClick={() => setToast({ type: '', message: '' })}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h2 className="page-title">{meta.title}</h2>
            <p className="page-subtitle">{meta.subtitle}</p>
          </div>
          <div className="page-actions">
            <NavLink to="/request-telemed/register" className="btn btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
              ลงทะเบียนใหม่
            </NavLink>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Stage Summary Navigation Chips */}
        <div className="stage-summary-bar">
          <NavLink
            to="/request-telemed/pending-receive"
            className={({ isActive }) => `stage-summary-chip ${isActive ? 'active' : ''}`}
          >
            <span>รอรับเรื่อง</span>
            <span className="stage-chip-count">{summary.receive || 0}</span>
          </NavLink>
          <NavLink
            to="/request-telemed/pending-doctor"
            className={({ isActive }) => `stage-summary-chip ${isActive ? 'active' : ''}`}
          >
            <span>รอปรึกษาแพทย์</span>
            <span className="stage-chip-count">{summary.doctor || 0}</span>
          </NavLink>
          <NavLink
            to="/request-telemed/pharmacist"
            className={({ isActive }) => `stage-summary-chip ${isActive ? 'active' : ''}`}
          >
            <span>เภสัชกร</span>
            <span className="stage-chip-count">{summary.pharmacist || 0}</span>
          </NavLink>
          <NavLink
            to="/request-telemed/approved"
            className={({ isActive }) => `stage-summary-chip ${isActive ? 'active' : ''}`}
          >
            <span>รายการที่อนุมัติ</span>
            <span className="stage-chip-count">{summary.approved || 0}</span>
          </NavLink>
          <NavLink
            to="/request-telemed/today"
            className={({ isActive }) => `stage-summary-chip ${isActive ? 'active' : ''}`}
          >
            <span>“รับยาไม่พบแพทย์” วันนี้</span>
            <span className="stage-chip-count">{summary.today || 0}</span>
          </NavLink>
          <NavLink
            to="/request-telemed/all"
            className={({ isActive }) => `stage-summary-chip ${isActive ? 'active' : ''}`}
          >
            <span>ผู้ยื่นความจำนงทั้งหมด</span>
            <span className="stage-chip-count">{summary.total || 0}</span>
          </NavLink>
        </div>

        {/* Filter & Search Bar */}
        <div className="telemed-card filter-card">
          <div className="filter-row">
            <div className="search-box-wrapper" style={{ flex: 1 }}>
              <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="form-input search-input"
                placeholder="ค้นหา HN, ชื่อผู้ป่วย, เบอร์โทร, คลินิก, แพทย์, เลขพัสดุ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button type="button" className="search-clear-btn" onClick={() => setSearch('')}>
                  ✕
                </button>
              )}
            </div>

            {stage === 'all' && (
              <div className="status-filter-wrapper">
                <select
                  className="form-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">สถานะทั้งหมด</option>
                  <option value="รอตรวจสอบ">รอตรวจสอบ (ใหม่)</option>
                  <option value="รอปรึกษาแพทย์">รอปรึกษาแพทย์</option>
                  <option value="รอเภสัช">รอเภสัชกร</option>
                  <option value="สามารถจัดส่งได้">สามารถจัดส่งได้</option>
                  <option value="จัดส่งเรียบร้อย">จัดส่งเรียบร้อย</option>
                  <option value="ไม่อนุมัติ">ไม่อนุมัติ / ยาส่งไม่ได้</option>
                </select>
              </div>
            )}

            <button type="button" className="btn btn-secondary" onClick={() => fetchData()} title="รีเฟรชข้อมูล">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              รีเฟรช
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="telemed-card table-card">
          <div className="table-responsive">
            <table className="telemed-table">
              <thead>
                <tr>
                  <th style={{ width: '45px', textAlign: 'center' }}>#</th>
                  <th className="sortable-th" onClick={() => handleSort('created_at')}>
                    <div className="th-sort-wrapper">
                      <span>วันที่ยื่น</span>
                      {renderSortArrow('created_at')}
                    </div>
                  </th>
                  <th className="sortable-th" onClick={() => handleSort('nextdate')}>
                    <div className="th-sort-wrapper">
                      <span>วันนัดหมาย</span>
                      {renderSortArrow('nextdate')}
                    </div>
                  </th>
                  <th className="sortable-th" onClick={() => handleSort('hn')}>
                    <div className="th-sort-wrapper">
                      <span>HN</span>
                      {renderSortArrow('hn')}
                    </div>
                  </th>
                  <th className="sortable-th" onClick={() => handleSort('patient_name')}>
                    <div className="th-sort-wrapper">
                      <span>ชื่อ-นามสกุล</span>
                      {renderSortArrow('patient_name')}
                    </div>
                  </th>
                  <th className="sortable-th" onClick={() => handleSort('clinic_name')}>
                    <div className="th-sort-wrapper">
                      <span>คลินิก</span>
                      {renderSortArrow('clinic_name')}
                    </div>
                  </th>
                  <th className="sortable-th" onClick={() => handleSort('doctor_name')}>
                    <div className="th-sort-wrapper">
                      <span>แพทย์ผู้นัด</span>
                      {renderSortArrow('doctor_name')}
                    </div>
                  </th>
                  <th>อาการ / เหตุผล</th>
                  <th>เบอร์โทร</th>

                  {/* Stage-specific context column */}
                  {stage === 'receive' && <th>ผู้ลงทะเบียน</th>}
                  {stage === 'doctor' && <th>ผู้รับเรื่อง</th>}
                  {stage === 'pharmacist' && <th>แพทย์ผู้อนุมัติ</th>}
                  {stage === 'approved' && <th>เภสัชกรผู้อนุมัติ</th>}
                  {(stage === 'today' || stage === 'all') && (
                    <th className="sortable-th" onClick={() => handleSort('status')}>
                      <div className="th-sort-wrapper">
                        <span>สถานะ</span>
                        {renderSortArrow('status')}
                      </div>
                    </th>
                  )}

                  <th style={{ textAlign: 'center', minWidth: '150px' }}>การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '40px' }}>
                      <div className="loading-spinner-wrapper">
                        <svg className="spin-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        <span style={{ marginLeft: '10px' }}>กำลังโหลดข้อมูล...</span>
                      </div>
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '48px 20px' }}>
                      <div className="empty-state-box">
                        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '4px' }}>
                          {meta.emptyText}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--gray-500)' }}>
                          {search ? 'ลองค้นหาด้วยคำค้นอื่น หรือล้างตัวกรอง' : 'เมื่อมีรายการคำขอใหม่จะแสดงในตารางนี้'}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.map((item, idx) => {
                    const rowNumber = (page - 1) * limit + idx + 1;
                    const badge = getStatusBadgeConfig(item.status);

                    return (
                      <tr key={item.id} className="table-row-hover">
                        <td style={{ textAlign: 'center', color: 'var(--gray-500)', fontSize: '0.8125rem' }}>
                          {rowNumber}
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                          {formatThaiDateTime(item.created_at)}
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontWeight: 600, fontSize: '0.875rem' }}>
                          {formatThaiDate(item.nextdate)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="patient-click-link font-mono"
                            onClick={() => openVisitModal(item)}
                            title="คลิกเพื่อดูประวัติการตรวจใน HOSxP"
                          >
                            {item.hn}
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="patient-click-link"
                            onClick={() => openVisitModal(item)}
                            title="คลิกเพื่อดูประวัติการตรวจใน HOSxP"
                          >
                            {item.patient_name || '—'}
                          </button>
                        </td>
                        <td style={{ fontSize: '0.8125rem', color: 'var(--gray-700)' }}>
                          {item.clinic_name || '—'}
                        </td>
                        <td style={{ fontSize: '0.8125rem', color: 'var(--gray-700)' }}>
                          {item.doctor_name || '—'}
                        </td>
                        <td style={{ maxWidth: '180px' }} title={`${item.reason || ''} / ${item.symptoms || ''}`}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                            {item.symptoms || item.reason || '—'}
                          </div>
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem', fontFamily: 'monospace' }}>
                          {item.phone || '—'}
                        </td>

                        {/* Stage context column */}
                        {stage === 'receive' && (
                          <td style={{ fontSize: '0.8125rem', color: 'var(--gray-600)' }}>
                            {item.request_by || 'คนไข้ (LINE)'}
                          </td>
                        )}
                        {stage === 'doctor' && (
                          <td style={{ fontSize: '0.8125rem', color: 'var(--gray-600)' }}>
                            <div>{item.received_by || '—'}</div>
                            <div style={{ fontSize: '0.6875rem', color: 'var(--gray-400)' }}>
                              {formatThaiDateTime(item.received_at)}
                            </div>
                          </td>
                        )}
                        {stage === 'pharmacist' && (
                          <td style={{ fontSize: '0.8125rem', color: 'var(--gray-600)' }}>
                            <div style={{ fontWeight: 500 }}>{item.doctor_approved_by || 'แพทย์อนุมัติ'}</div>
                            {item.doctor_remark && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--primary-700)' }}>
                                {item.doctor_remark}
                              </div>
                            )}
                          </td>
                        )}
                        {stage === 'approved' && (
                          <td style={{ fontSize: '0.8125rem', color: 'var(--gray-600)' }}>
                            <div>{item.pharmacy_approved_by || item.approve_by || 'เภสัชกร'}</div>
                            <div style={{ fontSize: '0.6875rem', color: 'var(--gray-400)' }}>
                              {formatThaiDateTime(item.pharmacy_approved_at || item.approve_at)}
                            </div>
                          </td>
                        )}
                        {(stage === 'today' || stage === 'all') && (
                          <td>
                            <span className="status-pill" style={badge.style}>
                              {badge.label}
                            </span>
                            {item.tracking_number && (
                              <div style={{ fontSize: '0.6875rem', fontFamily: 'monospace', color: 'var(--primary-700)', marginTop: '2px' }}>
                                พัสดุ: {item.tracking_number}
                              </div>
                            )}
                          </td>
                        )}

                        {/* Action buttons */}
                        <td style={{ textAlign: 'center' }}>
                          <div className="queue-action-group" style={{ justifyContent: 'center' }}>
                            {stage === 'receive' && (
                              <button
                                type="button"
                                className="btn-queue-action btn-queue-receive"
                                onClick={() => handleReceive(item)}
                              >
                                รับเรื่อง
                              </button>
                            )}

                            {stage === 'doctor' && (
                              <>
                                <button
                                  type="button"
                                  className="btn-queue-action btn-queue-approve"
                                  onClick={() => handleDoctorApprove(item)}
                                >
                                  แพทย์อนุมัติ
                                </button>
                                <button
                                  type="button"
                                  className="btn-queue-action btn-queue-reject"
                                  onClick={() => openRejectModal(item, 'doctor')}
                                >
                                  ไม่อนุมัติ
                                </button>
                              </>
                            )}

                            {stage === 'pharmacist' && (
                              <>
                                <button
                                  type="button"
                                  className="btn-queue-action btn-queue-approve"
                                  onClick={() => handlePharmacyApprove(item)}
                                >
                                  ยาส่งได้
                                </button>
                                <button
                                  type="button"
                                  className="btn-queue-action btn-queue-reject"
                                  onClick={() => openRejectModal(item, 'pharmacist')}
                                >
                                  ยาส่งไม่ได้
                                </button>
                              </>
                            )}

                            {stage === 'approved' && (
                              <button
                                type="button"
                                className="btn-queue-action btn-queue-deliver"
                                onClick={() => openDeliveryModal(item)}
                              >
                                จัดส่งยา
                              </button>
                            )}

                            {/* View Clinical Details */}
                            <button
                              type="button"
                              className="btn-queue-action btn-queue-view"
                              onClick={() => openVisitModal(item)}
                              title="ดูรายละเอียดการตรวจใน HOSxP"
                            >
                              ประวัติ
                            </button>
                          </div>
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
            <div className="table-pagination">
              <span className="pagination-info">
                แสดง {data.length} รายการ จากทั้งหมด {pagination.total} รายการ
              </span>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ย้อนกลับ
                </button>
                <span className="pagination-pages">
                  หน้า {page} / {pagination.totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================
          Patient Clinical Visit Detail Modal (from HOSxP oapp -> vn)
          ======================================================================== */}
      {visitModalItem && (
        <div className="visit-modal-backdrop" onClick={() => setVisitModalItem(null)}>
          <div className="visit-modal-container" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="visit-modal-header">
              <div className="visit-modal-title-row">
                <div className="visit-modal-title">
                  รายละเอียดการรับบริการครั้งที่มีการนัดหมาย
                </div>
                {visitDetail?.vn && (
                  <span className="badge badge-primary font-mono">
                    VN: {visitDetail.vn}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="visit-modal-close-btn"
                onClick={() => setVisitModalItem(null)}
                aria-label="ปิด"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="visit-modal-body">
              {/* Quick Patient Banner */}
              <div className="patient-quick-banner">
                <div className="quick-banner-item">
                  <span className="label">ผู้ป่วย / HN</span>
                  <span className="value">
                    {visitModalItem.patient_name} (HN: {visitModalItem.hn})
                  </span>
                </div>
                <div className="quick-banner-item">
                  <span className="label">อายุ</span>
                  <span className="value">
                    {visitDetail?.visit?.age_y !== undefined
                      ? `${visitDetail.visit.age_y} ปี ${visitDetail.visit.age_m || 0} เดือน`
                      : '—'}
                  </span>
                </div>
                <div className="quick-banner-item">
                  <span className="label">วันเวลานัดตรวจ</span>
                  <span className="value">
                    {formatThaiDate(visitModalItem.nextdate)} ({visitModalItem.clinic_name || 'ไม่ระบุคลินิก'})
                  </span>
                </div>
                <div className="quick-banner-item">
                  <span className="label">แพทย์ผู้นัด</span>
                  <span className="value">{visitModalItem.doctor_name || '—'}</span>
                </div>
              </div>

              {visitLoading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <svg className="spin-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  <p style={{ marginTop: '10px', color: 'var(--gray-600)' }}>
                    กำลังดึงข้อมูลเวชระเบียนจาก HOSxP...
                  </p>
                </div>
              ) : visitError ? (
                <div className="submit-error-alert">{visitError}</div>
              ) : (
                <>
                  {/* 1. Vital Signs & Chief Complaint */}
                  <div className="clinical-card">
                    <div className="clinical-card-header">
                      <span>สัญญาณชีพและการตรวจร่างกาย (ครั้งที่มาตรวจ)</span>
                      {visitDetail?.visit?.vstdate && (
                        <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--gray-500)', marginLeft: 'auto' }}>
                          วันที่ตรวจ: {formatThaiDate(visitDetail.visit.vstdate)}
                        </span>
                      )}
                    </div>
                    <div className="clinical-card-body">
                      {visitDetail?.visit ? (
                        <>
                          <div className="vitals-cards-grid">
                            <div className="vital-stat-card">
                              <span className="v-label">ความดันโลหิต (BP)</span>
                              <span className="v-value">
                                {visitDetail.visit.bps && visitDetail.visit.bpd
                                  ? `${visitDetail.visit.bps}/${visitDetail.visit.bpd}`
                                  : '—'}
                              </span>
                              <span className="v-unit">mmHg</span>
                            </div>
                            <div className="vital-stat-card">
                              <span className="v-label">ชีพจร (Pulse)</span>
                              <span className="v-value">{visitDetail.visit.pulse || visitDetail.visit.hr || '—'}</span>
                              <span className="v-unit">ครั้ง/นาที</span>
                            </div>
                            <div className="vital-stat-card">
                              <span className="v-label">อุณหภูมิ (Temp)</span>
                              <span className="v-value">{visitDetail.visit.temperature || '—'}</span>
                              <span className="v-unit">°C</span>
                            </div>
                            <div className="vital-stat-card">
                              <span className="v-label">หายใจ (RR)</span>
                              <span className="v-value">{visitDetail.visit.rr || '—'}</span>
                              <span className="v-unit">ครั้ง/นาที</span>
                            </div>
                            <div className="vital-stat-card">
                              <span className="v-label">น้ำหนัก (BW)</span>
                              <span className="v-value">{visitDetail.visit.bw || '—'}</span>
                              <span className="v-unit">กก.</span>
                            </div>
                            <div className="vital-stat-card">
                              <span className="v-label">ส่วนสูง</span>
                              <span className="v-value">{visitDetail.visit.height || '—'}</span>
                              <span className="v-unit">ซม.</span>
                            </div>
                            <div className="vital-stat-card">
                              <span className="v-label">ดัชนีมวลกาย (BMI)</span>
                              <span className="v-value">{visitDetail.visit.bmi || '—'}</span>
                              <span className="v-unit">kg/m²</span>
                            </div>
                          </div>

                          {/* CC & PE */}
                          <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {visitDetail.visit.cc && (
                              <div style={{ fontSize: '0.875rem' }}>
                                <strong>อาการสำคัญ (CC):</strong> {visitDetail.visit.cc}
                              </div>
                            )}
                            {visitDetail.visit.pe && (
                              <div style={{ fontSize: '0.875rem' }}>
                                <strong>ตรวจร่างกาย (PE):</strong> {visitDetail.visit.pe}
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <div style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>
                          {visitDetail?.message || 'ไม่พบข้อมูลสัญญาณชีพสำหรับนัดหมายนี้'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 2. Diagnoses */}
                  <div className="clinical-card">
                    <div className="clinical-card-header">การวินิจฉัยโรค (Diagnoses)</div>
                    <div className="clinical-card-body">
                      {visitDetail?.visit?.diagnosis_concat ? (
                        <div className="diag-list">
                          {parseLines(visitDetail.visit.diagnosis_concat).map((line, dIdx) => {
                            const isPdx = line.includes('(PDX)');
                            const cleanLine = line.replace('(PDX)', '').trim();
                            return (
                              <div key={dIdx} className="diag-item">
                                {isPdx && <span className="pdx-badge">PDX โรคหลัก</span>}
                                <span style={{ fontWeight: isPdx ? 600 : 400 }}>{cleanLine}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: 'var(--gray-500)' }}>ไม่พบข้อมูลการวินิจฉัย</div>
                      )}
                    </div>
                  </div>

                  {/* 3. Prescribed Medications */}
                  <div className="clinical-card">
                    <div className="clinical-card-header">รายการยาเดิมที่ได้รับ (Prescribed Drugs)</div>
                    <div className="clinical-card-body">
                      {visitDetail?.visit?.drug_concat ? (
                        <div className="meds-items-list">
                          {parseLines(visitDetail.visit.drug_concat).map((medLine, mIdx) => {
                            const parts = medLine.split('#');
                            const medInfo = parts[0] ? parts[0].trim() : medLine;
                            const qty = parts[1] ? parts[1].trim() : '';

                            return (
                              <div key={mIdx} className="med-item-row">
                                <div style={{ flex: 1 }}>
                                  <div className="med-item-name">{medInfo}</div>
                                </div>
                                {qty && <div className="med-item-qty">{qty} เม็ด/หน่วย</div>}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: 'var(--gray-500)' }}>ไม่พบรายการยาในการตรวจครั้งนี้</div>
                      )}
                    </div>
                  </div>

                  {/* 4. Non-drug items */}
                  {visitDetail?.visit?.nondrug_concat && (
                    <div className="clinical-card">
                      <div className="clinical-card-header">เวชภัณฑ์ / อื่นๆ (Non-drug Items)</div>
                      <div className="clinical-card-body">
                        <div className="diag-list">
                          {parseLines(visitDetail.visit.nondrug_concat).map((line, ndIdx) => (
                            <div key={ndIdx} className="diag-item">
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 5. X-Ray Report */}
                  {visitDetail?.visit?.xray_report && (
                    <div className="clinical-card">
                      <div className="clinical-card-header">ผลเอกซเรย์ (X-Ray Report)</div>
                      <div className="clinical-card-body">
                        <pre className="xray-text-box">{visitDetail.visit.xray_report}</pre>
                      </div>
                    </div>
                  )}

                  {/* 6. Current Telemed Request Details */}
                  <div className="clinical-card">
                    <div className="clinical-card-header">ข้อมูลคำขอรับยาไม่พบแพทย์ปัจจุบัน</div>
                    <div className="clinical-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div>
                        <strong>เหตุผลความจำเป็น:</strong> {visitModalItem.reason || '—'}
                      </div>
                      <div>
                        <strong>อาการปัจจุบัน:</strong> {visitModalItem.symptoms || '—'}
                      </div>
                      <div>
                        <strong>ที่อยู่จัดส่งยา:</strong> {visitModalItem.address || '—'} {visitModalItem.postcode || ''}
                      </div>
                      <div>
                        <strong>เบอร์โทรศัพท์:</strong> {visitModalItem.phone || '—'}
                      </div>
                      <div style={{ borderTop: '1px solid var(--gray-100)', paddingTop: '8px', marginTop: '4px', fontSize: '0.8125rem', color: 'var(--gray-600)' }}>
                        <div>ผู้ลงทะเบียน: {visitModalItem.request_by || 'คนไข้ (LINE)'}</div>
                        {visitModalItem.received_by && (
                          <div>ผู้รับเรื่อง: {visitModalItem.received_by} ({formatThaiDateTime(visitModalItem.received_at)})</div>
                        )}
                        {visitModalItem.doctor_approved_by && (
                          <div>แพทย์ผู้อนุมัติ: {visitModalItem.doctor_approved_by} {visitModalItem.doctor_remark ? `(${visitModalItem.doctor_remark})` : ''}</div>
                        )}
                        {visitModalItem.pharmacy_approved_by && (
                          <div>เภสัชกร: {visitModalItem.pharmacy_approved_by} {visitModalItem.pharmacy_remark ? `(${visitModalItem.pharmacy_remark})` : ''}</div>
                        )}
                        {visitModalItem.tracking_number && (
                          <div style={{ fontWeight: 600, color: 'var(--primary-700)' }}>
                            เลขพัสดุ: {visitModalItem.tracking_number} ({formatThaiDateTime(visitModalItem.delivery_at)})
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer with Actions */}
            <div className="visit-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setVisitModalItem(null)}
              >
                ปิดหน้าต่าง
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                {stage === 'receive' && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleReceive(visitModalItem)}
                  >
                    รับเรื่อง
                  </button>
                )}

                {stage === 'doctor' && (
                  <>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => openRejectModal(visitModalItem, 'doctor')}
                    >
                      แพทย์ไม่อนุมัติ
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleDoctorApprove(visitModalItem)}
                    >
                      แพทย์อนุมัติ
                    </button>
                  </>
                )}

                {stage === 'pharmacist' && (
                  <>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => openRejectModal(visitModalItem, 'pharmacist')}
                    >
                      ยาส่งไม่ได้
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handlePharmacyApprove(visitModalItem)}
                    >
                      ยาส่งได้ (อนุมัติ)
                    </button>
                  </>
                )}

                {stage === 'approved' && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => openDeliveryModal(visitModalItem)}
                  >
                    จัดส่งยา / บันทึกเลขพัสดุ
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          Reject Reason Modal (Mandatory Remark)
          ======================================================================== */}
      {rejectModalItem && (
        <div className="dialog-modal-overlay" onClick={() => setRejectModalItem(null)}>
          <div className="dialog-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-modal-header">
              {rejectTargetRole === 'doctor'
                ? 'ระบุเหตุผลที่แพทย์ไม่อนุมัติ'
                : 'ระบุเหตุผลที่เภสัชกรไม่อนุมัติ (ยาส่งไม่ได้)'}
            </div>
            <form onSubmit={handleConfirmReject}>
              <div className="dialog-modal-body">
                <div style={{ fontSize: '0.875rem', color: 'var(--gray-700)' }}>
                  ผู้ป่วย: <strong>{rejectModalItem.patient_name}</strong> (HN: {rejectModalItem.hn})
                </div>

                <div className="form-group">
                  <label htmlFor="reject-reason-input" className="form-label font-bold">
                    เหตุผลความจำเป็น <span style={{ color: 'var(--error-600)' }}>* (บังคับกรอก)</span>
                  </label>
                  <textarea
                    id="reject-reason-input"
                    className="form-input"
                    rows={4}
                    placeholder={
                      rejectTargetRole === 'doctor'
                        ? 'เช่น ต้องเจาะเลือดตรวจค่าน้ำตาลก่อนรับยา, หรือ แพทย์ต้องการตรวจร่างกายคนไข้โดยตรง'
                        : 'เช่น มียาแช่เย็นไม่สามารถจัดส่งทางไปรษณีย์ได้, หรือ ต้องปรับขนาดยา'
                    }
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    autoFocus
                    required
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: '4px' }}>
                    รายการนี้จะถูกย้ายไปยังเมนู “ผู้ยื่นความจำนงทั้งหมด” ในสถานะไม่อนุมัติ
                  </span>
                </div>

                {rejectError && <div className="submit-error-alert">{rejectError}</div>}
              </div>

              <div className="dialog-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={rejectSubmitting}
                  onClick={() => setRejectModalItem(null)}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={rejectSubmitting || !rejectReason.trim()}
                >
                  {rejectSubmitting ? 'กำลังบันทึก...' : 'ยืนยันไม่อนุมัติ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================
          Delivery Modal (Tracking Number)
          ======================================================================== */}
      {deliveryModalItem && (
        <div className="dialog-modal-overlay" onClick={() => setDeliveryModalItem(null)}>
          <div className="dialog-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-modal-header">บันทึกการจัดส่งยาทางไปรษณีย์</div>
            <form onSubmit={handleConfirmDelivery}>
              <div className="dialog-modal-body">
                <div style={{ fontSize: '0.875rem', color: 'var(--gray-700)' }}>
                  <div>ผู้ป่วย: <strong>{deliveryModalItem.patient_name}</strong> (HN: {deliveryModalItem.hn})</div>
                  <div style={{ marginTop: '4px', fontSize: '0.8125rem', color: 'var(--gray-600)' }}>
                    ที่อยู่: {deliveryModalItem.address} {deliveryModalItem.postcode} (โทร: {deliveryModalItem.phone})
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="delivery-tracking-input" className="form-label font-bold">
                    หมายเลขพัสดุ (Tracking Number) <span style={{ color: 'var(--error-600)' }}>*</span>
                  </label>
                  <input
                    id="delivery-tracking-input"
                    type="text"
                    className="form-input font-mono"
                    placeholder="เช่น ED123456789TH"
                    value={deliveryTracking}
                    onChange={(e) => setDeliveryTracking(e.target.value)}
                    autoFocus
                    required
                  />
                </div>

                {deliveryError && <div className="submit-error-alert">{deliveryError}</div>}
              </div>

              <div className="dialog-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={deliverySubmitting}
                  onClick={() => setDeliveryModalItem(null)}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={deliverySubmitting || !deliveryTracking.trim()}
                >
                  {deliverySubmitting ? 'กำลังบันทึก...' : 'บันทึกจัดส่งเรียบร้อย'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

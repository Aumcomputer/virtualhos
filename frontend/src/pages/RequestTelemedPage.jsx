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

function formatThaiTime(dateTimeStr) {
  if (!dateTimeStr) return '';
  try {
    const d = new Date(dateTimeStr);
    if (isNaN(d.getTime())) return '';
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${mins}`;
  } catch {
    return '';
  }
}

function formatDoctorName(raw) {
  if (!raw) return '—';
  if (raw.includes(',')) {
    const parts = raw.split(',').map((s) => s.trim());
    if (parts.length === 2 && parts[1]) {
      return `${parts[1]} ${parts[0]}`;
    }
  }
  return raw;
}

function formatPhone(phone) {
  if (!phone) return '—';
  const clean = String(phone).replace(/\D/g, '');
  if (clean.length === 10) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
  }
  if (clean.length === 9) {
    return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5)}`;
  }
  return phone;
}

function getPatientInitials(name) {
  if (!name) return 'ผป';
  const clean = name.replace(/^(นาย|นาง|นางสาว|ด\.ช\.|ด\.ญ\.|น\.ส\.)\s*/, '').trim();
  return clean ? clean.slice(0, 2) : 'ผป';
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

        {/* Table Card containing Toolbar & Data Table */}
        <div className="table-card">
          {/* Table Toolbar */}
          <div className="table-toolbar">
            <div className="search-box" style={{ maxWidth: '420px' }}>
              <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="search-input"
                placeholder="ค้นหา HN, ชื่อผู้ป่วย, เบอร์โทร, คลินิก, แพทย์, เลขพัสดุ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearch('')}
                  title="ล้างการค้นหา"
                >
                  ✕
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {stage === 'all' && (
                <select
                  className="filter-select"
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
              )}

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => fetchData()}
                title="รีเฟรชข้อมูล"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span>รีเฟรช</span>
              </button>
            </div>
          </div>

          {/* Data Table Wrapper */}
          <div className="data-table-wrapper">
            <table className="data-table telemed-workflow-table">
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

                  <th style={{ textAlign: 'center', minWidth: '160px' }}>การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '48px 20px' }}>
                      <div className="loading-spinner-wrapper" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', color: 'var(--gray-600)' }}>
                        <svg className="spin-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        <span style={{ fontSize: '0.875rem' }}>กำลังโหลดข้อมูล...</span>
                      </div>
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '56px 20px' }}>
                      <div className="empty-state-box">
                        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '6px' }}>
                          {meta.emptyText}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--gray-500)' }}>
                          {search ? 'ลองค้นหาด้วยคำค้นอื่น หรือล้างช่องค้นหา' : 'เมื่อมีรายการคำขอใหม่จะแสดงในตารางนี้'}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.map((item, idx) => {
                    const rowNumber = (page - 1) * limit + idx + 1;
                    const badge = getStatusBadgeConfig(item.status);

                    return (
                      <tr key={item.id}>
                        {/* 1. Row index */}
                        <td style={{ textAlign: 'center', color: 'var(--gray-400)', fontSize: '0.8125rem', fontFamily: 'monospace' }}>
                          {rowNumber}
                        </td>

                        {/* 2. Request Date */}
                        <td>
                          <div className="req-date-cell">
                            <span className="req-date-main">{formatThaiDate(item.created_at)}</span>
                            {formatThaiTime(item.created_at) && (
                              <span className="req-date-sub">{formatThaiTime(item.created_at)} น.</span>
                            )}
                          </div>
                        </td>

                        {/* 3. Appointment Date */}
                        <td>
                          <span className="appt-date-badge">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            <span>{formatThaiDate(item.nextdate)}</span>
                          </span>
                        </td>

                        {/* 4. HN Badge Button */}
                        <td>
                          <button
                            type="button"
                            className="hn-badge-btn"
                            onClick={() => openVisitModal(item)}
                            title="คลิกเพื่อดูประวัติการตรวจใน HOSxP"
                          >
                            {item.hn}
                          </button>
                        </td>

                        {/* 5. Patient Name */}
                        <td>
                          <div className="patient-cell-wrapper">
                            <div className="patient-avatar-dot">
                              {getPatientInitials(item.patient_name)}
                            </div>
                            <div className="patient-meta">
                              <button
                                type="button"
                                className="patient-name-btn"
                                onClick={() => openVisitModal(item)}
                                title="คลิกเพื่อดูประวัติการตรวจใน HOSxP"
                              >
                                {item.patient_name || '—'}
                              </button>
                              <span className="patient-sub-cue">คลิกดูประวัติการตรวจ</span>
                            </div>
                          </div>
                        </td>

                        {/* 6. Clinic Name */}
                        <td style={{ fontSize: '0.8125rem', color: 'var(--gray-700)', whiteSpace: 'nowrap' }}>
                          {item.clinic_name || '—'}
                        </td>

                        {/* 7. Doctor Name */}
                        <td>
                          <div className="doctor-name-badge">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/>
                              <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/>
                              <circle cx="20" cy="10" r="2"/>
                            </svg>
                            <span>{formatDoctorName(item.doctor_name)}</span>
                          </div>
                        </td>

                        {/* 8. Symptoms / Reason */}
                        <td>
                          <div className="symptoms-text-box" title={`${item.reason || ''}${item.symptoms ? ' | อาการ: ' + item.symptoms : ''}`}>
                            {item.symptoms || item.reason || '—'}
                          </div>
                        </td>

                        {/* 9. Phone Number */}
                        <td>
                          {item.phone ? (
                            <a href={`tel:${item.phone}`} className="phone-link" title="โทรออก">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                              </svg>
                              <span>{formatPhone(item.phone)}</span>
                            </a>
                          ) : (
                            <span style={{ color: 'var(--gray-400)', fontSize: '0.8125rem' }}>—</span>
                          )}
                        </td>

                        {/* 10. Stage context column */}
                        {stage === 'receive' && (
                          <td style={{ fontSize: '0.8125rem', color: 'var(--gray-600)', whiteSpace: 'nowrap' }}>
                            <span className="badge badge-neutral">{item.request_by || 'คนไข้ (LINE)'}</span>
                          </td>
                        )}
                        {stage === 'doctor' && (
                          <td style={{ fontSize: '0.8125rem', color: 'var(--gray-700)' }}>
                            <div style={{ fontWeight: 600 }}>{item.received_by || '—'}</div>
                            {item.received_at && (
                              <div style={{ fontSize: '0.6875rem', color: 'var(--gray-400)', marginTop: '2px' }}>
                                {formatThaiDateTime(item.received_at)}
                              </div>
                            )}
                          </td>
                        )}
                        {stage === 'pharmacist' && (
                          <td style={{ fontSize: '0.8125rem' }}>
                            <div style={{ fontWeight: 600, color: '#047857' }}>
                              {item.doctor_approved_by || 'แพทย์อนุมัติ'}
                            </div>
                            {item.doctor_remark && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--primary-700)', marginTop: '2px' }}>
                                หมายเหตุ: {item.doctor_remark}
                              </div>
                            )}
                          </td>
                        )}
                        {stage === 'approved' && (
                          <td style={{ fontSize: '0.8125rem', color: 'var(--gray-700)' }}>
                            <div style={{ fontWeight: 600, color: '#047857' }}>
                              {item.pharmacy_approved_by || item.approve_by || 'เภสัชกร'}
                            </div>
                            {(item.pharmacy_approved_at || item.approve_at) && (
                              <div style={{ fontSize: '0.6875rem', color: 'var(--gray-400)', marginTop: '2px' }}>
                                {formatThaiDateTime(item.pharmacy_approved_at || item.approve_at)}
                              </div>
                            )}
                          </td>
                        )}
                        {(stage === 'today' || stage === 'all') && (
                          <td>
                            <span className="status-pill" style={badge.style}>
                              {badge.label}
                            </span>
                            {item.tracking_number && (
                              <div style={{ fontSize: '0.6875rem', fontFamily: 'monospace', color: '#6d28d9', marginTop: '3px', fontWeight: 600 }}>
                                📦 {item.tracking_number}
                              </div>
                            )}
                          </td>
                        )}

                        {/* 11. Action Buttons */}
                        <td style={{ textAlign: 'center' }}>
                          <div className="queue-action-group">
                            {stage === 'receive' && (
                              <button
                                type="button"
                                className="btn-action-pill btn-action-receive"
                                onClick={() => handleReceive(item)}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span>รับเรื่อง</span>
                              </button>
                            )}

                            {stage === 'doctor' && (
                              <>
                                <button
                                  type="button"
                                  className="btn-action-pill btn-action-approve"
                                  onClick={() => handleDoctorApprove(item)}
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                  <span>แพทย์อนุมัติ</span>
                                </button>
                                <button
                                  type="button"
                                  className="btn-action-pill btn-action-reject"
                                  onClick={() => openRejectModal(item, 'doctor')}
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                  </svg>
                                  <span>ไม่อนุมัติ</span>
                                </button>
                              </>
                            )}

                            {stage === 'pharmacist' && (
                              <>
                                <button
                                  type="button"
                                  className="btn-action-pill btn-action-approve"
                                  onClick={() => handlePharmacyApprove(item)}
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                  <span>ยาส่งได้</span>
                                </button>
                                <button
                                  type="button"
                                  className="btn-action-pill btn-action-reject"
                                  onClick={() => openRejectModal(item, 'pharmacist')}
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                  </svg>
                                  <span>ส่งไม่ได้</span>
                                </button>
                              </>
                            )}

                            {stage === 'approved' && (
                              <button
                                type="button"
                                className="btn-action-pill btn-action-deliver"
                                onClick={() => openDeliveryModal(item)}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="1" y="3" width="15" height="13" />
                                  <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                  <circle cx="5.5" cy="18.5" r="2.5" />
                                  <circle cx="18.5" cy="18.5" r="2.5" />
                                </svg>
                                <span>จัดส่งยา</span>
                              </button>
                            )}

                            {/* View Clinical Details (All stages) */}
                            <button
                              type="button"
                              className="btn-action-pill btn-action-history"
                              onClick={() => openVisitModal(item)}
                              title="ดูรายละเอียดการตรวจใน HOSxP"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                                <polyline points="10 9 9 9 8 9" />
                              </svg>
                              <span>ประวัติ</span>
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

          {/* Table Footer & Pagination */}
          <div className="table-footer" style={{ padding: '14px 20px', borderTop: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ fontSize: '0.8125rem', color: 'var(--gray-600)' }}>
              {pagination.total > 0 ? (
                <>แสดง {((page - 1) * limit) + 1} - {Math.min(page * limit, pagination.total)} จากทั้งหมด <strong>{pagination.total}</strong> รายการ</>
              ) : (
                '0 รายการ'
              )}
            </div>

            {pagination.totalPages > 1 && (
              <div className="pagination-controls" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ย้อนกลับ
                </button>
                <span className="pagination-pages" style={{ fontSize: '0.8125rem', color: 'var(--gray-600)' }}>
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
            )}
          </div>
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
                <div className="patient-banner-left">
                  <div className="patient-banner-avatar">
                    {getPatientInitials(visitModalItem.patient_name)}
                  </div>
                  <div className="patient-banner-name-block">
                    <div className="patient-banner-name">
                      {visitModalItem.patient_name}
                    </div>
                    <div className="patient-banner-sub">
                      <span className="font-mono" style={{ fontWeight: 600, color: 'var(--primary-700)' }}>
                        HN: {visitModalItem.hn}
                      </span>
                      {visitDetail?.visit?.age_y !== undefined && (
                        <span>• อายุ {visitDetail.visit.age_y} ปี {visitDetail.visit.age_m || 0} เดือน</span>
                      )}
                      {visitDetail?.vn && (
                        <span>• VN: {visitDetail.vn}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="patient-banner-right">
                  <div className="patient-banner-badge-group">
                    <span className="appt-date-badge">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      <span>นัดตรวจ: {formatThaiDate(visitModalItem.nextdate)} ({visitModalItem.clinic_name || 'ไม่ระบุคลินิก'})</span>
                    </span>
                  </div>

                  <div className="doctor-name-badge">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/>
                      <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/>
                      <circle cx="20" cy="10" r="2"/>
                    </svg>
                    <span>{formatDoctorName(visitModalItem.doctor_name)}</span>
                  </div>
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
                  {/* 1. Vital Signs & Physical Exam (สัญญาณชีพและการตรวจร่างกาย) */}
                  <div className="clinical-card">
                    <div className="clinical-card-header">
                      <div className="header-title-left">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        </svg>
                        <span>สัญญาณชีพและการตรวจร่างกาย (ครั้งที่มาตรวจ)</span>
                      </div>
                      {visitDetail?.visit?.vstdate && (
                        <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--gray-500)' }}>
                          วันที่ตรวจ: {formatThaiDate(visitDetail.visit.vstdate)}
                        </span>
                      )}
                    </div>
                    <div className="clinical-card-body" style={{ padding: '10px 14px' }}>
                      {visitDetail?.visit ? (
                        <>
                          <div className="vitals-cards-grid">
                            <div className="vital-stat-card">
                              <span className="v-label">BP (ความดัน)</span>
                              <div className="v-value-group">
                                <span className="v-value">
                                  {visitDetail.visit.bps && visitDetail.visit.bpd
                                    ? `${visitDetail.visit.bps}/${visitDetail.visit.bpd}`
                                    : '—'}
                                </span>
                                <span className="v-unit">mmHg</span>
                              </div>
                            </div>
                            <div className="vital-stat-card">
                              <span className="v-label">Pulse (ชีพจร)</span>
                              <div className="v-value-group">
                                <span className="v-value">{visitDetail.visit.pulse || visitDetail.visit.hr || '—'}</span>
                                <span className="v-unit">/นาที</span>
                              </div>
                            </div>
                            <div className="vital-stat-card">
                              <span className="v-label">Temp (อุณหภูมิ)</span>
                              <div className="v-value-group">
                                <span className="v-value">{visitDetail.visit.temperature || '—'}</span>
                                <span className="v-unit">°C</span>
                              </div>
                            </div>
                            <div className="vital-stat-card">
                              <span className="v-label">RR (การหายใจ)</span>
                              <div className="v-value-group">
                                <span className="v-value">{visitDetail.visit.rr || '—'}</span>
                                <span className="v-unit">/นาที</span>
                              </div>
                            </div>
                            <div className="vital-stat-card">
                              <span className="v-label">BW (น้ำหนัก)</span>
                              <div className="v-value-group">
                                <span className="v-value">{visitDetail.visit.bw || '—'}</span>
                                <span className="v-unit">กก.</span>
                              </div>
                            </div>
                            <div className="vital-stat-card">
                              <span className="v-label">ส่วนสูง</span>
                              <div className="v-value-group">
                                <span className="v-value">{visitDetail.visit.height || '—'}</span>
                                <span className="v-unit">ซม.</span>
                              </div>
                            </div>
                            <div className="vital-stat-card">
                              <span className="v-label">BMI (ดัชนีมวลกาย)</span>
                              <div className="v-value-group">
                                <span className="v-value">{visitDetail.visit.bmi || '—'}</span>
                                <span className="v-unit">kg/m²</span>
                              </div>
                            </div>
                          </div>

                          {(visitDetail.visit.cc || visitDetail.visit.pe) && (
                            <div className="vitals-notes-box">
                              {visitDetail.visit.cc && (
                                <div><strong>อาการสำคัญ (CC):</strong> {visitDetail.visit.cc}</div>
                              )}
                              {visitDetail.visit.pe && (
                                <div><strong>ตรวจร่างกาย (PE):</strong> {visitDetail.visit.pe}</div>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ color: 'var(--gray-500)', fontSize: '0.8125rem' }}>
                          {visitDetail?.message || 'ไม่พบข้อมูลสัญญาณชีพสำหรับนัดหมายนี้'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 2-Column Clinical Dashboard Grid */}
                  <div className="clinical-dashboard-grid">
                    {/* Left Column: Meds & Diagnoses */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {/* Prescribed Drugs */}
                      <div className="clinical-card">
                        <div className="clinical-card-header">
                          <div className="header-title-left">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/>
                              <path d="m8.5 8.5 7 7"/>
                            </svg>
                            <span>รายการยาเดิมที่ได้รับ (Prescribed Drugs)</span>
                          </div>
                          {visitDetail?.visit?.drug_concat && (
                            <span className="badge badge-primary font-mono" style={{ fontSize: '0.6875rem' }}>
                              {parseLines(visitDetail.visit.drug_concat).length} รายการ
                            </span>
                          )}
                        </div>
                        <div className="clinical-card-body" style={{ padding: '10px 14px' }}>
                          {visitDetail?.visit?.drug_concat ? (
                            <div className="meds-items-list">
                              {parseLines(visitDetail.visit.drug_concat).map((medLine, mIdx) => {
                                const parts = medLine.split('#');
                                const medInfo = parts[0] ? parts[0].trim() : medLine;
                                const qty = parts[1] ? parts[1].trim() : '';

                                return (
                                  <div key={mIdx} className="med-item-row">
                                    <div className="med-item-left">
                                      <span className="med-item-num">#{mIdx + 1}</span>
                                      <div className="med-item-name">{medInfo}</div>
                                    </div>
                                    {qty && <span className="med-item-qty">{qty} เม็ด/หน่วย</span>}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ color: 'var(--gray-400)', fontStyle: 'italic', fontSize: '0.8125rem', padding: '6px 0' }}>
                              — ไม่พบรายการยาในการตรวจครั้งนี้ —
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Diagnoses */}
                      <div className="clinical-card">
                        <div className="clinical-card-header">
                          <div className="header-title-left">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                              <line x1="16" y1="13" x2="8" y2="13"/>
                              <line x1="16" y1="17" x2="8" y2="17"/>
                              <polyline points="10 9 9 9 8 9"/>
                            </svg>
                            <span>การวินิจฉัยโรค (Diagnoses)</span>
                          </div>
                        </div>
                        <div className="clinical-card-body" style={{ padding: '10px 14px' }}>
                          {visitDetail?.visit?.diagnosis_concat && visitDetail.visit.diagnosis_concat.trim() ? (
                            <div className="diag-list">
                              {parseLines(visitDetail.visit.diagnosis_concat).map((line, dIdx) => {
                                const isPdx = line.includes('(PDX)');
                                const cleanLine = line.replace('(PDX)', '').trim();
                                return (
                                  <div key={dIdx} className="diag-item">
                                    {isPdx && <span className="pdx-badge">PDX โรคหลัก</span>}
                                    <span style={{ fontWeight: isPdx ? 600 : 400, color: 'var(--gray-800)' }}>
                                      {cleanLine}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ color: 'var(--gray-400)', fontStyle: 'italic', fontSize: '0.8125rem', padding: '4px 0' }}>
                              — ไม่พบข้อมูลการวินิจฉัยโรคในการตรวจครั้งนี้ —
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Non-drug Items (Only if exists) */}
                      {visitDetail?.visit?.nondrug_concat && visitDetail.visit.nondrug_concat.trim() && (
                        <div className="clinical-card">
                          <div className="clinical-card-header">
                            <div className="header-title-left">
                              <span>เวชภัณฑ์ / อื่นๆ (Non-drug Items)</span>
                            </div>
                          </div>
                          <div className="clinical-card-body" style={{ padding: '10px 14px' }}>
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

                      {/* X-Ray Report (Only if exists) */}
                      {visitDetail?.visit?.xray_report && visitDetail.visit.xray_report.trim() && (
                        <div className="clinical-card">
                          <div className="clinical-card-header">
                            <div className="header-title-left">
                              <span>ผลเอกซเรย์ (X-Ray Report)</span>
                            </div>
                          </div>
                          <div className="clinical-card-body" style={{ padding: '10px 14px' }}>
                            <pre className="xray-text-box">{visitDetail.visit.xray_report}</pre>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right Column: Current Telemed Request Details */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div className="clinical-card">
                        <div className="clinical-card-header">
                          <div className="header-title-left">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="1" y="3" width="15" height="13" />
                              <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                              <circle cx="5.5" cy="18.5" r="2.5" />
                              <circle cx="18.5" cy="18.5" r="2.5" />
                            </svg>
                            <span>ข้อมูลคำขอรับยาไม่พบแพทย์ปัจจุบัน</span>
                          </div>
                        </div>
                        <div className="clinical-card-body" style={{ padding: '12px 14px' }}>
                          <div className="req-detail-section">
                            {/* Reason Highlight */}
                            <div className="req-highlight-box">
                              <strong>เหตุผลความจำเป็น: </strong>
                              {visitModalItem.reason || '—'}
                            </div>

                            {visitModalItem.symptoms && (
                              <div className="req-info-row">
                                <span className="label">อาการปัจจุบัน:</span>
                                <span className="val">{visitModalItem.symptoms}</span>
                              </div>
                            )}

                            <div className="req-info-row">
                              <span className="label">ที่อยู่จัดส่งยา:</span>
                              <span className="val">
                                {visitModalItem.address || '—'} {visitModalItem.postcode || ''}
                              </span>
                            </div>

                            <div className="req-info-row">
                              <span className="label">เบอร์โทรศัพท์:</span>
                              <span className="val">
                                {visitModalItem.phone ? (
                                  <a href={`tel:${visitModalItem.phone}`} className="phone-link" style={{ padding: 0 }}>
                                    {formatPhone(visitModalItem.phone)}
                                  </a>
                                ) : (
                                  '—'
                                )}
                              </span>
                            </div>

                            {/* Audit Trail Timeline */}
                            <div className="audit-trail-timeline">
                              <div className="audit-trail-item">
                                <span className="audit-dot"></span>
                                <span>ผู้ยื่นคำขอ: <strong>{visitModalItem.request_by || 'คนไข้ (LINE OA)'}</strong> ({formatThaiDateTime(visitModalItem.created_at)})</span>
                              </div>

                              {visitModalItem.received_by && (
                                <div className="audit-trail-item">
                                  <span className="audit-dot success"></span>
                                  <span>รับเรื่องโดย: <strong>{visitModalItem.received_by}</strong> ({formatThaiDateTime(visitModalItem.received_at)})</span>
                                </div>
                              )}

                              {visitModalItem.doctor_approved_by && (
                                <div className="audit-trail-item">
                                  <span className={`audit-dot ${visitModalItem.status && visitModalItem.status.includes('ไม่อนุมัติ') ? 'error' : 'success'}`}></span>
                                  <span>แพทย์: <strong>{visitModalItem.doctor_approved_by}</strong> {visitModalItem.doctor_remark ? `(หมายเหตุ: ${visitModalItem.doctor_remark})` : ''}</span>
                                </div>
                              )}

                              {visitModalItem.pharmacy_approved_by && (
                                <div className="audit-trail-item">
                                  <span className={`audit-dot ${visitModalItem.status && visitModalItem.status.includes('ไม่อนุมัติ') ? 'error' : 'success'}`}></span>
                                  <span>เภสัชกร: <strong>{visitModalItem.pharmacy_approved_by}</strong> {visitModalItem.pharmacy_remark ? `(หมายเหตุ: ${visitModalItem.pharmacy_remark})` : ''}</span>
                                </div>
                              )}

                              {visitModalItem.tracking_number && (
                                <div className="audit-trail-item">
                                  <span className="audit-dot success"></span>
                                  <span style={{ fontWeight: 600, color: '#6d28d9' }}>
                                    เลขพัสดุ: {visitModalItem.tracking_number} ({formatThaiDateTime(visitModalItem.delivery_at)})
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
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

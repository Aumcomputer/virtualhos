import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../api/client';

function getTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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

function generateAddressHtml(item, pttype = '') {
  const patientName = item.patient_name || 'ไม่ระบุชื่อ';
  const hn = item.hn || '—';
  const phone = formatPhone(item.phone) || item.phone || '—';
  
  let fullAddress = (item.address || '').trim();
  const postcode = (item.postcode || '').trim();
  if (postcode && !fullAddress.includes(postcode)) {
    fullAddress = `${fullAddress} ${postcode}`.trim();
  }
  if (!fullAddress) fullAddress = '—';

  const pttypeDisplay = pttype || item.pttype_name || '—';

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>${patientName} (HN: ${hn})</title>
  <style>
    @page {
      size: A5 portrait;
      margin: 12mm 14mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Sarabun', 'TH Sarabun New', 'Prompt', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #000;
      background: #fff;
    }
    .print-box {
      border: 3px solid #000;
      border-radius: 8px;
      padding: 26px 22px;
      min-height: 180mm;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .field-row {
      display: flex;
      align-items: baseline;
      gap: 14px;
    }
    .field-col {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .label {
      font-size: 17pt;
      font-weight: 700;
      color: #111;
      white-space: nowrap;
      min-width: 80px;
    }
    .val-name {
      font-size: 26pt;
      font-weight: 900;
      color: #000;
      line-height: 1.25;
    }
    .val-hn {
      font-size: 22pt;
      font-weight: 800;
      font-family: monospace, sans-serif;
      color: #000;
    }
    .val-pttype {
      font-size: 19pt;
      font-weight: 800;
      color: #000;
      line-height: 1.35;
    }
    .val-address {
      font-size: 20pt;
      font-weight: 700;
      color: #000;
      line-height: 1.45;
      word-break: break-word;
    }
    .val-phone {
      font-size: 24pt;
      font-weight: 900;
      color: #000;
      letter-spacing: 1px;
    }
    .divider {
      border-bottom: 2px dashed #94a3b8;
      margin: 4px 0;
    }
  </style>
</head>
<body>
  <div class="print-box">
    <!-- 1. ชื่อ -->
    <div class="field-row">
      <span class="label">ชื่อ:</span>
      <span class="val-name">${patientName}</span>
    </div>

    <!-- 2. HN -->
    <div class="field-row">
      <span class="label">HN:</span>
      <span class="val-hn">${hn}</span>
    </div>

    <div class="divider"></div>

    <!-- 3. สิทธิ์ -->
    <div class="field-row" style="align-items: flex-start;">
      <span class="label">สิทธิ์:</span>
      <span class="val-pttype">${pttypeDisplay}</span>
    </div>

    <div class="divider"></div>

    <!-- 4. ที่อยู่ -->
    <div class="field-col">
      <span class="label">ที่อยู่:</span>
      <span class="val-address">${fullAddress}</span>
    </div>

    <div class="divider"></div>

    <!-- 5. เบอร์โทร -->
    <div class="field-row">
      <span class="label">เบอร์โทร:</span>
      <span class="val-phone">${phone}</span>
    </div>
  </div>
</body>
</html>`;
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
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
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
        date: stage === 'today' ? selectedDate : '',
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
  }, [page, search, statusFilter, stage, selectedDate, sortBy, sortOrder]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset page when search, stage, or selectedDate changes
  useEffect(() => {
    setPage(1);
  }, [search, stage, statusFilter, selectedDate]);

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

  // Check if item is eligible for printing address (approved stage or deliverable status)
  const canPrintAddress = (item) => {
    if (!item) return false;
    const s = String(item.status || '');
    return (
      stage === 'approved' ||
      (s.includes('สามารถจัดส่งได้') && !s.includes('ไม่สามารถ')) ||
      s.includes('จัดส่งเรียบร้อย')
    );
  };

  // Trigger A5 portrait address print (ชื่อ, HN, สิทธิ์, ที่อยู่, เบอร์โทร)
  const handlePrintAddress = async (item) => {
    if (!item) return;

    // Resolve pttype from visitDetail or fetch if not present
    let pttype = '';
    if (visitModalItem?.id === item.id && visitDetail) {
      pttype = visitDetail?.visit_pttype?.[0]?.pttype_name || visitDetail?.visit?.pttype_name || '';
    }
    if (!pttype && item.id) {
      try {
        const vd = await api.getVisitDetail(item.id);
        pttype = vd?.visit_pttype?.[0]?.pttype_name || vd?.visit?.pttype_name || '';
      } catch (e) {
        // fallback
      }
    }

    const html = generateAddressHtml(item, pttype);

    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();

      iframe.contentWindow.focus();
      setTimeout(() => {
        iframe.contentWindow.print();
        setTimeout(() => {
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
        }, 1000);
      }, 350);
    } catch (err) {
      console.warn('Iframe print failed, falling back to window.open:', err);
      const printWin = window.open('', '_blank', 'width=700,height=900');
      if (printWin) {
        printWin.document.open();
        printWin.document.write(html);
        printWin.document.close();
        printWin.focus();
        setTimeout(() => {
          printWin.print();
        }, 400);
      }
    }
  };

  const hasActionColumn = stage === 'doctor' || stage === 'pharmacist' || stage === 'approved';

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
            <h2 className="page-title">
              {stage === 'today' && selectedDate !== getTodayStr()
                ? `“รับยาไม่พบแพทย์” วันที่ ${formatThaiDate(selectedDate)}`
                : meta.title}
            </h2>
            <p className="page-subtitle">
              {stage === 'today' && selectedDate !== getTodayStr()
                ? `คำขอรับยาไม่พบแพทย์ที่มีวันนัดหมายตรงกับวันที่ ${formatThaiDate(selectedDate)}`
                : meta.subtitle}
            </p>
          </div>

          {stage === 'today' && (
            <div className="page-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="date-picker-group" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <label htmlFor="today-date-picker" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--gray-700)', whiteSpace: 'nowrap' }}>
                  เลือกวันที่:
                </label>
                <input
                  id="today-date-picker"
                  className="date-input"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{
                    height: '38px',
                    padding: '6px 12px',
                    fontSize: '0.875rem',
                    border: '1.5px solid var(--gray-200)',
                    borderRadius: 'var(--radius-md)',
                    background: 'white',
                    color: 'var(--gray-800)',
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                />
                {selectedDate !== getTodayStr() && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setSelectedDate(getTodayStr())}
                    title="กลับไปดูวันนี้"
                    style={{
                      height: '38px',
                      padding: '6px 12px',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    วันนี้
                  </button>
                )}
              </div>
            </div>
          )}
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
                className="btn btn-secondary btn-refresh"
                onClick={() => fetchData()}
                title="Refresh"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 12px',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  height: '38px',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span>Refresh</span>
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

                  {hasActionColumn && (
                    <th style={{ textAlign: 'center', minWidth: '160px' }}>การดำเนินการ</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={hasActionColumn ? 10 : 9} style={{ textAlign: 'center', padding: '48px 20px' }}>
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
                    <td colSpan={hasActionColumn ? 10 : 9} style={{ textAlign: 'center', padding: '56px 20px' }}>
                      <div className="empty-state-box">
                        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '6px' }}>
                          {stage === 'today' && selectedDate !== getTodayStr()
                            ? `ไม่มีรายการคำขอรับยาไม่พบแพทย์ที่มีนัดหมายในวันที่ ${formatThaiDate(selectedDate)}`
                            : meta.emptyText}
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
                      <tr
                        key={item.id}
                        className="table-row-clickable"
                        onClick={() => openVisitModal(item)}
                        title="คลิกเพื่อดูเหตุผล อาการ และประวัติเดิม"
                      >
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

                        {/* 4. HN Badge */}
                        <td>
                          <span className="hn-badge-btn font-mono">
                            {item.hn}
                          </span>
                        </td>

                        {/* 5. Patient Name */}
                        <td style={{ fontWeight: 600, color: 'var(--gray-900)', whiteSpace: 'nowrap' }}>
                          {item.patient_name || '—'}
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

                        {/* 8. Phone Number */}
                        <td>
                          {item.phone ? (
                            <a
                              href={`tel:${item.phone}`}
                              className="phone-link"
                              title="โทรออก"
                              onClick={(e) => e.stopPropagation()}
                            >
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

                        {/* 11. Action Buttons (Only for doctor, pharmacist, approved) */}
                        {hasActionColumn && (
                          <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                            <div className="queue-action-group">
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
                                <>
                                  <button
                                    type="button"
                                    className="btn-action-pill btn-action-print"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePrintAddress(item);
                                    }}
                                    title="พิมพ์ใบปะหน้าชื่อ ที่อยู่ เบอร์โทร (A5 แนวตั้ง)"
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="6 9 6 2 18 2 18 9" />
                                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                                      <rect x="6" y="14" width="12" height="8" />
                                    </svg>
                                    <span>พิมพ์ที่อยู่</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-action-pill btn-action-deliver"
                                    onClick={() => openDeliveryModal(item)}
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <rect x="1" y="3" width="15" height="13" />
                                      <polygon points="16 8 20 8 23 11 23 16 16 16 8" />
                                      <circle cx="5.5" cy="18.5" r="2.5" />
                                      <circle cx="18.5" cy="18.5" r="2.5" />
                                    </svg>
                                    <span>จัดส่งยา</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        )}
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
                      {(visitDetail?.visit_pttype?.[0]?.pttype_name || visitDetail?.visit?.pttype_name) && (
                        <span style={{ color: '#0369a1', fontWeight: 600 }}>
                          • สิทธิ: {visitDetail?.visit_pttype?.[0]?.pttype_name || visitDetail?.visit?.pttype_name}
                          {visitDetail?.visit_pttype?.[0]?.pttype ? ` (${visitDetail.visit_pttype[0].pttype})` : ''}
                        </span>
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
                  {/* 2-Column Clinical Dashboard Grid */}
                  <div className="clinical-dashboard-grid">
                    {/* LEFT COLUMN: ประวัติ Visit ที่แล้ว (Previous Visit Clinical History) */}
                    <div className="clinical-col left-col">
                      <div className="column-header left-col-header">
                        <div className="column-header-title">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/>
                            <line x1="16" y1="17" x2="8" y2="17"/>
                            <polyline points="10 9 9 9 8 9"/>
                          </svg>
                          <span>ประวัติการตรวจครั้งก่อน (Previous Visit)</span>
                        </div>
                        {visitDetail?.visit?.vstdate && (
                          <span className="visit-date-tag">
                            ตรวจเมื่อ: {formatThaiDate(visitDetail.visit.vstdate)}
                          </span>
                        )}
                      </div>

                      {visitDetail?.visit ? (
                        <div className="clinical-col-content">
                          {/* สิทธิการรักษา (ดึงจาก table visit_pttype) */}
                          {((visitDetail?.visit_pttype && visitDetail.visit_pttype.length > 0) || visitDetail?.visit?.pttype_name) && (
                            <div className="clinical-card entitlement-card">
                              <div className="clinical-card-header">
                                <div className="header-title-left">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="5" width="20" height="14" rx="2" />
                                    <line x1="2" y1="10" x2="22" y2="10" />
                                  </svg>
                                  <span>สิทธิการรักษา (Entitlement - visit_pttype)</span>
                                </div>
                                {visitDetail?.visit_pttype && visitDetail.visit_pttype.length > 1 && (
                                  <span className="badge badge-info" style={{ fontSize: '0.6875rem' }}>
                                    {visitDetail.visit_pttype.length} สิทธิ
                                  </span>
                                )}
                              </div>
                              <div className="clinical-card-body" style={{ padding: '8px 12px' }}>
                                <div className="entitlement-badge-list">
                                  {(visitDetail.visit_pttype && visitDetail.visit_pttype.length > 0
                                    ? visitDetail.visit_pttype
                                    : [{
                                        pttype: visitDetail.visit.pttype,
                                        pttype_name: visitDetail.visit.pttype_name,
                                      }]
                                  ).map((pt, ptIdx) => {
                                    const hasValidExpire = pt.expire_date && new Date(pt.expire_date).getFullYear() > 2000;
                                    return (
                                      <div key={ptIdx} className="entitlement-item">
                                        <div className="entitlement-main">
                                          {pt.pttype && (
                                            <span className="pttype-code-pill font-mono">{pt.pttype}</span>
                                          )}
                                          <span className="pttype-title-text font-bold">
                                            {pt.pttype_name || 'ไม่ระบุชื่อสิทธิ'}
                                          </span>
                                          {pt.pttype_number && visitDetail?.visit_pttype?.length > 1 && (
                                            <span className="pttype-tag-role">
                                              {pt.pttype_number === 1 ? 'สิทธิหลัก' : `สิทธิรอง (${pt.pttype_number})`}
                                            </span>
                                          )}
                                        </div>
                                        <div className="entitlement-details">
                                          {pt.pttypeno && pt.pttypeno.trim() && (
                                            <span className="entitlement-detail-item">
                                              เลขที่สิทธิ: <strong className="font-mono">{pt.pttypeno}</strong>
                                            </span>
                                          )}
                                          {(pt.hospmain_name || pt.hospmain) && (
                                            <span className="entitlement-detail-item">
                                              สถานพยาบาลหลัก: <strong>{pt.hospmain_name || pt.hospmain}</strong>
                                            </span>
                                          )}
                                          {(pt.hospsub_name || pt.hospsub) && (
                                            <span className="entitlement-detail-item">
                                              สถานพยาบาลรอง: <strong>{pt.hospsub_name || pt.hospsub}</strong>
                                            </span>
                                          )}
                                          {hasValidExpire && (
                                            <span className="entitlement-detail-item">
                                              วันหมดอายุ: <strong>{formatThaiDate(pt.expire_date)}</strong>
                                            </span>
                                          )}
                                          {pt.claim_code && pt.claim_code.trim() && (
                                            <span className="entitlement-detail-item">
                                              Claim Code: <strong className="font-mono">{pt.claim_code}</strong>
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 1. Vitals */}
                          <div className="clinical-card">
                            <div className="clinical-card-header">
                              <div className="header-title-left">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                                </svg>
                                <span>สัญญาณชีพ (Vital Signs)</span>
                              </div>
                            </div>
                            <div className="clinical-card-body" style={{ padding: '8px 10px' }}>
                              <div className="vitals-cards-grid">
                                <div className="vital-stat-card">
                                  <span className="v-label">BP</span>
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
                                  <span className="v-label">Pulse</span>
                                  <div className="v-value-group">
                                    <span className="v-value">{visitDetail.visit.pulse || visitDetail.visit.hr || '—'}</span>
                                    <span className="v-unit">/m</span>
                                  </div>
                                </div>
                                <div className="vital-stat-card">
                                  <span className="v-label">Temp</span>
                                  <div className="v-value-group">
                                    <span className="v-value">{visitDetail.visit.temperature || '—'}</span>
                                    <span className="v-unit">°C</span>
                                  </div>
                                </div>
                                <div className="vital-stat-card">
                                  <span className="v-label">RR</span>
                                  <div className="v-value-group">
                                    <span className="v-value">{visitDetail.visit.rr || '—'}</span>
                                    <span className="v-unit">/m</span>
                                  </div>
                                </div>
                                <div className="vital-stat-card">
                                  <span className="v-label">BW</span>
                                  <div className="v-value-group">
                                    <span className="v-value">{visitDetail.visit.bw || '—'}</span>
                                    <span className="v-unit">kg</span>
                                  </div>
                                </div>
                                <div className="vital-stat-card">
                                  <span className="v-label">Height</span>
                                  <div className="v-value-group">
                                    <span className="v-value">{visitDetail.visit.height || '—'}</span>
                                    <span className="v-unit">cm</span>
                                  </div>
                                </div>
                                <div className="vital-stat-card">
                                  <span className="v-label">BMI</span>
                                  <div className="v-value-group">
                                    <span className="v-value">{visitDetail.visit.bmi || '—'}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 2. CC & PE */}
                          <div className="clinical-cc-pe-grid">
                            <div className="cc-pe-card cc-card">
                              <div className="cc-pe-header">
                                <span className="cc-pe-tag cc-tag">CC</span>
                                <span className="cc-pe-title">อาการสำคัญ (Chief Complaint)</span>
                              </div>
                              <div className="cc-pe-body">
                                {visitDetail.visit.cc ? (
                                  <div className="cc-pe-text">{visitDetail.visit.cc}</div>
                                ) : (
                                  <div className="cc-pe-empty">— ไม่ได้ระบุข้อมูลอาการสำคัญ —</div>
                                )}
                              </div>
                            </div>

                            <div className="cc-pe-card pe-card">
                              <div className="cc-pe-header">
                                <span className="cc-pe-tag pe-tag">PE</span>
                                <span className="cc-pe-title">การตรวจร่างกาย (Physical Examination)</span>
                              </div>
                              <div className="cc-pe-body">
                                {visitDetail.visit.pe ? (
                                  <div className="cc-pe-text">{visitDetail.visit.pe}</div>
                                ) : (
                                  <div className="cc-pe-empty">— ไม่ได้ระบุข้อมูลการตรวจร่างกาย —</div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 3. Diagnoses */}
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
                            <div className="clinical-card-body" style={{ padding: '8px 12px' }}>
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
                                <div style={{ color: 'var(--gray-400)', fontStyle: 'italic', fontSize: '0.8125rem' }}>
                                  — ไม่พบข้อมูลการวินิจฉัยโรคในการตรวจครั้งนี้ —
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 4. Prescribed Drugs (Clean, Compact, No Heavy Borders) */}
                          <div className="clinical-card">
                            <div className="clinical-card-header">
                              <div className="header-title-left">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                            <div className="clinical-card-body" style={{ padding: '4px 8px' }}>
                              {visitDetail?.visit?.drug_concat ? (
                                <div className="meds-compact-table-wrap">
                                  <table className="meds-compact-table">
                                    <tbody>
                                      {parseLines(visitDetail.visit.drug_concat).map((medLine, mIdx) => {
                                        const parts = medLine.split('#');
                                        const medInfo = parts[0] ? parts[0].trim() : medLine;
                                        const qty = parts[1] ? parts[1].trim() : '';

                                        return (
                                          <tr key={mIdx}>
                                            <td className="med-col-num">#{mIdx + 1}</td>
                                            <td className="med-col-name">{medInfo}</td>
                                            <td className="med-col-qty">{qty ? `${qty} เม็ด/หน่วย` : ''}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div style={{ color: 'var(--gray-400)', fontStyle: 'italic', fontSize: '0.8125rem', padding: '6px 4px' }}>
                                  — ไม่พบรายการยาในการตรวจครั้งนี้ —
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 5. Non-drug Items (Only if exists) */}
                          {visitDetail?.visit?.nondrug_concat && visitDetail.visit.nondrug_concat.trim() && (
                            <div className="clinical-card">
                              <div className="clinical-card-header">
                                <div className="header-title-left">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0891b2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                                    <line x1="12" y1="22.08" x2="12" y2="12"/>
                                  </svg>
                                  <span>เวชภัณฑ์ / อื่นๆ (Non-drug Items)</span>
                                </div>
                                <span className="badge badge-primary font-mono" style={{ fontSize: '0.6875rem' }}>
                                  {parseLines(visitDetail.visit.nondrug_concat).length} รายการ
                                </span>
                              </div>
                              <div className="clinical-card-body" style={{ padding: '4px 8px' }}>
                                <div className="meds-compact-table-wrap">
                                  <table className="meds-compact-table">
                                    <tbody>
                                      {parseLines(visitDetail.visit.nondrug_concat).map((itemLine, ndIdx) => {
                                        const parts = itemLine.split('#');
                                        const itemName = parts[0] ? parts[0].trim() : itemLine;
                                        const qty = parts[1] ? parts[1].trim() : '';

                                        return (
                                          <tr key={ndIdx}>
                                            <td className="med-col-num">#{ndIdx + 1}</td>
                                            <td className="med-col-name">{itemName}</td>
                                            <td className="med-col-qty">{qty ? `${qty} หน่วย` : ''}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 6. X-Ray Report (Only if exists) */}
                          {visitDetail?.visit?.xray_report && visitDetail.visit.xray_report.trim() && (
                            <div className="clinical-card">
                              <div className="clinical-card-header">
                                <div className="header-title-left">
                                  <span>ผลเอกซเรย์ (X-Ray Report)</span>
                                </div>
                              </div>
                              <div className="clinical-card-body" style={{ padding: '8px 12px' }}>
                                <pre className="xray-text-box">{visitDetail.visit.xray_report}</pre>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="clinical-card" style={{ padding: '24px', textAlign: 'center', color: 'var(--gray-500)' }}>
                          {visitDetail?.message || 'ไม่พบข้อมูลประวัติการตรวจสำหรับนัดหมายนี้'}
                        </div>
                      )}
                    </div>

                    {/* RIGHT COLUMN: ข้อมูลคำขอรับยาปัจจุบัน (Current Request & Appt Details) */}
                    <div className="clinical-col right-col">
                      <div className="column-header right-col-header">
                        <div className="column-header-title">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="1" y="3" width="15" height="13" />
                            <polygon points="16 8 20 8 23 11 23 16 16 16 8" />
                            <circle cx="5.5" cy="18.5" r="2.5" />
                            <circle cx="18.5" cy="18.5" r="2.5" />
                          </svg>
                          <span>ข้อมูลคำขอยื่นรับยาปัจจุบัน</span>
                        </div>
                        <span className="badge badge-purple font-mono" style={{ fontSize: '0.75rem' }}>
                          {visitModalItem.status || 'รอตรวจสอบ'}
                        </span>
                      </div>

                      <div className="clinical-col-content">
                        {/* 1. Appointment Info Highlight Card */}
                        <div className="appt-detail-highlight-card">
                          <div className="appt-card-title-row">
                            <span className="appt-card-title font-bold text-purple-700">
                              ข้อมูลการนัดหมายที่ขอยื่นรับยา
                            </span>
                          </div>

                          <div className="appt-detail-grid-row">
                            <div className="appt-field-block">
                              <span className="appt-field-label">วันนัดตรวจ:</span>
                              <div className="appt-field-val">
                                <span className="font-bold text-primary">
                                  {formatThaiDate(visitModalItem.nextdate)}
                                </span>
                                {visitModalItem.clinic_name && (
                                  <span className="clinic-pill">{visitModalItem.clinic_name}</span>
                                )}
                              </div>
                            </div>

                            <div className="appt-field-block">
                              <span className="appt-field-label">แพทย์ผู้นัด:</span>
                              <div className="appt-field-val font-semibold">
                                {formatDoctorName(visitModalItem.doctor_name)}
                              </div>
                            </div>
                          </div>

                          {(visitDetail?.oapp?.app_cause || visitModalItem.app_cause) && (
                            <div className="appt-field-block">
                              <span className="appt-field-label">สาเหตุการนัด:</span>
                              <div className="appt-field-val">
                                {visitDetail?.oapp?.app_cause || visitModalItem.app_cause}
                              </div>
                            </div>
                          )}

                          {(visitDetail?.oapp?.note || visitModalItem.note) && (
                            <div className="appt-field-block">
                              <span className="appt-field-label">หมายเหตุการนัด:</span>
                              <div className="appt-field-val text-muted">
                                {visitDetail?.oapp?.note || visitModalItem.note}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 2. Request Details Card */}
                        <div className="clinical-card">
                          <div className="clinical-card-header">
                            <div className="header-title-left">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <line x1="16" y1="13" x2="8" y2="13"/>
                                <line x1="16" y1="17" x2="8" y2="17"/>
                              </svg>
                              <span>รายละเอียดการขอรับยาทางไปรษณีย์</span>
                            </div>
                          </div>
                          <div className="clinical-card-body" style={{ padding: '12px 14px' }}>
                            <div className="req-detail-section">
                              {/* Reason Highlight */}
                              <div className="req-highlight-box">
                                <strong>เหตุผลความจำเป็น: </strong>
                                {visitModalItem.reason || '—'}
                              </div>

                              {/* Symptoms */}
                              {visitModalItem.symptoms && (
                                <div className="req-info-row">
                                  <span className="label">อาการปัจจุบัน:</span>
                                  <span className="val font-medium">{visitModalItem.symptoms}</span>
                                </div>
                              )}

                              {/* Address */}
                              <div className="req-info-row" style={{ alignItems: 'flex-start' }}>
                                <span className="label">ที่อยู่จัดส่งยา:</span>
                                <div className="val" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <span>{visitModalItem.address || '—'} {visitModalItem.postcode || ''}</span>
                                  {canPrintAddress(visitModalItem) && (
                                    <div>
                                      <button
                                        type="button"
                                        className="btn-print-address-inline"
                                        onClick={() => handlePrintAddress(visitModalItem)}
                                      >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="6 9 6 2 18 2 18 9" />
                                          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                                          <rect x="6" y="14" width="12" height="8" />
                                        </svg>
                                        <span>พิมพ์ที่อยู่ (A5)</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Phone */}
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
                            </div>
                          </div>
                        </div>

                        {/* 3. Audit Trail Timeline */}
                        <div className="clinical-card">
                          <div className="clinical-card-header">
                            <div className="header-title-left">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                              <span>ประวัติและสถานะการดำเนินงาน (Timeline)</span>
                            </div>
                          </div>
                          <div className="clinical-card-body" style={{ padding: '10px 14px' }}>
                            <div className="audit-trail-timeline" style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>
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

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'nowrap' }}>
                {stage === 'receive' && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleReceive(visitModalItem)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>รับเรื่อง</span>
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

                {/* Print Address button when in approved stage or delivery ready */}
                {canPrintAddress(visitModalItem) && (
                  <button
                    type="button"
                    className="btn btn-print-modal"
                    onClick={() => handlePrintAddress(visitModalItem)}
                    title="พิมพ์ใบปะหน้าชื่อ ที่อยู่ เบอร์โทร สำหรับจัดส่งยา (A5 แนวตั้ง)"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 6 2 18 2 18 9" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect x="6" y="14" width="12" height="8" />
                    </svg>
                    <span>พิมพ์ที่อยู่ (A5)</span>
                  </button>
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

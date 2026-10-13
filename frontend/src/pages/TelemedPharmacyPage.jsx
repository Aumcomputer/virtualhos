import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import './PrescreeningPage.css';
import './RequestTelemedPage.css';
import './TelemedToday.css';

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

function formatDoctorName(raw) {
  if (!raw) return '—';
  const clean = String(raw).trim();
  if (!clean) return '—';
  if (clean.startsWith('นพ.') || clean.startsWith('พญ.') || clean.startsWith('น.พ.') || clean.startsWith('พ.ญ.')) {
    return clean;
  }
  return `พญ./นพ. ${clean}`;
}

function formatPhone(raw) {
  if (!raw) return '—';
  const clean = String(raw).replace(/\D/g, '');
  if (clean.length === 10) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
  }
  if (clean.length === 9) {
    return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5)}`;
  }
  return raw;
}

function formatMoney(num) {
  const n = Number(num || 0);
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function generateAddressHtml(item) {
  const patientName = item?.patient_name || '—';
  const hn = item?.hn || '—';
  const pttypeDisplay = item?.pttype_name || '—';
  const fullAddress = `${item?.address || ''} ${item?.postal_code || ''}`.trim() || '—';
  const phone = item?.phone ? formatPhone(item.phone) : '—';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>พิมพ์ใบปะหน้าจัดส่งยา - ${patientName}</title>
  <style>
    @page { size: A5 portrait; margin: 12mm 10mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Sarabun', 'TH Sarabun New', sans-serif; font-size: 16pt; line-height: 1.45; color: #000; margin: 0; padding: 0; }
    .print-box { border: 2.5px solid #000; border-radius: 8px; padding: 18px 20px; max-width: 100%; }
    .field-row { display: flex; align-items: baseline; margin-bottom: 10px; }
    .field-col { display: flex; flex-direction: column; margin-bottom: 10px; }
    .label { font-weight: bold; min-width: 90px; flex-shrink: 0; font-size: 16pt; }
    .val-name { font-size: 20pt; font-weight: bold; }
    .val-hn { font-family: monospace; font-size: 18pt; font-weight: bold; }
    .val-pttype { font-size: 15pt; }
    .val-address { font-size: 17pt; font-weight: 600; line-height: 1.5; margin-top: 4px; padding-left: 90px; }
    .val-phone { font-family: monospace; font-size: 20pt; font-weight: bold; letter-spacing: 1px; }
    .divider { border-bottom: 2px dashed #94a3b8; margin: 8px 0; }
  </style>
</head>
<body>
  <div class="print-box">
    <div class="field-row"><span class="label">ชื่อ:</span><span class="val-name">${patientName}</span></div>
    <div class="field-row"><span class="label">HN:</span><span class="val-hn">${hn}</span></div>
    <div class="divider"></div>
    <div class="field-row" style="align-items: flex-start;"><span class="label">สิทธิ์:</span><span class="val-pttype">${pttypeDisplay}</span></div>
    <div class="divider"></div>
    <div class="field-col"><span class="label">ที่อยู่จัดส่ง:</span><span class="val-address">${fullAddress}</span></div>
    <div class="divider"></div>
    <div class="field-row"><span class="label">เบอร์โทร:</span><span class="val-phone">${phone}</span></div>
  </div>
</body>
</html>`;
}

export default function TelemedPharmacyPage() {
  const [tab, setTab] = useState('today'); // 'today' | 'delivery' | 'history'
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState({ today_count: 0, delivery_count: 0, history_count: 0 });
  const [search, setSearch] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [syncingVnId, setSyncingVnId] = useState(null);

  // Detail Modal State
  const [detailModalItem, setDetailModalItem] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dispenseSubmitting, setDispenseSubmitting] = useState(false);

  // Delivery State
  const [deliverySubmitting, setDeliverySubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getTelemedPharmacy({
        tab,
        search,
        delivery_date: tab === 'history' ? deliveryDate : '',
      });
      setData(res.data || []);
      setSummary(res.summary || { today_count: 0, delivery_count: 0, history_count: 0 });
    } catch (err) {
      console.error('Error fetching telemed pharmacy data:', err);
      setToast({ type: 'error', message: err.message || 'ไม่สามารถโหลดข้อมูลห้องยาได้' });
    } finally {
      setLoading(false);
    }
  }, [tab, search, deliveryDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Sync VN
  const handleSyncVn = async (e, item) => {
    e.stopPropagation();
    setSyncingVnId(item.id);
    try {
      const res = await api.syncTelemedPharmacyVn(item.id);
      if (res.success) {
        setToast({ type: 'success', message: res.message });
        fetchData();
      } else {
        setToast({ type: 'info', message: res.message || 'ไม่พบ Visit ใน HOSxP' });
      }
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการซิงก์ VN' });
    } finally {
      setSyncingVnId(null);
    }
  };

  // Open Detail Modal
  const openDetailModal = async (item) => {
    setDetailModalItem(item);
    setDetailData(null);
    setDetailLoading(true);

    try {
      const res = await api.getTelemedPharmacyDetail(item.id);
      setDetailData(res.data);
    } catch (err) {
      console.error('Error fetching detail:', err);
      setToast({ type: 'error', message: err.message || 'ไม่สามารถดึงข้อมูลรายละเอียดเวชระเบียนได้' });
    } finally {
      setDetailLoading(false);
    }
  };

  // Dispense Action (FREE or PAID)
  const handleDispenseAction = async (payType) => {
    if (!detailModalItem) return;
    setDispenseSubmitting(true);
    try {
      const res = await api.dispenseTelemedPharmacy(detailModalItem.id, { payType });
      setToast({ type: 'success', message: res.message });
      setDetailModalItem(null);
      fetchData();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการบันทึกจัดยา' });
    } finally {
      setDispenseSubmitting(false);
    }
  };

  // Direct Delivery (บันทึกจัดส่งยาเสร็จสิ้นโดยตรง ไม่ต้องกรอกเลขพัสดุ)
  const handleDirectDelivery = async (item) => {
    if (!item) return;
    setDeliverySubmitting(true);
    try {
      const res = await api.deliveryTelemedPharmacy(item.id, {});
      setToast({ type: 'success', message: res.message || 'บันทึกการจัดส่งยาเรียบร้อยแล้ว' });
      setDetailModalItem(null);
      fetchData();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการบันทึกจัดส่ง' });
    } finally {
      setDeliverySubmitting(false);
    }
  };

  // Print Address A5
  const handlePrintAddress = (item) => {
    if (!item) return;
    const html = generateAddressHtml(item);

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
          if (iframe.parentNode) document.body.removeChild(iframe);
        }, 1000);
      }, 350);
    } catch {
      const printWin = window.open('', '_blank', 'width=700,height=900');
      if (printWin) {
        printWin.document.open();
        printWin.document.write(html);
        printWin.document.close();
        printWin.focus();
        setTimeout(() => printWin.print(), 400);
      }
    }
  };

  return (
    <>
      {/* Toast Notification */}
      {toast && (
        <div className={`toast-notification toast-${toast.type === 'error' ? 'danger' : toast.type === 'success' ? 'success' : 'info'}`}>
          <div className="toast-content">
            <span>{toast.message}</span>
            <button type="button" className="toast-close" onClick={() => setToast(null)}>✕</button>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h2 className="page-title">ห้องยา (Section Telemed)</h2>
            <p className="page-subtitle">
              ตรวจสอบข้อมูลยา ค่ารักษาพยาบาล จัดยา และบันทึกจัดส่งยาสำหรับผู้ป่วยที่คัดกรองแล้ว
            </p>
          </div>
        </div>
      </div>

      <div className="page-body prescreening-container">
        {/* Navigation Stage Chips (Tabs) */}
        <div className="rtm-stage-bar" style={{ fontFamily: "'Sarabun', sans-serif" }}>
          <button
            type="button"
            className={`rtm-stage-chip rtm-chip-pharmacist ${tab === 'today' ? 'active' : ''}`}
            style={{ fontFamily: "'Sarabun', sans-serif" }}
            onClick={() => setTab('today')}
          >
            <span className="rtm-chip-icon">💊</span>
            <span style={{ fontFamily: "'Sarabun', sans-serif" }}>รายการวันนี้</span>
            <span className="rtm-chip-count" style={{ fontFamily: "'Sarabun', sans-serif" }}>{summary.today_count || 0}</span>
          </button>

          <button
            type="button"
            className={`rtm-stage-chip rtm-chip-approved ${tab === 'delivery' ? 'active' : ''}`}
            style={{ fontFamily: "'Sarabun', sans-serif" }}
            onClick={() => setTab('delivery')}
          >
            <span className="rtm-chip-icon">📦</span>
            <span style={{ fontFamily: "'Sarabun', sans-serif" }}>รอจัดส่งยา</span>
            <span className="rtm-chip-count" style={{ fontFamily: "'Sarabun', sans-serif" }}>{summary.delivery_count || 0}</span>
          </button>

          <button
            type="button"
            className={`rtm-stage-chip rtm-chip-completed ${tab === 'history' ? 'active' : ''}`}
            style={{ fontFamily: "'Sarabun', sans-serif" }}
            onClick={() => setTab('history')}
          >
            <span className="rtm-chip-icon">📜</span>
            <span style={{ fontFamily: "'Sarabun', sans-serif" }}>ประวัติการจัดส่ง</span>
            <span className="rtm-chip-count" style={{ fontFamily: "'Sarabun', sans-serif" }}>{summary.history_count || 0}</span>
          </button>
        </div>

        {/* Main Table Card */}
        <div className="table-card rtm-card">
          {/* Toolbar */}
          <div className="table-toolbar rtm-toolbar">
            <div className="search-box rtm-search-wrap" style={{ maxWidth: '440px' }}>
              <svg className="search-icon rtm-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="search-input rtm-search-input"
                placeholder={
                  tab === 'today'
                    ? 'ค้นหา HN, ชื่อผู้ป่วย, VN, คลินิก...'
                    : tab === 'delivery'
                    ? 'ค้นหา HN, ชื่อผู้ป่วย, เบอร์โทร, ที่อยู่จัดส่ง...'
                    : 'ค้นหา HN, ชื่อผู้ป่วย, เลขพัสดุ, VN...'
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="search-clear-btn rtm-search-clear"
                  onClick={() => setSearch('')}
                  title="ล้างการค้นหา"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="rtm-actions-right">
              {tab === 'history' && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569' }}>
                    วันที่จัดส่ง:
                  </span>
                  <input
                    type="date"
                    className="prescreen-date-input"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                  />
                  {deliveryDate && (
                    <button
                      type="button"
                      className="btn btn-secondary rtm-btn-action"
                      onClick={() => setDeliveryDate('')}
                      title="ดูประวัติจัดส่งยาทั้งหมด"
                    >
                      ดูทั้งหมด
                    </button>
                  )}
                  {deliveryDate !== getTodayStr() && (
                    <button
                      type="button"
                      className="btn btn-secondary rtm-btn-action"
                      onClick={() => setDeliveryDate(getTodayStr())}
                      title="ดูเคสที่จัดส่งวันนี้"
                    >
                      วันนี้
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                className="btn btn-secondary rtm-btn-refresh"
                onClick={fetchData}
                disabled={loading}
                title="รีเฟรชข้อมูล"
              >
                <svg className={loading ? 'spin-icon' : ''} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                </svg>
                <span>รีเฟรช</span>
              </button>
            </div>
          </div>

          {/* Table Content */}
          <div className="data-table-wrapper rtm-table-container">
            <table className="data-table telemed-workflow-table rtm-table">
              <thead>
                <tr>
                  <th style={{ width: '45px', textAlign: 'center' }}>#</th>
                  <th style={{ width: '135px' }}>วันนัดหมาย/คัดกรอง</th>
                  <th style={{ width: '130px' }}>VN วันนี้</th>
                  <th style={{ width: '110px' }}>HN</th>
                  <th>ชื่อ-นามสกุล</th>
                  <th>คลินิก</th>
                  <th>แพทย์</th>
                  <th>สิทธิการรักษา</th>
                  {tab === 'delivery' ? (
                    <>
                      <th style={{ textAlign: 'center', width: '140px' }}>สถานะชำระเงิน</th>
                      <th>ที่อยู่จัดส่งยา</th>
                    </>
                  ) : tab === 'history' ? (
                    <>
                      <th style={{ textAlign: 'center', width: '150px' }}>วันที่จัดส่งยา</th>
                      <th style={{ textAlign: 'center', width: '160px' }}>เลขพัสดุ (Tracking)</th>
                      <th style={{ textAlign: 'center', width: '130px' }}>สถานะชำระเงิน</th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={tab === 'today' ? 8 : tab === 'delivery' ? 10 : 11} style={{ textAlign: 'center', padding: '48px 20px' }}>
                      <div className="loading-spinner-wrapper" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', color: 'var(--gray-600)' }}>
                        <svg className="spin-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        <span style={{ fontSize: '0.875rem' }}>กำลังโหลดข้อมูลห้องยา...</span>
                      </div>
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={tab === 'today' ? 8 : tab === 'delivery' ? 10 : 11} style={{ textAlign: 'center', padding: '56px 20px' }}>
                      <div className="empty-state-box">
                        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '6px' }}>
                          {tab === 'today'
                            ? 'ไม่มีรายการยาที่รอตรวจสอบ/จัดยา'
                            : tab === 'delivery'
                            ? 'ไม่มีรายการที่รอจัดส่งในขณะนี้'
                            : deliveryDate
                            ? `ไม่มีประวัติการจัดส่งยาในวันที่ ${formatThaiDate(deliveryDate)}`
                            : 'ไม่มีประวัติการจัดส่งยาในระบบ'}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--gray-500)' }}>
                          {tab === 'today'
                            ? 'เมื่อผู้ป่วยผ่านการคัดกรอง รายการจะปรากฏที่นี่เพื่อรอจัดยา'
                            : tab === 'delivery'
                            ? 'รายการที่ระบุ "ไม่ต้องชำระเงิน" หรือผ่านการชำระเงินแล้ว จะปรากฏในแท็บนี้'
                            : 'รายการที่ลงเลขพัสดุจัดส่งเรียบร้อยแล้วจะแสดงในแท็บประวัตินี้'}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.map((item, idx) => {
                    return (
                      <tr
                        key={item.id}
                        className="table-row-clickable"
                        onClick={() => openDetailModal(item)}
                        title="คลิกเพื่อดูรายละเอียดผู้ป่วย / ผลคัดกรอง / รายการยา"
                      >
                        {/* 1. Index */}
                        <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem', fontFamily: 'monospace' }}>
                          {idx + 1}
                        </td>

                        {/* 2. วันที่ */}
                        <td style={{ fontSize: '0.8125rem', color: '#334155', whiteSpace: 'nowrap' }}>
                          {formatThaiDate(item.vstdate || item.completed_at)}
                        </td>

                        {/* 3. VN */}
                        <td style={{ fontSize: '0.8125rem', color: '#0369a1', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                          {item.vn ? (
                            item.vn
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              style={{ fontSize: '0.72rem', padding: '2px 8px', fontWeight: 'normal' }}
                              onClick={(e) => handleSyncVn(e, item)}
                              disabled={syncingVnId === item.id}
                              title="ค้นหาและดึง VN จาก HOSxP"
                            >
                              {syncingVnId === item.id ? 'กำลังค้น...' : 'ซิงก์ VN'}
                            </button>
                          )}
                        </td>

                        {/* 4. HN */}
                        <td style={{ fontSize: '0.8125rem', color: '#1e293b', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                          {item.hn}
                        </td>

                        {/* 5. ชื่อ-นามสกุล */}
                        <td style={{ color: '#0f172a', whiteSpace: 'nowrap', fontSize: '0.875rem' }}>
                          {item.patient_name || '—'}
                        </td>

                        {/* 6. คลินิก */}
                        <td style={{ color: '#334155', fontSize: '0.8125rem' }}>
                          {item.clinic || 'คลินิก Telemed'}
                        </td>

                        {/* 7. แพทย์ */}
                        <td style={{ color: '#334155', fontSize: '0.8125rem' }}>
                          {formatDoctorName(item.doctor_name)}
                        </td>

                        {/* 8. สิทธิการรักษา */}
                        <td style={{ fontSize: '0.8125rem', color: '#475569' }}>
                          {item.pttype_name || '—'}
                        </td>

                        {/* Tab 2: Delivery */}
                        {tab === 'delivery' && (
                          <>
                            <td style={{ textAlign: 'center', fontSize: '0.8125rem' }}>
                              {item.pharmacy_pay_type === 'FREE' ? (
                                <span style={{ color: '#059669' }}>ไม่ต้องชำระเงิน</span>
                              ) : item.finance_status === 'PAID' ? (
                                <span style={{ color: '#2563eb' }}>ชำระเงินแล้ว</span>
                              ) : (
                                <span style={{ color: '#d97706' }}>รอการเงิน</span>
                              )}
                            </td>

                            <td style={{ fontSize: '0.8125rem', color: '#334155', maxWidth: '340px' }}>
                              <div>{item.address} {item.postal_code}</div>
                              {item.phone && (
                                <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '3px' }}>
                                  โทร: {formatPhone(item.phone)}
                                </div>
                              )}
                            </td>
                          </>
                        )}

                        {/* Tab 3: History */}
                        {tab === 'history' && (
                          <>
                            <td style={{ textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.8125rem', color: '#1e293b' }}>
                              <div>
                                {formatThaiDateTime(item.delivery_at || item.updated_at)}
                              </div>
                              {item.delivery_by && (
                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                                  โดย: {item.delivery_by}
                                </div>
                              )}
                            </td>

                            <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: '0.8125rem', color: '#0369a1' }}>
                              {item.tracking_number || <span style={{ color: '#94a3b8' }}>—</span>}
                            </td>

                            <td style={{ textAlign: 'center', fontSize: '0.8125rem' }}>
                              {item.pharmacy_pay_type === 'FREE' ? (
                                <span style={{ color: '#059669' }}>ไม่ต้องชำระเงิน</span>
                              ) : item.finance_status === 'PAID' ? (
                                <span style={{ color: '#2563eb' }}>ชำระเงินแล้ว</span>
                              ) : (
                                <span style={{ color: '#d97706' }}>รอชำระเงิน</span>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div style={{ padding: '14px 20px', borderTop: '1px solid #f1f5f9', fontSize: '0.8125rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              แสดงทั้งหมด {data.length} รายการ
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              คลิกที่แถวเพื่อดูรายละเอียดผลการคัดกรอง สัญญาณชีพ และรายการยาจาก HOSxP
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================
          Clinical Detail Modal (ห้องยาตรวจและจัดยา)
          ======================================================================== */}
      {detailModalItem && (
        <div className="visit-modal-backdrop rtm-modal-backdrop" onClick={() => setDetailModalItem(null)}>
          <div className="visit-modal-container rtm-modal-window" style={{ maxWidth: '1200px', maxHeight: '94vh' }} onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="visit-modal-header rtm-modal-header">
              <div className="visit-modal-title-row">
                <div className="visit-modal-title rtm-modal-title">
                  รายละเอียดผู้ป่วยและรายการยาห้องยา Telemed
                </div>
                {detailModalItem.vn && (
                  <span className="badge badge-primary font-mono" style={{ marginLeft: '10px' }}>
                    VN: {detailModalItem.vn}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="visit-modal-close-btn rtm-modal-close"
                onClick={() => setDetailModalItem(null)}
                aria-label="ปิด"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="visit-modal-body" style={{ maxHeight: 'calc(94vh - 130px)', overflowY: 'auto' }}>
              {/* Patient Banner */}
              <div className="patient-quick-banner rtm-patient-banner">
                <div className="patient-banner-left">
                  <div className="patient-banner-name-block">
                    <div className="patient-banner-name">{detailModalItem.patient_name}</div>
                    <div className="patient-banner-sub">
                      <span className="font-mono" style={{ fontWeight: 600, color: 'var(--primary-700)' }}>
                        HN: {detailModalItem.hn}
                      </span>
                      {(detailData?.visit_info?.pttype_name || detailData?.stat?.pttype_name || detailModalItem.pttype_name) && (
                        <span style={{ color: '#0369a1', fontWeight: 600 }}>
                          • สิทธิ: {detailData?.visit_info?.pttype_name || detailData?.stat?.pttype_name || detailModalItem.pttype_name}
                        </span>
                      )}
                      {(detailData?.stat?.phone || detailModalItem.phone) && (
                        <span>• โทร: {formatPhone(detailData?.stat?.phone || detailModalItem.phone)}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="patient-banner-right" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                  <span className="appt-date-badge">
                    <span>วันที่: {formatThaiDate(detailData?.visit_info?.vstdate || detailModalItem.vstdate || detailModalItem.completed_at)} ({detailData?.visit_info?.department || detailModalItem.clinic || 'คลินิก Telemed'})</span>
                  </span>
                  {(detailData?.visit_info?.doctor_name || detailModalItem.doctor_name) && (
                    <span style={{ fontSize: '0.8125rem', color: '#475569', fontWeight: 500 }}>
                      แพทย์: {formatDoctorName(detailData?.visit_info?.doctor_name || detailModalItem.doctor_name)}
                    </span>
                  )}
                </div>
              </div>

              {detailLoading ? (
                <div style={{ textAlign: 'center', padding: '50px 20px' }}>
                  <svg className="spin-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  <p style={{ marginTop: '10px', color: 'var(--gray-600)' }}>กำลังดึงข้อมูลเวชระเบียนและรายการยา...</p>
                </div>
              ) : (
                <div className="clinical-dashboard-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  {/* LEFT: ผลการตรวจรักษาและคัดกรอง (Clinical Screening & Examination) */}
                  <div className="clinical-col">
                    <div className="clinical-col-content">
                      {/* สัญญาณชีพ (Vital Signs) */}
                      <div className="clinical-card">
                        <div className="clinical-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>สัญญาณชีพ (Vital Signs)</span>
                          {detailData?.opdscreen?.bps ? (
                            <span style={{ fontSize: '0.72rem', color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                              HOSxP opdscreen
                            </span>
                          ) : detailData?.stat?.sbp ? (
                            <span style={{ fontSize: '0.72rem', color: '#0284c7', background: '#f0f9ff', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                              Pre-screening
                            </span>
                          ) : null}
                        </div>
                        <div className="clinical-card-body" style={{ padding: '12px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                            <div className="vital-stat-card">
                              <span className="v-label">BP (ความดัน)</span>
                              <div className="v-value-group">
                                <span className="v-value font-mono">
                                  {detailData?.opdscreen?.bps && detailData?.opdscreen?.bpd
                                    ? `${detailData.opdscreen.bps}/${detailData.opdscreen.bpd}`
                                    : detailData?.stat?.sbp && detailData?.stat?.dbp
                                    ? `${detailData.stat.sbp}/${detailData.stat.dbp}`
                                    : '—'}
                                </span>
                                <span className="v-unit">mmHg</span>
                              </div>
                            </div>

                            <div className="vital-stat-card">
                              <span className="v-label">Pulse (ชีพจร)</span>
                              <div className="v-value-group">
                                <span className="v-value font-mono">
                                  {detailData?.opdscreen?.pulse || detailData?.stat?.pulse || '—'}
                                </span>
                                <span className="v-unit">bpm</span>
                              </div>
                            </div>

                            <div className="vital-stat-card">
                              <span className="v-label">Temp (อุณหภูมิ)</span>
                              <div className="v-value-group">
                                <span className="v-value font-mono">
                                  {detailData?.opdscreen?.temperature || detailData?.stat?.temperature || '—'}
                                </span>
                                <span className="v-unit">°C</span>
                              </div>
                            </div>

                            <div className="vital-stat-card">
                              <span className="v-label">RR (การหายใจ)</span>
                              <div className="v-value-group">
                                <span className="v-value font-mono">
                                  {detailData?.opdscreen?.rr || detailData?.stat?.rr || '—'}
                                </span>
                                <span className="v-unit">/m</span>
                              </div>
                            </div>

                            <div className="vital-stat-card">
                              <span className="v-label">น้ำหนัก</span>
                              <div className="v-value-group">
                                <span className="v-value font-mono">
                                  {detailData?.opdscreen?.bw || detailData?.stat?.weight || '—'}
                                </span>
                                <span className="v-unit">kg</span>
                              </div>
                            </div>

                            <div className="vital-stat-card">
                              <span className="v-label">ส่วนสูง</span>
                              <div className="v-value-group">
                                <span className="v-value font-mono">
                                  {detailData?.opdscreen?.height || detailData?.stat?.height || '—'}
                                </span>
                                <span className="v-unit">cm</span>
                              </div>
                            </div>

                            <div className="vital-stat-card">
                              <span className="v-label">BMI</span>
                              <div className="v-value-group">
                                <span className="v-value font-mono">
                                  {detailData?.opdscreen?.bmi || '—'}
                                </span>
                                <span className="v-unit">kg/m²</span>
                              </div>
                            </div>

                            <div className="vital-stat-card">
                              <span className="v-label">SpO2 (ออกซิเจน)</span>
                              <div className="v-value-group">
                                <span className="v-value font-mono">
                                  {detailData?.stat?.spo2 || '—'}
                                </span>
                                <span className="v-unit">%</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* การวินิจฉัยโรค (Diagnoses) */}
                      {((detailData?.diagnoses && detailData.diagnoses.length > 0) || detailData?.vn_stat?.pdx) && (
                        <div className="clinical-card" style={{ marginTop: '12px' }}>
                          <div className="clinical-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>การวินิจฉัยโรค (Diagnoses - ICD10)</span>
                            {detailData?.vn_stat?.pdx && (
                              <span className="badge badge-primary font-mono">
                                PDX: {detailData.vn_stat.pdx}
                              </span>
                            )}
                          </div>
                          <div className="clinical-card-body" style={{ padding: '10px 12px' }}>
                            {detailData?.diagnoses && detailData.diagnoses.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {detailData.diagnoses.map((diag, dIdx) => (
                                  <div
                                    key={dIdx}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      gap: '8px',
                                      padding: '4px 0',
                                      borderBottom: dIdx < detailData.diagnoses.length - 1 ? '1px dashed #e2e8f0' : 'none',
                                      fontSize: '0.8125rem',
                                    }}
                                  >
                                    <div style={{ fontWeight: 600, color: '#0f172a' }}>
                                      <span className="font-mono" style={{ color: '#2563eb', marginRight: '6px', fontWeight: 700 }}>
                                        [{diag.icd10}]
                                      </span>
                                      <span>{diag.icd10_name || diag.icd10_tname || '—'}</span>
                                    </div>
                                    <span
                                      style={{
                                        fontSize: '0.7rem',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontWeight: 600,
                                        background: diag.diagtype === '1' ? '#2563eb' : '#94a3b8',
                                        color: '#ffffff',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {diag.diagtype === '1' ? 'Principal Dx' : `Type ${diag.diagtype}`}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div style={{ fontSize: '0.8125rem', color: '#1e293b' }}>
                                วินิจฉัยหลัก: <strong className="font-mono">{detailData.vn_stat.pdx}</strong>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* บันทึกอาการและการตรวจรักษา */}
                      <div className="clinical-card" style={{ marginTop: '12px' }}>
                        <div className="clinical-card-header">
                          <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>บันทึกอาการและการตรวจรักษา</span>
                        </div>
                        <div className="clinical-card-body" style={{ padding: '12px', fontSize: '0.875rem' }}>
                          <div style={{ marginBottom: '10px' }}>
                            <div style={{ fontWeight: 600, color: '#475569', marginBottom: '3px', fontSize: '0.8125rem' }}>อาการสำคัญ (Chief Complaint):</div>
                            <div style={{ color: '#0f172a', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                              {detailData?.opdscreen?.cc || detailData?.stat?.chief_complaint || '—'}
                            </div>
                          </div>

                          {detailData?.opdscreen?.pe && (
                            <div style={{ marginBottom: '10px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                              <div style={{ fontWeight: 600, color: '#475569', marginBottom: '3px', fontSize: '0.8125rem' }}>การตรวจร่างกาย (Physical Exam):</div>
                              <div style={{ color: '#0f172a', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                                {detailData.opdscreen.pe}
                              </div>
                            </div>
                          )}

                          {detailData?.opdscreen?.pmh && (
                            <div style={{ marginBottom: '10px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                              <div style={{ fontWeight: 600, color: '#475569', marginBottom: '3px', fontSize: '0.8125rem' }}>ประวัติการเจ็บป่วยเดิม / โรคประจำตัว (PMH):</div>
                              <div style={{ color: '#0f172a', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                                {detailData.opdscreen.pmh}
                              </div>
                            </div>
                          )}

                          {detailData?.stat?.current_medications && (
                            <div style={{ marginBottom: '10px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                              <div style={{ fontWeight: 600, color: '#475569', marginBottom: '3px', fontSize: '0.8125rem' }}>ยาที่รับประทานอยู่เดิม (ผู้ป่วยระบุ):</div>
                              <div style={{ color: '#0f172a', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                                {detailData.stat.current_medications}
                              </div>
                            </div>
                          )}

                          {detailData?.stat?.additional_notes && (
                            <div style={{ paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                              <div style={{ fontWeight: 600, color: '#475569', marginBottom: '3px', fontSize: '0.8125rem' }}>หมายเหตุเพิ่มเติม:</div>
                              <div style={{ color: '#0f172a', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                                {detailData.stat.additional_notes}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ที่อยู่สำหรับจัดส่ง */}
                      <div className="clinical-card" style={{ marginTop: '12px' }}>
                        <div className="clinical-card-header">
                          <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>ที่อยู่จัดส่งยาทางไปรษณีย์</span>
                        </div>
                        <div className="clinical-card-body" style={{ padding: '12px', fontSize: '0.875rem', lineHeight: '1.6' }}>
                          <div style={{ fontWeight: 600 }}>{detailModalItem.patient_name}</div>
                          <div>{detailData?.stat?.address || detailModalItem.address || '—'} {detailData?.stat?.postal_code || detailModalItem.postal_code || ''}</div>
                          <div style={{ color: '#64748b' }}>โทร: {formatPhone(detailData?.stat?.phone || detailModalItem.phone)}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT: รายการยาและค่ารักษา (HOSxP Prescriptions & Billing) */}
                  <div className="clinical-col">
                    <div className="clinical-col-content">
                      {/* รายการยา */}
                      <div className="clinical-card">
                        <div className="clinical-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>
                            รายการยาที่สั่งจ่าย ({detailData?.drugs?.length || 0} รายการ)
                          </span>
                        </div>
                        <div className="clinical-card-body" style={{ padding: '8px' }}>
                          {detailData?.drugs && detailData.drugs.length > 0 ? (
                            <table className="drug-items-table" style={{ width: '100%', fontSize: '0.8125rem' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                                  <th style={{ width: '30px', textAlign: 'center' }}>#</th>
                                  <th style={{ textAlign: 'left' }}>ชื่อยา / ความแรง</th>
                                  <th style={{ width: '60px', textAlign: 'center' }}>จำนวน</th>
                                  <th style={{ width: '80px', textAlign: 'right' }}>ราคา (บาท)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detailData.drugs.map((drug, dIdx) => (
                                  <tr key={drug.hos_guid || dIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ textAlign: 'center', color: '#94a3b8' }}>{dIdx + 1}</td>
                                    <td style={{ padding: '6px 4px' }}>
                                      <div style={{ fontWeight: 600, color: '#0f172a' }}>
                                        {drug.drug_name} {drug.strength ? `(${drug.strength})` : ''}
                                      </div>
                                      <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '2px' }}>
                                        {[drug.usage_line1, drug.usage_line2, drug.usage_line3, drug.sp_usage_line1, drug.sp_usage_line2].filter(Boolean).join(' ') || '—'}
                                      </div>
                                    </td>
                                    <td style={{ textAlign: 'center', fontWeight: 600 }}>
                                      {drug.qty} {drug.units || 'หน่วย'}
                                    </td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                      {formatMoney(drug.sum_price)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                              {detailModalItem.vn ? 'ไม่พบรายการยาใน Visit นี้' : 'ยังไม่มีการเปิด Visit หรือยังไม่มีการสั่งยาใน HOSxP'}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* รายการเวชภัณฑ์มิใช่ยา / ค่าบริการ (Non-drug Items) */}
                      {detailData?.nondrugitems && detailData.nondrugitems.length > 0 && (
                        <div className="clinical-card" style={{ marginTop: '12px' }}>
                          <div className="clinical-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>
                              รายการเวชภัณฑ์มิใช่ยา / ค่าบริการ ({detailData.nondrugitems.length} รายการ)
                            </span>
                          </div>
                          <div className="clinical-card-body" style={{ padding: '8px' }}>
                            <table className="drug-items-table" style={{ width: '100%', fontSize: '0.8125rem' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                                  <th style={{ width: '30px', textAlign: 'center' }}>#</th>
                                  <th style={{ textAlign: 'left' }}>รายการ</th>
                                  <th style={{ width: '60px', textAlign: 'center' }}>จำนวน</th>
                                  <th style={{ width: '80px', textAlign: 'right' }}>ราคา (บาท)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detailData.nondrugitems.map((nd, ndIdx) => (
                                  <tr key={nd.hos_guid || ndIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ textAlign: 'center', color: '#94a3b8' }}>{ndIdx + 1}</td>
                                    <td style={{ padding: '6px 4px' }}>
                                      <div style={{ fontWeight: 600, color: '#0f172a' }}>
                                        {nd.item_name}
                                      </div>
                                    </td>
                                    <td style={{ textAlign: 'center', fontWeight: 600 }}>
                                      {nd.qty} {nd.unit || ''}
                                    </td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                      {formatMoney(nd.sum_price)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* สรุปค่าใช้จ่าย */}
                      <div className="clinical-card" style={{ marginTop: '12px' }}>
                        <div className="clinical-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>สรุปค่ารักษาพยาบาล</span>
                          {(detailData?.visit_info?.pttype_name || detailData?.stat?.pttype_name || detailModalItem.pttype_name) && (
                            <span style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: 600 }}>
                              สิทธิ: {detailData?.visit_info?.pttype_name || detailData?.stat?.pttype_name || detailModalItem.pttype_name}
                            </span>
                          )}
                        </div>
                        <div className="clinical-card-body" style={{ padding: '12px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', textAlign: 'center' }}>
                            <div style={{ padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>ยอดรวม</div>
                              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
                                {formatMoney(detailData?.vn_stat?.item_money ?? detailModalItem.item_money)} ฿
                              </div>
                            </div>
                            <div style={{ padding: '10px', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                              <div style={{ fontSize: '0.75rem', color: '#065f46' }}>เบิกได้</div>
                              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#059669', marginTop: '4px' }}>
                                {formatMoney(detailData?.vn_stat?.uc_money ?? detailModalItem.uc_money)} ฿
                              </div>
                            </div>
                            <div style={{ padding: '10px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
                              <div style={{ fontSize: '0.75rem', color: '#991b1b' }}>ยอดชำระ</div>
                              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#dc2626', marginTop: '4px' }}>
                                {formatMoney(detailData?.vn_stat?.paid_money ?? detailModalItem.paid_money)} ฿
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ข้อมูลสถานะจัดส่ง */}
                      {detailModalItem.tracking_number && (
                        <div className="clinical-card" style={{ marginTop: '12px' }}>
                          <div className="clinical-card-header">
                            <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>ข้อมูลการจัดส่งพัสดุ</span>
                          </div>
                          <div className="clinical-card-body" style={{ padding: '12px', fontSize: '0.875rem' }}>
                            <div>เลขพัสดุ: <strong className="font-mono" style={{ color: '#0369a1' }}>{detailModalItem.tracking_number}</strong></div>
                            <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px' }}>
                              จัดส่งเมื่อ: {formatThaiDateTime(detailModalItem.delivery_at)} โดย: {detailModalItem.delivery_by || '—'}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="visit-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary rtm-btn-action"
                onClick={() => setDetailModalItem(null)}
              >
                ปิดหน้าต่าง
              </button>

              {tab === 'today' ? (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-success rtm-btn-action btn-pay"
                    style={{ background: '#059669', borderColor: '#047857' }}
                    onClick={() => handleDispenseAction('FREE')}
                    disabled={dispenseSubmitting}
                  >
                    {dispenseSubmitting ? 'กำลังบันทึก...' : 'ไม่ต้องชำระเงิน'}
                  </button>

                  <button
                    type="button"
                    className="btn btn-primary rtm-btn-action"
                    style={{ background: '#ea580c', borderColor: '#c2410c' }}
                    onClick={() => handleDispenseAction('PAID')}
                    disabled={dispenseSubmitting}
                  >
                    {dispenseSubmitting ? 'กำลังบันทึก...' : 'ต้องชำระเงิน'}
                  </button>
                </div>
              ) : tab === 'delivery' ? (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary rtm-btn-action"
                    style={{ fontFamily: "'Sarabun', sans-serif" }}
                    onClick={() => handlePrintAddress(detailModalItem)}
                    title="พิมพ์ใบปะหน้าชื่อ ที่อยู่ (A5)"
                  >
                    พิมพ์ที่อยู่ (A5)
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary rtm-btn-action"
                    style={{ fontFamily: "'Sarabun', sans-serif" }}
                    onClick={() => handleDirectDelivery(detailModalItem)}
                    disabled={deliverySubmitting}
                  >
                    {deliverySubmitting ? 'กำลังบันทึก...' : 'บันทึกจัดส่งยา'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary rtm-btn-action"
                    style={{ fontFamily: "'Sarabun', sans-serif" }}
                    onClick={() => handlePrintAddress(detailModalItem)}
                    title="พิมพ์ใบปะหน้าชื่อ ที่อยู่ (A5)"
                  >
                    พิมพ์ที่อยู่ (A5)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

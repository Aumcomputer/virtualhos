import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import './PrescreeningPage.css';
import './RequestTelemedPage.css';
import './TelemedToday.css';

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

function parseLines(text) {
  if (!text) return [];
  return String(text)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function generateAddressHtml(item, pttype = '') {
  const patientName = item?.patient_name || '—';
  const hn = item?.hn || '—';
  const pttypeDisplay = pttype || item?.pttype_name || '—';
  const fullAddress = `${item?.address || ''} ${item?.postcode || ''}`.trim() || '—';
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

export default function TelemedTodayPharmacyPage() {
  const [tab, setTab] = useState('today'); // 'today' | 'delivery'
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState({ today_count: 0, delivery_count: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Detail Modal State (Dual visit comparison: Previous vs Today)
  const [detailModalItem, setDetailModalItem] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dispenseSubmitting, setDispenseSubmitting] = useState(false);

  // Delivery Modal State
  const [deliveryModalItem, setDeliveryModalItem] = useState(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [deliverySubmitting, setDeliverySubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getTelemedTodayPharmacy({ tab, search });
      setData(res.data || []);
      setSummary(res.summary || { today_count: 0, delivery_count: 0 });
    } catch (err) {
      console.error('Error fetching pharmacy data:', err);
      setToast({ type: 'error', message: err.message || 'ไม่สามารถโหลดข้อมูลห้องยาได้' });
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Open Dual-Visit Clinical Detail Modal
  const openDetailModal = async (item) => {
    setDetailModalItem(item);
    setDetailData(null);
    setDetailLoading(true);

    try {
      const res = await api.getTelemedTodayDetail(item.id);
      setDetailData(res);
    } catch (err) {
      console.error('Error fetching detail:', err);
      setToast({ type: 'error', message: err.message || 'ไม่สามารถดึงข้อมูลรายละเอียดเวชระเบียนได้' });
    } finally {
      setDetailLoading(false);
    }
  };

  // Handle Pharmacy Dispense action: "ต้องชำระเงิน" (PAID) or "ไม่ต้องชำระเงิน" (FREE)
  const handleDispenseAction = async (payType) => {
    if (!detailModalItem) return;
    setDispenseSubmitting(true);
    try {
      const res = await api.pharmacyDispenseTelemedToday(detailModalItem.id, { payType });
      setToast({ type: 'success', message: res.message });
      setDetailModalItem(null);
      fetchData();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการบันทึก' });
    } finally {
      setDispenseSubmitting(false);
    }
  };

  // Open delivery modal
  const openDeliveryModal = (item) => {
    setDeliveryModalItem(item);
    setTrackingNumber(item.tracking_number || '');
  };

  const handleConfirmDelivery = async (e) => {
    e.preventDefault();
    if (!deliveryModalItem) return;
    const cleanTracking = trackingNumber.trim();
    if (!cleanTracking) {
      setToast({ type: 'error', message: 'กรุณากรอกเลขพัสดุจัดส่ง' });
      return;
    }

    setDeliverySubmitting(true);
    try {
      const res = await api.deliveryTelemedToday(deliveryModalItem.id, { tracking_number: cleanTracking });
      setToast({ type: 'success', message: res.message });
      setDeliveryModalItem(null);
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
    const html = generateAddressHtml(item, item.pttype_name);

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
    } catch (err) {
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
      {/* Toast */}
      {toast && (
        <div className={`toast-notification toast-${toast.type === 'error' ? 'danger' : toast.type === 'success' ? 'success' : 'info'}`}>
          <div className="toast-content">
            <span>{toast.message}</span>
            <button type="button" className="toast-close" onClick={() => setToast(null)}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h2 className="page-title">ห้องยา (Pharmacy Telemed)</h2>
            <p className="page-subtitle">
              ตรวจสอบข้อมูลยา ค่ารักษาพยาบาล จัดยา และเลือกสถานะการชำระเงินสำหรับผู้ป่วยรับยาไม่พบแพทย์
            </p>
          </div>
        </div>
      </div>

      <div className="page-body prescreening-container">
        {/* Navigation Stage Chips (Tabs) */}
        <div className="rtm-stage-bar">
          <button
            type="button"
            className={`rtm-stage-chip rtm-chip-pharmacist ${tab === 'today' ? 'active' : ''}`}
            onClick={() => setTab('today')}
          >
            <span className="rtm-chip-icon">💊</span>
            <span>รายการวันนี้ (รอตรวจ/จัดยา)</span>
            <span className="rtm-chip-count">{summary.today_count || 0}</span>
          </button>

          <button
            type="button"
            className={`rtm-stage-chip rtm-chip-approved ${tab === 'delivery' ? 'active' : ''}`}
            onClick={() => setTab('delivery')}
          >
            <span className="rtm-chip-icon">📦</span>
            <span>รอจัดส่งยา</span>
            <span className="rtm-chip-count">{summary.delivery_count || 0}</span>
          </button>
        </div>

        {/* Stats Row */}
        <div className="prescreen-stats-grid">
          <div className="prescreen-stat-card">
            <div className="prescreen-stat-icon total">📋</div>
            <div className="prescreen-stat-content">
              <span className="prescreen-stat-label">เคสห้องยาทั้งหมดวันนี้</span>
              <span className="prescreen-stat-val" style={{ color: '#2563eb' }}>
                {(summary.today_count || 0) + (summary.delivery_count || 0)}
              </span>
            </div>
          </div>
          <div className="prescreen-stat-card">
            <div className="prescreen-stat-icon dispense">💊</div>
            <div className="prescreen-stat-content">
              <span className="prescreen-stat-label">รอตรวจและจัดยา</span>
              <span className="prescreen-stat-val" style={{ color: '#7c3aed' }}>
                {summary.today_count || 0}
              </span>
            </div>
          </div>
          <div className="prescreen-stat-card">
            <div className="prescreen-stat-icon delivery">🚚</div>
            <div className="prescreen-stat-content">
              <span className="prescreen-stat-label">พร้อม / รอจัดส่งยา</span>
              <span className="prescreen-stat-val" style={{ color: '#059669' }}>
                {summary.delivery_count || 0}
              </span>
            </div>
          </div>
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
                placeholder={tab === 'today' ? 'ค้นหา HN, ชื่อผู้ป่วย, VN วันนี้, คลินิก...' : 'ค้นหา HN, ชื่อผู้ป่วย, เบอร์โทร, ที่อยู่จัดส่ง...'}
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
                  <th style={{ width: '120px' }}>VN วันนี้</th>
                  <th style={{ width: '110px' }}>HN</th>
                  <th>ชื่อ-นามสกุล</th>
                  <th>คลินิก / แพทย์</th>
                  <th>สิทธิการรักษา</th>
                  {tab === 'today' ? (
                    <>
                      <th style={{ textAlign: 'right' }}>ยอดรวม (บาท)</th>
                      <th style={{ textAlign: 'right' }}>เบิกได้ (บาท)</th>
                      <th style={{ textAlign: 'right', color: '#b91c1c' }}>ต้องชำระ (บาท)</th>
                      <th style={{ textAlign: 'center', width: '140px' }}>การจัดการ</th>
                    </>
                  ) : (
                    <>
                      <th style={{ textAlign: 'center', width: '140px' }}>สถานะการชำระเงิน</th>
                      <th>ที่อยู่จัดส่งยา</th>
                      <th style={{ textAlign: 'center', width: '190px' }}>การจัดส่ง</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={tab === 'today' ? 10 : 8} style={{ textAlign: 'center', padding: '48px 20px' }}>
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
                    <td colSpan={tab === 'today' ? 10 : 8} style={{ textAlign: 'center', padding: '56px 20px' }}>
                      <div className="empty-state-box">
                        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '6px' }}>
                          {tab === 'today' ? 'ไม่มีรายการยาที่รอตรวจสอบ/จัดยาในวันนี้' : 'ไม่มีรายการที่รอจัดส่งในขณะนี้'}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--gray-500)' }}>
                          {tab === 'today'
                            ? 'เมื่อเวชระเบียนเปิด Visit และแพทย์สั่งยา รายการจะแสดงเพื่อรอเภสัชตรวจสอบ'
                            : 'รายการที่ระบุ "ไม่ต้องชำระเงิน" หรือผ่าน "การเงินชำระแล้ว" จะปรากฏในแท็บนี้'}
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
                        title="คลิกเพื่อดูรายละเอียดผู้ป่วย (Popup)"
                      >
                        {/* 1. Index */}
                        <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem', fontFamily: 'monospace' }}>
                          {idx + 1}
                        </td>

                        {/* 2. VN */}
                        <td>
                          {item.vn_today ? (
                            <span className="tt-vn-tag">
                              {item.vn_today}
                            </span>
                          ) : (
                            <span className="prescreen-badge-status pending" style={{ fontSize: '0.6875rem' }}>
                              รอเปิด Visit
                            </span>
                          )}
                        </td>

                        {/* 3. HN */}
                        <td>
                          <span className="rtm-hn-pill font-mono">{item.hn}</span>
                        </td>

                        {/* 4. Patient Name */}
                        <td style={{ fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>
                          {item.patient_name || '—'}
                        </td>

                        {/* 5. Clinic & Doctor */}
                        <td>
                          <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.8125rem' }}>{item.clinic_name || '—'}</div>
                          <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>🩺</span>
                            <span>{formatDoctorName(item.doctor_name)}</span>
                          </div>
                        </td>

                        {/* 6. Entitlement */}
                        <td style={{ fontSize: '0.8125rem', color: '#475569' }}>
                          {item.pttype_name || '—'}
                        </td>

                        {/* Tab 1: Today items columns */}
                        {tab === 'today' && (
                          <>
                            <td style={{ textAlign: 'right' }}>
                              <span className="tt-money tt-money-total">
                                {item.item_money !== undefined ? formatMoney(item.item_money) : '—'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span className="tt-money tt-money-uc">
                                {item.uc_money !== undefined ? formatMoney(item.uc_money) : '—'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {item.paid_money !== undefined ? (
                                Number(item.paid_money) > 0 ? (
                                  <span className="tt-money tt-money-paid-active">{formatMoney(item.paid_money)}</span>
                                ) : (
                                  <span className="tt-money tt-money-paid-zero">{formatMoney(item.paid_money)}</span>
                                )
                              ) : (
                                '—'
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="btn btn-primary rtm-btn-action"
                                onClick={() => openDetailModal(item)}
                              >
                                🩺 ตรวจ / จัดยา
                              </button>
                            </td>
                          </>
                        )}

                        {/* Tab 2: Delivery items columns */}
                        {tab === 'delivery' && (
                          <>
                            <td style={{ textAlign: 'center' }}>
                              {item.pharmacy_pay_type === 'FREE' ? (
                                <span className="pay-pill-free">✓ ไม่ต้องชำระเงิน</span>
                              ) : item.finance_status === 'PAID' ? (
                                <span className="pay-pill-paid">✓ ชำระเงินแล้ว</span>
                              ) : (
                                <span className="pay-pill-pending">⏳ รอการเงิน</span>
                              )}
                            </td>

                            <td style={{ fontSize: '0.8125rem', color: '#334155', maxWidth: '320px' }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                                <span style={{ flexShrink: 0 }}>📍</span>
                                <span>{item.address} {item.postcode}</span>
                              </div>
                              {item.phone && (
                                <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '3px', marginLeft: '18px' }}>
                                  📞 โทร: {formatPhone(item.phone)}
                                </div>
                              )}
                            </td>

                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'inline-flex', gap: '6px' }}>
                                <button
                                  type="button"
                                  className="btn btn-secondary rtm-btn-action"
                                  onClick={() => handlePrintAddress(item)}
                                  title="พิมพ์ใบปะหน้าชื่อ ที่อยู่ (A5)"
                                >
                                  🖨️ พิมพ์ที่อยู่
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-primary rtm-btn-action"
                                  onClick={() => openDeliveryModal(item)}
                                >
                                  🚚 จัดส่งยา
                                </button>
                              </div>
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
              แสดงทั้งหมด <strong style={{ color: '#0f172a' }}>{data.length}</strong> รายการ
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              {tab === 'today' ? '💡 คลิกที่แถวหรือปุ่ม "ตรวจ / จัดยา" เพื่อเปิดหน้าต่างเปรียบเทียบประวัติและดำเนินการ' : '💡 พิมพ์ใบปะหน้าซองยาขนาด A5 และบันทึกหมายเลขพัสดุเมื่อจัดส่งยา'}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================
          Dual-Visit Clinical Detail Modal (ห้องยาตรวจและจัดยา)
          Left: Visit เก่า | Right: Visit ปัจจุบัน + ราคายา + ยื่นความจำนง
          ======================================================================== */}
      {detailModalItem && (
        <div className="visit-modal-overlay" onClick={() => setDetailModalItem(null)}>
          <div className="visit-modal-card" style={{ maxWidth: '1200px' }} onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="visit-modal-header">
              <div className="visit-modal-title">
                <span>รายละเอียดการจัดยาผู้ป่วยรับยาไม่พบแพทย์</span>
                {detailData?.currentVn && (
                  <span className="font-mono" style={{ fontSize: '0.8125rem', color: '#0369a1', marginLeft: '10px' }}>
                    VN วันนี้: {detailData.currentVn}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="visit-modal-close"
                onClick={() => setDetailModalItem(null)}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="visit-modal-body">
              {/* Quick Patient Banner */}
              <div className="patient-quick-banner rtm-patient-banner">
                <div className="patient-banner-left">
                  <div className="patient-banner-name-block">
                    <div className="patient-banner-name">{detailModalItem.patient_name}</div>
                    <div className="patient-banner-sub">
                      <span className="font-mono" style={{ fontWeight: 600, color: 'var(--primary-700)' }}>
                        HN: {detailModalItem.hn}
                      </span>
                      {detailData?.currentVisit?.age_y !== undefined && (
                        <span>• อายุ {detailData.currentVisit.age_y} ปี {detailData.currentVisit.age_m || 0} เดือน</span>
                      )}
                      {(detailData?.vnStat?.pttype_name || detailModalItem.pttype_name) && (
                        <span style={{ color: '#0369a1', fontWeight: 600 }}>
                          • สิทธิ: {detailData?.vnStat?.pttype_name || detailModalItem.pttype_name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="patient-banner-right">
                  <span className="appt-date-badge">
                    <span>นัดรับบริการวันนี้: {formatThaiDate(detailModalItem.nextdate)} ({detailModalItem.clinic_name || 'ไม่ระบุคลินิก'})</span>
                  </span>
                </div>
              </div>

              {detailLoading ? (
                <div style={{ textAlign: 'center', padding: '50px 20px' }}>
                  <svg className="spin-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  <p style={{ marginTop: '10px', color: 'var(--gray-600)' }}>กำลังดึงข้อมูลเวชระเบียนเปรียบเทียบจาก HOSxP...</p>
                </div>
              ) : (
                <div className="clinical-dashboard-grid">
                  {/* LEFT COLUMN: ประวัติ Visit เก่า (Previous Visit) */}
                  <div className="clinical-col left-col">
                    <div className="column-header left-col-header">
                      <div className="column-header-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                        <span>ประวัติการตรวจครั้งก่อน (Previous Visit)</span>
                      </div>
                      {detailData?.previousVisit?.vstdate && (
                        <span className="visit-date-tag">
                          ตรวจเมื่อ: {formatThaiDate(detailData.previousVisit.vstdate)}
                        </span>
                      )}
                    </div>

                    <div className="clinical-col-content">
                      {/* Vitals เก่า */}
                      <div className="clinical-card">
                        <div className="clinical-card-header">
                          <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>สัญญาณชีพ (Vital Signs) ครั้งก่อน</span>
                        </div>
                        <div className="clinical-card-body" style={{ padding: '10px' }}>
                          {detailData?.previousVisit ? (
                            <div className="vitals-matrix-clean">
                              <div className="vital-item">
                                <span className="vital-label">BP</span>
                                <span className="vital-val font-mono">{detailData.previousVisit.bps || '—'}/{detailData.previousVisit.bpd || '—'}</span>
                              </div>
                              <div className="vital-item">
                                <span className="vital-label">Pulse</span>
                                <span className="vital-val font-mono">{detailData.previousVisit.pulse || '—'}</span>
                              </div>
                              <div className="vital-item">
                                <span className="vital-label">Temp</span>
                                <span className="vital-val font-mono">{detailData.previousVisit.temperature || '—'}°C</span>
                              </div>
                              <div className="vital-item">
                                <span className="vital-label">BW</span>
                                <span className="vital-val font-mono">{detailData.previousVisit.bw || '—'} kg</span>
                              </div>
                            </div>
                          ) : (
                            <div style={{ color: 'var(--gray-400)', fontStyle: 'italic', fontSize: '0.75rem' }}>— ไม่มีข้อมูล —</div>
                          )}
                        </div>
                      </div>

                      {/* การวินิจฉัยโรคเก่า */}
                      <div className="clinical-card">
                        <div className="clinical-card-header">
                          <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>การวินิจฉัยโรคครั้งก่อน (Diagnoses)</span>
                        </div>
                        <div className="clinical-card-body" style={{ padding: '8px 12px' }}>
                          {detailData?.previousVisit?.diagnosis_concat ? (
                            <div className="diag-list">
                              {parseLines(detailData.previousVisit.diagnosis_concat).map((line, dIdx) => (
                                <div key={dIdx} className="diag-item">
                                  <span>{line.replace('(PDX)', '').trim()}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ color: 'var(--gray-400)', fontStyle: 'italic', fontSize: '0.8125rem' }}>— ไม่พบข้อมูลการวินิจฉัยครั้งก่อน —</div>
                          )}
                        </div>
                      </div>

                      {/* รายการยาเดิมครั้งก่อน */}
                      <div className="clinical-card">
                        <div className="clinical-card-header">
                          <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>รายการยาเดิมที่ได้รับครั้งก่อน</span>
                        </div>
                        <div className="clinical-card-body" style={{ padding: '4px 8px' }}>
                          {detailData?.previousVisit?.drug_concat ? (
                            <table className="meds-compact-table">
                              <tbody>
                                {parseLines(detailData.previousVisit.drug_concat).map((medLine, mIdx) => {
                                  const parts = medLine.split('#');
                                  return (
                                    <tr key={mIdx}>
                                      <td className="med-col-num">#{mIdx + 1}</td>
                                      <td className="med-col-name">{parts[0]?.trim() || medLine}</td>
                                      <td className="med-col-qty">{parts[1]?.trim() ? `${parts[1].trim()} เม็ด` : ''}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          ) : (
                            <div style={{ color: 'var(--gray-400)', fontStyle: 'italic', fontSize: '0.8125rem', padding: '6px' }}>— ไม่พบรายการยาครั้งก่อน —</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: ประวัติ Visit ปัจจุบัน + ราคายา + ยื่นความจำนง */}
                  <div className="clinical-col right-col">
                    <div className="column-header right-col-header" style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
                      <div className="column-header-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                        </svg>
                        <span>ข้อมูล Visit ปัจจุบัน (วันนี้) & ราคายา</span>
                      </div>
                    </div>

                    <div className="clinical-col-content">
                      {/* กล่องราคายา vn_stat */}
                      <div className="finance-price-box">
                        <div className="finance-price-card fp-total">
                          <span className="fp-label">ยอดรวม (item_money)</span>
                          <span className="fp-amount">{formatMoney(detailData?.vnStat?.item_money)} ฿</span>
                        </div>
                        <div className="finance-price-card fp-uc">
                          <span className="fp-label">เบิกได้ (uc_money)</span>
                          <span className="fp-amount">{formatMoney(detailData?.vnStat?.uc_money)} ฿</span>
                        </div>
                        <div className="finance-price-card fp-paid">
                          <span className="fp-label">ต้องชำระ (paid_money)</span>
                          <span className="fp-amount">{formatMoney(detailData?.vnStat?.paid_money)} ฿</span>
                        </div>
                      </div>

                      {/* ยาที่แพทย์สั่งใน Visit วันนี้ */}
                      <div className="clinical-card">
                        <div className="clinical-card-header">
                          <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#1d4ed8' }}>
                            💊 รายการยาที่แพทย์สั่งใน Visit วันนี้ ({detailData?.currentVn || 'ยังไม่มี VN'})
                          </span>
                        </div>
                        <div className="clinical-card-body" style={{ padding: '4px 8px' }}>
                          {detailData?.currentVisit?.drug_concat ? (
                            <table className="meds-compact-table">
                              <tbody>
                                {parseLines(detailData.currentVisit.drug_concat).map((medLine, mIdx) => {
                                  const parts = medLine.split('#');
                                  return (
                                    <tr key={mIdx}>
                                      <td className="med-col-num">#{mIdx + 1}</td>
                                      <td className="med-col-name">{parts[0]?.trim() || medLine}</td>
                                      <td className="med-col-qty">{parts[1]?.trim() ? `${parts[1].trim()} เม็ด` : ''}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          ) : (
                            <div style={{ color: 'var(--gray-400)', fontStyle: 'italic', fontSize: '0.8125rem', padding: '10px' }}>
                              {detailData?.currentVn
                                ? '— ยังไม่มีรายการยาที่แพทย์สั่งในระบบ HOSxP ของวันนี้ —'
                                : '— รอเวชระเบียนเปิด Visit และแพทย์สั่งยาใน HOSxP —'}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* รายละเอียดการยื่นความจำนง */}
                      <div className="clinical-card">
                        <div className="clinical-card-header">
                          <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>รายละเอียดการขอรับยาทางไปรษณีย์</span>
                        </div>
                        <div className="clinical-card-body" style={{ padding: '12px 14px' }}>
                          {/* เหตุผลความจำเป็น */}
                          {detailModalItem.reason && (
                            <div className="reason-alert-box" style={{ marginBottom: '10px' }}>
                              <span className="reason-label font-bold">เหตุผลความจำเป็น:</span>{' '}
                              <span className="reason-val font-semibold">{detailModalItem.reason}</span>
                            </div>
                          )}

                          {/* อาการปัจจุบัน */}
                          {detailModalItem.symptoms && (
                            <div className="req-info-row">
                              <span className="label">อาการปัจจุบัน:</span>
                              <span className="val font-medium">{detailModalItem.symptoms}</span>
                            </div>
                          )}

                          {/* ที่อยู่จัดส่งยา */}
                          <div className="req-info-row">
                            <span className="label">ที่อยู่จัดส่งยา:</span>
                            <span className="val">{detailModalItem.address || '—'} {detailModalItem.postcode || ''}</span>
                          </div>

                          {/* เบอร์โทรศัพท์ */}
                          <div className="req-info-row">
                            <span className="label">เบอร์โทรศัพท์:</span>
                            <span className="val font-mono">{formatPhone(detailModalItem.phone)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Timeline */}
                      <div className="clinical-card">
                        <div className="clinical-card-header">
                          <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>ประวัติและสถานะการดำเนินงาน (Timeline)</span>
                        </div>
                        <div className="clinical-card-body" style={{ padding: '10px 14px' }}>
                          <div className="audit-trail-timeline" style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>
                            <div className="audit-trail-item">
                              <span className="audit-dot"></span>
                              <span>ผู้ยื่นคำขอ: <strong>{detailModalItem.request_by || 'คนไข้ (LINE OA)'}</strong> ({formatThaiDateTime(detailModalItem.created_at)})</span>
                            </div>
                            {detailModalItem.received_by && (
                              <div className="audit-trail-item">
                                <span className="audit-dot success"></span>
                                <span>รับเรื่องโดย: <strong>{detailModalItem.received_by}</strong> ({formatThaiDateTime(detailModalItem.received_at)})</span>
                              </div>
                            )}
                            {detailModalItem.doctor_approved_by && (
                              <div className="audit-trail-item">
                                <span className="audit-dot success"></span>
                                <span>แพทย์ผู้อนุมัติ: <strong>{detailModalItem.doctor_approved_by}</strong> ({formatThaiDateTime(detailModalItem.doctor_approved_at || detailModalItem.updated_at)})</span>
                              </div>
                            )}
                            {detailModalItem.pharmacy_approved_by && (
                              <div className="audit-trail-item">
                                <span className="audit-dot success"></span>
                                <span>เภสัชผู้อนุมัติ: <strong>{detailModalItem.pharmacy_approved_by}</strong> ({formatThaiDateTime(detailModalItem.pharmacy_approved_at || detailModalItem.approve_at || detailModalItem.updated_at)})</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
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
                    ✓ ไม่ต้องชำระเงิน (ไปแท็บรอจัดส่ง)
                  </button>

                  <button
                    type="button"
                    className="btn btn-primary rtm-btn-action"
                    style={{ background: '#ea580c', borderColor: '#c2410c' }}
                    onClick={() => handleDispenseAction('PAID')}
                    disabled={dispenseSubmitting}
                  >
                    💰 ต้องชำระเงิน (ส่งไปเมนูการเงิน)
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary rtm-btn-action"
                    onClick={() => handlePrintAddress(detailModalItem)}
                    title="พิมพ์ใบปะหน้าชื่อ ที่อยู่ (A5)"
                  >
                    🖨️ พิมพ์ที่อยู่ (A5)
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary rtm-btn-action"
                    onClick={() => {
                      const it = detailModalItem;
                      setDetailModalItem(null);
                      openDeliveryModal(it);
                    }}
                  >
                    🚚 บันทึกจัดส่งยา
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delivery Tracking Modal */}
      {deliveryModalItem && (
        <div className="dialog-modal-overlay" onClick={() => setDeliveryModalItem(null)}>
          <div className="dialog-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-modal-header">บันทึกการจัดส่งยาทางไปรษณีย์</div>
            <form onSubmit={handleConfirmDelivery}>
              <div className="dialog-modal-body">
                <div>ผู้ป่วย: <strong>{deliveryModalItem.patient_name}</strong> (HN: {deliveryModalItem.hn})</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--gray-600)', marginTop: '4px' }}>
                  ที่อยู่: {deliveryModalItem.address} {deliveryModalItem.postcode} (โทร: {deliveryModalItem.phone})
                </div>

                <div className="form-group" style={{ marginTop: '14px' }}>
                  <label htmlFor="tt-tracking-input" className="form-label font-bold">
                    หมายเลขพัสดุ (Tracking Number) <span style={{ color: 'var(--error-600)' }}>*</span>
                  </label>
                  <input
                    id="tt-tracking-input"
                    type="text"
                    className="form-input font-mono"
                    placeholder="เช่น ED123456789TH"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value.toUpperCase())}
                    autoFocus
                    required
                  />
                </div>
              </div>
              <div className="dialog-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setDeliveryModalItem(null)}
                  disabled={deliverySubmitting}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={deliverySubmitting}
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

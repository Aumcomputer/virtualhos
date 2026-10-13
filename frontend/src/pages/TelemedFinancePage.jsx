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
    return dateStr;
  }
}

function formatMoney(num) {
  const n = Number(num || 0);
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

export default function TelemedFinancePage() {
  const [tab, setTab] = useState('pending'); // 'pending' | 'paid' | 'all'
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState({
    pending_count: 0,
    paid_count: 0,
    all_count: 0,
    total_pending_money: 0,
    total_item_money: 0,
  });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Pay Modal State
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [paying, setPaying] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getTelemedFinance({ tab, search });
      setData(res.data || []);
      setSummary(res.summary || {
        pending_count: 0,
        paid_count: 0,
        all_count: 0,
        total_pending_money: 0,
        total_item_money: 0,
      });
    } catch (err) {
      console.error('Error fetching telemed finance cases:', err);
      setToast({ type: 'error', message: err.message || 'ไม่สามารถโหลดข้อมูลคิวการเงินได้' });
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

  const openPayModal = async (item) => {
    setSelectedItem(item);
    setDetailData(null);
    setDetailLoading(true);
    try {
      const res = await api.getTelemedPharmacyDetail(item.id);
      setDetailData(res.data);
    } catch (err) {
      console.error('Error fetching detail in finance:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const closePayModal = () => {
    setSelectedItem(null);
    setDetailData(null);
  };

  const handleConfirmPay = async () => {
    if (!selectedItem) return;
    setPaying(true);
    try {
      const res = await api.payTelemedFinance(selectedItem.id);
      setToast({ type: 'success', message: res.message || 'บันทึกชำระเงินเรียบร้อยแล้ว' });
      closePayModal();
      fetchData();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการบันทึกชำระเงิน' });
    } finally {
      setPaying(false);
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

      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h2 className="page-title">การเงิน Telemed (Finance)</h2>
            <p className="page-subtitle">
              รายการผู้ป่วยจากห้องยาที่ต้องชำระค่าบริการ/ค่ายา เมื่อบันทึก "ชำระเงินแล้ว" เคสจะย้ายไปยังแท็บรอจัดส่งยาของห้องยา
            </p>
          </div>
        </div>
      </div>

      <div className="page-body prescreening-container">
        {/* Navigation Stage Chips (Tabs - Font Sarabun) */}
        <div className="rtm-stage-bar" style={{ fontFamily: "'Sarabun', sans-serif" }}>
          <button
            type="button"
            className={`rtm-stage-chip ${tab === 'pending' ? 'active' : ''}`}
            style={{ fontFamily: "'Sarabun', sans-serif" }}
            onClick={() => setTab('pending')}
          >
            <span style={{ fontFamily: "'Sarabun', sans-serif" }}>รอชำระเงิน</span>
            <span className="rtm-chip-count" style={{ fontFamily: "'Sarabun', sans-serif" }}>{summary.pending_count || 0}</span>
          </button>

          <button
            type="button"
            className={`rtm-stage-chip ${tab === 'paid' ? 'active' : ''}`}
            style={{ fontFamily: "'Sarabun', sans-serif" }}
            onClick={() => setTab('paid')}
          >
            <span style={{ fontFamily: "'Sarabun', sans-serif" }}>ชำระเงินแล้ว</span>
            <span className="rtm-chip-count" style={{ fontFamily: "'Sarabun', sans-serif" }}>{summary.paid_count || 0}</span>
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
                placeholder="ค้นหา HN, ชื่อผู้ป่วย, VN, เบอร์โทร..."
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

          {/* Table */}
          <div className="data-table-wrapper rtm-table-container">
            <table className="data-table telemed-workflow-table rtm-table" style={{ fontFamily: "'Sarabun', 'TH Sarabun New', sans-serif" }}>
              <thead>
                <tr>
                  <th style={{ width: '45px', textAlign: 'center' }}>#</th>
                  <th style={{ width: '110px' }}>วันนัดหมาย</th>
                  <th style={{ width: '120px' }}>VN วันนี้</th>
                  <th style={{ width: '100px' }}>HN</th>
                  <th>ชื่อ-นามสกุล</th>
                  <th>สิทธิการรักษา</th>
                  <th>เบอร์โทร</th>
                  <th style={{ textAlign: 'right' }}>ยอดรวม (บาท)</th>
                  <th style={{ textAlign: 'right' }}>เบิกได้ (บาท)</th>
                  <th style={{ textAlign: 'right', color: '#b91c1c' }}>ต้องชำระ (บาท)</th>
                  <th style={{ textAlign: 'center' }}>สถานะ</th>
                  <th style={{ textAlign: 'center', width: '140px' }}>การชำระเงิน</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={12} style={{ textAlign: 'center', padding: '48px 20px' }}>
                      <div className="loading-spinner-wrapper" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', color: 'var(--gray-600)' }}>
                        <svg className="spin-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        <span style={{ fontSize: '0.875rem' }}>กำลังโหลดข้อมูลการเงิน...</span>
                      </div>
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ textAlign: 'center', padding: '56px 20px' }}>
                      <div className="empty-state-box">
                        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '6px' }}>
                          {tab === 'pending'
                            ? 'ไม่มีรายการที่รอชำระเงินในขณะนี้'
                            : tab === 'paid'
                            ? 'ยังไม่มีรายการที่ชำระเงินแล้ว'
                            : 'ไม่พบรายการข้อมูล'}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--gray-500)' }}>
                          ข้อมูลเชื่อมโยงจากห้องยา Telemed ที่ระบุประเภทเป็น "มีค่าใช้จ่าย"
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.map((item, idx) => {
                    const isPending = item.is_finance_pending;
                    const isPaid = item.is_finance_paid;

                    return (
                      <tr
                        key={item.id}
                        className="table-row-clickable"
                        onClick={() => openPayModal(item)}
                        title="คลิกเพื่อดูรายละเอียดและบันทึกชำระเงิน"
                      >
                        {/* 1. Index */}
                        <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem', fontFamily: 'monospace' }}>
                          {idx + 1}
                        </td>

                        {/* 2. Date */}
                        <td style={{ fontSize: '0.8125rem', color: '#334155' }}>
                          {formatThaiDate(item.vstdate)}
                        </td>

                        {/* 3. VN */}
                        <td>
                          <span className="tt-vn-tag">
                            {item.vn || '—'}
                          </span>
                        </td>

                        {/* 4. HN */}
                        <td>
                          <span className="rtm-hn-pill font-mono">{item.hn}</span>
                        </td>

                        {/* 5. Patient Name */}
                        <td style={{ color: '#0f172a', whiteSpace: 'nowrap' }}>
                          {item.patient_name || '—'}
                        </td>

                        {/* 6. Entitlement */}
                        <td style={{ fontSize: '0.8125rem', color: '#475569' }}>
                          {item.pttype_name || '—'}
                        </td>

                        {/* 7. Phone */}
                        <td>
                          <span style={{ fontSize: '0.8125rem', fontFamily: 'monospace', color: '#334155' }}>
                            {formatPhone(item.phone)}
                          </span>
                        </td>

                        {/* 8. Total item money */}
                        <td style={{ textAlign: 'right' }}>
                          <span className="tt-money tt-money-total">
                            {formatMoney(item.item_money)}
                          </span>
                        </td>

                        {/* 9. UC money */}
                        <td style={{ textAlign: 'right' }}>
                          <span className="tt-money tt-money-uc">
                            {formatMoney(item.uc_money)}
                          </span>
                        </td>

                        {/* 10. Paid money */}
                        <td style={{ textAlign: 'right' }}>
                          {Number(item.paid_money) > 0 ? (
                            <span className="tt-money tt-money-paid-active">{formatMoney(item.paid_money)}</span>
                          ) : (
                            <span className="tt-money tt-money-paid-zero">{formatMoney(item.paid_money)}</span>
                          )}
                        </td>

                        {/* 11. Status */}
                        <td style={{ textAlign: 'center', fontSize: '0.8125rem' }}>
                          {isPaid ? (
                            <span style={{ color: '#16a34a' }}>
                              ชำระเงินแล้ว
                            </span>
                          ) : isPending ? (
                            <span style={{ color: '#d97706' }}>
                              รอชำระเงิน
                            </span>
                          ) : (
                            <span style={{ color: '#64748b' }}>
                              {item.status || '—'}
                            </span>
                          )}
                        </td>

                        {/* 12. Action */}
                        <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                          {isPending ? (
                            <button
                              type="button"
                              className="btn btn-primary rtm-btn-action btn-pay"
                              onClick={() => openPayModal(item)}
                            >
                              บันทึกชำระเงิน
                            </button>
                          ) : isPaid ? (
                            <span style={{ fontSize: '0.75rem', color: '#16a34a' }}>
                              ชำระแล้ว ({item.paid_by || 'การเงิน'})
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div style={{ padding: '14px 20px', borderTop: '1px solid #f1f5f9', fontSize: '0.8125rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: "'Sarabun', 'TH Sarabun New', sans-serif" }}>
            <div>
              แสดงทั้งหมด <strong style={{ color: '#0f172a' }}>{data.length}</strong> รายการ
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================
          Pay / Detail Modal
          ======================================================================== */}
      {selectedItem && (
        <div className="visit-modal-backdrop rtm-modal-backdrop" onClick={closePayModal}>
          <div className="visit-modal-container rtm-modal-window" style={{ maxWidth: '800px', fontFamily: "'Sarabun', 'TH Sarabun New', sans-serif" }} onClick={(e) => e.stopPropagation()}>
            <div className="visit-modal-header rtm-modal-header">
              <div className="visit-modal-title-row">
                <div className="visit-modal-title rtm-modal-title">
                  บันทึกการชำระเงินค่ายา / ค่าบริการ
                </div>
                {selectedItem.vn && (
                  <span className="badge badge-primary font-mono" style={{ marginLeft: '10px' }}>
                    VN: {selectedItem.vn}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="visit-modal-close-btn rtm-modal-close"
                onClick={closePayModal}
                aria-label="ปิด"
              >
                ✕
              </button>
            </div>

            <div className="visit-modal-body" style={{ maxHeight: 'calc(85vh - 120px)', overflowY: 'auto', padding: '20px' }}>
              {/* Patient Banner */}
              <div className="patient-quick-banner rtm-patient-banner" style={{ marginBottom: '16px' }}>
                <div className="patient-banner-left">
                  <div className="patient-banner-name-block">
                    <div className="patient-banner-name">{selectedItem.patient_name}</div>
                    <div className="patient-banner-sub">
                      <span className="font-mono" style={{ fontWeight: 600, color: 'var(--primary-700)' }}>
                        HN: {selectedItem.hn}
                      </span>
                      {detailData?.currentVisit?.age_y !== undefined && (
                        <span>• อายุ {detailData.currentVisit.age_y} ปี {detailData.currentVisit.age_m || 0} เดือน</span>
                      )}
                      <span>• สิทธิ: {selectedItem.pttype_name || '—'}</span>
                      {selectedItem.clinic && <span>• คลินิก: {selectedItem.clinic}</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Price Cards */}
              <div className="finance-price-box">
                <div className="finance-price-card fp-total">
                  <span className="fp-label">ยอดรวม</span>
                  <span className="fp-amount">{formatMoney(selectedItem.item_money)} ฿</span>
                </div>
                <div className="finance-price-card fp-uc">
                  <span className="fp-label">เบิกได้</span>
                  <span className="fp-amount">{formatMoney(selectedItem.uc_money)} ฿</span>
                </div>
                <div className="finance-price-card fp-paid">
                  <span className="fp-label">ต้องชำระ</span>
                  <span className="fp-amount" style={{ fontSize: '1.35rem' }}>{formatMoney(selectedItem.paid_money)} ฿</span>
                </div>
              </div>

              {/* Doctor Ordered Medicine List */}
              {detailLoading ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
                  กำลังดึงข้อมูลรายการยาที่แพทย์สั่ง...
                </div>
              ) : detailData?.currentVisit?.drugs && detailData.currentVisit.drugs.length > 0 ? (
                <div className="clinical-card" style={{ marginBottom: '16px' }}>
                  <div className="clinical-card-header" style={{ background: '#f8fafc' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#1e293b' }}>
                      รายการยาที่แพทย์สั่ง ({detailData.currentVisit.drugs.length} รายการ)
                    </span>
                  </div>
                  <div className="clinical-card-body" style={{ padding: '0' }}>
                    <table className="mini-med-table" style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ padding: '6px 10px', textAlign: 'left' }}>ชื่อยา</th>
                          <th style={{ padding: '6px 10px', textAlign: 'right', width: '60px' }}>จำนวน</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailData.currentVisit.drugs.map((d, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px 10px' }}>
                              <div style={{ fontWeight: 600, color: '#1e293b' }}>{d.drug_name || d.name}</div>
                              <div style={{ color: '#64748b', fontSize: '0.6875rem' }}>{d.usage_line1 || d.drugusage}</div>
                            </td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                              {d.qty || d.amount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {/* Delivery Address overview */}
              <div style={{ fontSize: '0.8125rem', color: '#334155', lineHeight: 1.6, background: '#ffffff', border: '1px solid #e2e8f0', padding: '12px 14px', borderRadius: '10px' }}>
                <div><strong>ที่อยู่จัดส่ง:</strong> {selectedItem.address} {selectedItem.postal_code}</div>
                <div><strong>เบอร์โทรศัพท์:</strong> {formatPhone(selectedItem.phone)}</div>
                {selectedItem.pharmacy_dispense_at && (
                  <div><strong>ห้องยาส่งเรื่องเมื่อ:</strong> {formatThaiDateTime(selectedItem.pharmacy_dispense_at)} โดย {selectedItem.pharmacy_dispense_by || 'ห้องยา'}</div>
                )}
                {selectedItem.paid_at && (
                  <div><strong>ชำระเงินเมื่อ:</strong> {formatThaiDateTime(selectedItem.paid_at)} โดย {selectedItem.paid_by}</div>
                )}
              </div>
            </div>

            <div className="visit-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid #f1f5f9' }}>
              <button
                type="button"
                className="btn btn-secondary rtm-btn-action"
                onClick={closePayModal}
                disabled={paying}
              >
                ปิดหน้าต่าง
              </button>

              {selectedItem.is_finance_pending && (
                <button
                  type="button"
                  className="btn btn-primary rtm-btn-action btn-pay"
                  style={{ padding: '8px 20px', fontSize: '0.875rem' }}
                  onClick={handleConfirmPay}
                  disabled={paying}
                >
                  {paying ? 'กำลังบันทึก...' : 'บันทึกชำระเงินแล้ว'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

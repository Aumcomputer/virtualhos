import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
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
  return raw;
}

export default function TelemedTodayFinancePage() {
  const [data, setData] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Pay Modal State
  const [selectedItem, setSelectedItem] = useState(null);
  const [paying, setPaying] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getTelemedTodayFinance({ search });
      setData(res.data || []);
    } catch (err) {
      console.error('Error fetching finance cases:', err);
      setToast({ type: 'error', message: err.message || 'ไม่สามารถโหลดข้อมูลคิวการเงินได้' });
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleConfirmPay = async () => {
    if (!selectedItem) return;
    setPaying(true);
    try {
      const res = await api.financePayTelemedToday(selectedItem.id);
      setToast({ type: 'success', message: res.message });
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการบันทึกชำระเงิน' });
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="request-telemed-page">
      {/* Toast */}
      {toast && (
        <div className={`rtm-toast ${toast.type}`}>
          {toast.type === 'success' ? '✓ ' : 'ℹ '}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="rtm-header">
        <div className="rtm-header-left">
          <h1 className="rtm-title">การเงิน (Finance / Cashier)</h1>
          <p className="rtm-subtitle">
            รายชื่อผู้ป่วยที่ห้องยาส่งมาเพื่อชำระเงินค่าบริการ/ค่ายา เมื่อบันทึก "ชำระเงินแล้ว" รายการจะย้ายไปยังแท็บรอจัดส่งของห้องยา
          </p>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="rtm-card">
        {/* Toolbar */}
        <div className="rtm-toolbar">
          <div className="rtm-search-wrap" style={{ minWidth: '320px' }}>
            <input
              type="text"
              className="rtm-search-input"
              placeholder="ค้นหา HN, ชื่อผู้ป่วย, VN วันนี้, เบอร์โทร..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchData}
            disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <svg className={loading ? 'spin-icon' : ''} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
            <span>รีเฟรช</span>
          </button>
        </div>

        {/* Table */}
        <div className="table-responsive">
          <table className="queue-table">
            <thead>
              <tr>
                <th style={{ width: '48px', textAlign: 'center' }}>#</th>
                <th>VN วันนี้</th>
                <th>HN</th>
                <th>ชื่อ-นามสกุล</th>
                <th>สิทธิการรักษา</th>
                <th>เบอร์โทร</th>
                <th style={{ textAlign: 'right' }}>ยอดรวม</th>
                <th style={{ textAlign: 'right' }}>เบิกได้</th>
                <th style={{ textAlign: 'right', color: '#b91c1c' }}>ยอดต้องชำระ</th>
                <th>เภสัชกรผู้ส่งเรื่อง</th>
                <th style={{ textAlign: 'center', width: '130px' }}>การชำระเงิน</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '48px 20px' }}>
                    <div className="loading-state">
                      <svg className="spin-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      <span style={{ fontSize: '0.875rem' }}>กำลังโหลดข้อมูลคิวการเงิน...</span>
                    </div>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '56px 20px' }}>
                    <div className="empty-state-box">
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '6px' }}>
                        ไม่มีรายการที่รอชำระเงินในขณะนี้
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--gray-500)' }}>
                        เมื่อห้องยาตรวจสอบรายการยาและกด "ต้องชำระเงิน" รายชื่อจะปรากฏในหน้านี้
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
                      onClick={() => setSelectedItem(item)}
                    >
                      <td style={{ textAlign: 'center', color: 'var(--gray-400)', fontSize: '0.8125rem', fontFamily: 'monospace' }}>
                        {idx + 1}
                      </td>

                      <td>
                        <span className="font-mono" style={{ fontWeight: 600, color: '#0284c7' }}>
                          {item.vn_today || '—'}
                        </span>
                      </td>

                      <td>
                        <span className="hn-badge font-mono">{item.hn}</span>
                      </td>

                      <td>
                        <span className="font-semibold" style={{ color: 'var(--gray-900)' }}>
                          {item.patient_name || '—'}
                        </span>
                      </td>

                      <td style={{ fontSize: '0.8125rem', color: 'var(--gray-700)' }}>
                        {item.pttype_name || '—'}
                      </td>

                      <td style={{ fontSize: '0.8125rem', fontFamily: 'monospace' }}>
                        {formatPhone(item.phone)}
                      </td>

                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 500 }}>
                        {formatMoney(item.item_money)} ฿
                      </td>

                      <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#16a34a' }}>
                        {formatMoney(item.uc_money)} ฿
                      </td>

                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9375rem', color: '#b91c1c' }}>
                        {formatMoney(item.paid_money)} ฿
                      </td>

                      <td style={{ fontSize: '0.8125rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--gray-800)' }}>
                          {item.pharmacy_dispense_by || 'เภสัชกร'}
                        </div>
                        {item.pharmacy_dispense_at && (
                          <div style={{ fontSize: '0.6875rem', color: 'var(--gray-400)', marginTop: '2px' }}>
                            {formatThaiDateTime(item.pharmacy_dispense_at)}
                          </div>
                        )}
                      </td>

                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ padding: '5px 14px', fontSize: '0.8125rem', background: '#0284c7' }}
                          onClick={() => setSelectedItem(item)}
                        >
                          ชำระเงิน
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', fontSize: '0.8125rem', color: 'var(--gray-500)' }}>
          แสดงทั้งหมด <strong>{data.length}</strong> รายการที่รอชำระเงิน
        </div>
      </div>

      {/* ========================================================================
          Finance Payment Modal
          ======================================================================== */}
      {selectedItem && (
        <div className="dialog-modal-overlay" onClick={() => setSelectedItem(null)}>
          <div className="dialog-modal-card" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
            <div className="dialog-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>บันทึกการชำระเงินค่ายา/ค่าบริการ</span>
              <button
                type="button"
                className="visit-modal-close"
                onClick={() => setSelectedItem(null)}
              >
                ✕
              </button>
            </div>

            <div className="dialog-modal-body">
              {/* Patient brief */}
              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '14px' }}>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--gray-900)' }}>
                  {selectedItem.patient_name}
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--gray-600)', marginTop: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <span>HN: <strong className="font-mono">{selectedItem.hn}</strong></span>
                  {selectedItem.vn_today && (
                    <span>VN วันนี้: <strong className="font-mono" style={{ color: '#0284c7' }}>{selectedItem.vn_today}</strong></span>
                  )}
                  <span>สิทธิ: <strong>{selectedItem.pttype_name || '—'}</strong></span>
                </div>
              </div>

              {/* Price Cards */}
              <div className="finance-price-box">
                <div className="finance-price-card fp-total">
                  <span className="fp-label">ยอดรวม (item_money)</span>
                  <span className="fp-amount">{formatMoney(selectedItem.item_money)} ฿</span>
                </div>
                <div className="finance-price-card fp-uc">
                  <span className="fp-label">เบิกได้ (uc_money)</span>
                  <span className="fp-amount">{formatMoney(selectedItem.uc_money)} ฿</span>
                </div>
                <div className="finance-price-card fp-paid">
                  <span className="fp-label">ยอดต้องชำระ (paid_money)</span>
                  <span className="fp-amount" style={{ fontSize: '1.25rem' }}>{formatMoney(selectedItem.paid_money)} ฿</span>
                </div>
              </div>

              {/* Delivery Address overview */}
              <div style={{ fontSize: '0.8125rem', color: 'var(--gray-600)', lineHeight: 1.5, background: '#fff', border: '1px solid #e2e8f0', padding: '10px 12px', borderRadius: '8px' }}>
                <div><strong>ที่อยู่จัดส่ง:</strong> {selectedItem.address} {selectedItem.postcode}</div>
                <div><strong>เบอร์โทร:</strong> {formatPhone(selectedItem.phone)}</div>
                <div><strong>ห้องยาส่งเรื่องเมื่อ:</strong> {formatThaiDateTime(selectedItem.pharmacy_dispense_at)} โดย {selectedItem.pharmacy_dispense_by}</div>
              </div>
            </div>

            <div className="dialog-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedItem(null)}
                disabled={paying}
              >
                ปิดหน้าต่าง
              </button>

              <button
                type="button"
                className="btn btn-primary"
                style={{ background: '#059669', borderColor: '#047857', padding: '8px 20px', fontSize: '0.9375rem' }}
                onClick={handleConfirmPay}
                disabled={paying}
              >
                {paying ? 'กำลังบันทึก...' : '✓ ชำระเงินแล้ว (ส่งไปแท็บรอจัดส่ง)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

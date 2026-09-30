import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import './PrescreeningPage.css';

function getTomorrowStr() {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatThaiDate(dateStr) {
  if (!dateStr) return '-';
  
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    // Fallback if Date object parsing fails
    const parts = String(dateStr).split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, day] = parts.map(Number);
    const months = [
      '', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
    ];
    return `${day} ${months[m]} ${y + 543}`;
  }
  
  const day = d.getDate();
  const month = d.getMonth() + 1; // 0-indexed
  const year = d.getFullYear() + 543;
  const months = [
    '', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ];
  
  return `${day} ${months[month]} ${year}`;
}

function formatDateTime(dateTimeStr) {
  if (!dateTimeStr) return '-';
  const d = new Date(dateTimeStr);
  
  let day, monthIndex, year, hours, mins;
  if (isNaN(d.getTime())) {
    // Fallback if parsing fails
    const parts = String(dateTimeStr).replace(' ', 'T').split('T');
    if (parts.length < 2) return dateTimeStr;
    const dateParts = parts[0].split('-');
    if (dateParts.length !== 3) return dateTimeStr;
    day = Number(dateParts[2]);
    monthIndex = Number(dateParts[1]);
    year = Number(dateParts[0]) + 543;
    
    const timeParts = parts[1].split(':');
    hours = timeParts[0] || '00';
    mins = timeParts[1] || '00';
  } else {
    day = d.getDate();
    monthIndex = d.getMonth() + 1;
    year = d.getFullYear() + 543;
    hours = String(d.getHours()).padStart(2, '0');
    mins = String(d.getMinutes()).padStart(2, '0');
  }
  
  const months = [
    '', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ];
  
  const dayStr = String(day).padStart(2, '0');
  return `${dayStr} ${months[monthIndex]} ${year} ${hours}:${mins} น.`;
}

export default function PrescreeningPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getTomorrowStr());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedPrescreenItem, setSelectedPrescreenItem] = useState(null);
  const [images, setImages] = useState([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [lightboxImageSrc, setLightboxImageSrc] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getPrescreeningData(selectedDate, search, statusFilter);
      setData(result);
    } catch (err) {
      console.error('Failed to fetch pre-screening data:', err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, search, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Statistics calculation
  const totalCount = data.length;
  const completedCount = data.filter(r => r.status === 'completed' || r.status === 'confirmed').length;
  const pendingCount = data.filter(r => r.status === 'pending').length;
  const lineSentCount = data.filter(r => r.line_sent === 'Y').length;
  const noLineCount = data.filter(r => r.line_sent === 'NO_LINE').length;

  const openDetailModal = async (item) => {
    setSelectedPrescreenItem(item);
    setImages([]);
    setImagesLoading(true);
    try {
      const result = await api.getPrescreeningImages(item.id);
      setImages(result || []);
    } catch (err) {
      console.error('Failed to fetch prescreening images:', err.message);
    } finally {
      setImagesLoading(false);
    }
  };

  const closeDetailModal = () => {
    setSelectedPrescreenItem(null);
    setImages([]);
  };

  return (
    <>
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h2 className="page-title">
              ข้อมูลคัดกรองก่อนพบแพทย์
            </h2>
            <p className="page-subtitle">
              รายการคัดกรองเบื้องต้นของผู้ป่วย Telemed นัดหมายวันที่ {formatThaiDate(selectedDate)}
            </p>
          </div>
        </div>
      </div>

      <div className="page-body prescreening-container">
        {/* Stats Row */}
        <div className="prescreen-stats-grid">
          <div className="prescreen-stat-card">
            <div className="prescreen-stat-icon total">📋</div>
            <div className="prescreen-stat-content">
              <span className="prescreen-stat-label">เคสทั้งหมด</span>
              <span className="prescreen-stat-val" style={{ color: '#2563eb' }}>{totalCount}</span>
            </div>
          </div>
          <div className="prescreen-stat-card">
            <div className="prescreen-stat-icon completed">✅</div>
            <div className="prescreen-stat-content">
              <span className="prescreen-stat-label">คัดกรองเสร็จสิ้น</span>
              <span className="prescreen-stat-val" style={{ color: '#059669' }}>{completedCount}</span>
            </div>
          </div>
          <div className="prescreen-stat-card">
            <div className="prescreen-stat-icon pending">⏳</div>
            <div className="prescreen-stat-content">
              <span className="prescreen-stat-label">รอคัดกรอง</span>
              <span className="prescreen-stat-val" style={{ color: '#d97706' }}>{pendingCount}</span>
            </div>
          </div>
          <div className="prescreen-stat-card">
            <div className="prescreen-stat-icon line">📱</div>
            <div className="prescreen-stat-content">
              <span className="prescreen-stat-label">ส่ง LINE แล้ว</span>
              <span className="prescreen-stat-val" style={{ color: '#0284c7' }}>{lineSentCount}</span>
            </div>
          </div>
          <div className="prescreen-stat-card">
            <div className="prescreen-stat-icon noline">⚠️</div>
            <div className="prescreen-stat-content">
              <span className="prescreen-stat-label">ไม่มีบัญชี LINE OA</span>
              <span className="prescreen-stat-val" style={{ color: '#64748b' }}>{noLineCount}</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="prescreen-toolbar-card">
          <div className="prescreen-search-box">
            <svg className="prescreen-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="prescreen-search-input"
              type="text"
              placeholder="ค้นหา HN, ชื่อผู้ป่วย, แพทย์, คลินิก..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              id="search-prescreening"
            />
          </div>
          
          <div className="prescreen-filters-group">
            <div className="prescreen-filter-item">
              <label htmlFor="status-filter">สถานะ:</label>
              <select
                id="status-filter"
                className="prescreen-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">ทั้งหมด</option>
                <option value="pending">⏳ รอกรอกข้อมูล</option>
                <option value="completed">✅ กรอกข้อมูลแล้ว</option>
                <option value="confirmed">🩺 ยืนยันข้อมูลแล้ว</option>
                <option value="expired">🛑 หมดอายุ</option>
              </select>
            </div>

            <div className="prescreen-filter-item">
              <label htmlFor="date-picker">วันนัดหมาย:</label>
              <input
                id="date-picker"
                className="prescreen-date-input"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="table-card">
          {loading ? (
            <div className="loading-container" style={{ padding: '48px 0' }}>
              <div className="spinner"></div>
              <span className="loading-text" style={{ marginTop: 12, color: '#64748b' }}>กำลังโหลดข้อมูลคัดกรอง...</span>
            </div>
          ) : data.length === 0 ? (
            <div className="empty-state" style={{ padding: '48px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>ไม่พบข้อมูลการคัดกรอง</div>
              <div style={{ fontSize: '0.875rem', color: '#64748b' }}>ไม่มีรายชื่อผู้ป่วยที่กรอกข้อมูลคัดกรองหรือมีนัดหมายตรงตามเงื่อนไขในวันที่เลือก</div>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table telemed-workflow-table rtm-table">
                <thead>
                  <tr>
                    <th style={{ width: '45px', textAlign: 'center' }}>#</th>
                    <th style={{ width: '110px' }}>HN</th>
                    <th>ชื่อ-นามสกุล</th>
                    <th>คลินิก</th>
                    <th>แพทย์</th>
                    <th style={{ textAlign: 'center', width: '120px' }}>สถานะ LINE</th>
                    <th style={{ textAlign: 'center', width: '130px' }}>สถานะกรอกข้อมูล</th>
                    <th style={{ textAlign: 'center' }}>สัญญาณชีพ (Vital Signs)</th>
                    <th>นัดหมาย / วันเวลากรอก</th>
                    <th style={{ textAlign: 'center', width: '110px' }}>การดำเนินการ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, idx) => {
                    const isCompleted = row.status === 'completed' || row.status === 'confirmed';
                    return (
                      <tr 
                        key={row.id}
                        onClick={() => openDetailModal(row)}
                        style={{ cursor: 'pointer' }}
                        className="table-row-clickable"
                        title="คลิกเพื่อดูรายละเอียดผลการคัดกรอง (Popup)"
                      >
                        <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem', fontFamily: 'monospace' }}>
                          {idx + 1}
                        </td>
                        <td>
                          <span className="rtm-hn-pill font-mono">{row.hn}</span>
                        </td>
                        <td>
                          <strong style={{ color: '#0f172a' }}>{row.patient_name || '-'}</strong>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#334155' }}>
                            {row.clinic || '-'}
                          </span>
                        </td>
                        <td>
                          {row.doctor_name ? (
                            <span style={{ fontSize: '0.8125rem', color: '#475569' }}>
                              🩺 {row.doctor_name}
                            </span>
                          ) : (
                            <span style={{ color: '#cbd5e1' }}>-</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {row.line_sent === 'Y' && (
                            <span className="prescreen-badge-line success">
                              ✅ ส่งสำเร็จ
                            </span>
                          )}
                          {row.line_sent === 'N' && (
                            <span className="prescreen-badge-line failed">
                              ❌ ส่งล้มเหลว
                            </span>
                          )}
                          {row.line_sent === 'NO_LINE' && (
                            <span className="prescreen-badge-line noline">
                              ⚠️ ไม่มี LINE
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {row.status === 'pending' && (
                            <span className="prescreen-badge-status pending">
                              ⏳ รอกรอกข้อมูล
                            </span>
                          )}
                          {row.status === 'completed' && (
                            <span className="prescreen-badge-status completed">
                              ✅ กรอกสำเร็จ
                            </span>
                          )}
                          {row.status === 'confirmed' && (
                            <span className="prescreen-badge-status confirmed">
                              🩺 ยืนยันแล้ว
                            </span>
                          )}
                          {row.status === 'expired' && (
                            <span className="prescreen-badge-status expired">
                              🛑 หมดอายุ
                            </span>
                          )}
                          {row.image_count > 0 && (
                            <div style={{ marginTop: '4px' }}>
                              <span style={{ background: '#e0f2fe', color: '#0369a1', borderRadius: '9999px', padding: '2px 8px', fontSize: '0.6875rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                📷 {row.image_count} รูป
                              </span>
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {isCompleted ? (
                            <div style={{ fontSize: '0.8125rem', textAlign: 'left', display: 'inline-block' }}>
                              <div>💓 <strong>Pulse:</strong> {row.pulse || '-'} bpm | 🩸 <strong>BP:</strong> {row.sbp || '-'}/{row.dbp || '-'}</div>
                              <div style={{ marginTop: '2px' }}>🌡️ <strong>Temp:</strong> {row.temperature || '-'} °C</div>
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>ไม่มีข้อมูล</span>
                          )}
                        </td>
                        <td>
                          <div style={{ fontSize: '0.8125rem' }}>
                            <div><strong>นัด:</strong> {formatThaiDate(row.appointment_date)}</div>
                            {isCompleted && row.completed_at && (
                              <div style={{ color: '#64748b', marginTop: '2px' }}>
                                <strong>ส่งข้อมูล:</strong> {formatDateTime(row.completed_at)}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="btn btn-secondary rtm-btn-action"
                            onClick={() => openDetailModal(row)}
                            title="ดูรายละเอียดการคัดกรอง"
                          >
                            👁️ ดูข้อมูล
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================
          Prescreening Detail Modal Popup
          ======================================================================== */}
      {selectedPrescreenItem && (
        <div className="visit-modal-backdrop rtm-modal-backdrop" onClick={closeDetailModal}>
          <div className="visit-modal-container rtm-modal-window" style={{ maxWidth: '1000px', maxHeight: '94vh' }} onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="visit-modal-header rtm-modal-header">
              <div className="visit-modal-title-row">
                <div className="visit-modal-title rtm-modal-title">
                  รายละเอียดข้อมูลคัดกรองก่อนพบแพทย์
                </div>
                <span className="badge badge-primary font-mono" style={{ marginLeft: '10px' }}>
                  HN: {selectedPrescreenItem.hn}
                </span>
              </div>
              <button
                type="button"
                className="visit-modal-close-btn rtm-modal-close"
                onClick={closeDetailModal}
                aria-label="ปิด"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="visit-modal-body" style={{ maxHeight: 'calc(85vh - 120px)', overflowY: 'auto', padding: '20px' }}>
              {/* Patient Banner */}
              <div className="patient-quick-banner rtm-patient-banner" style={{ marginBottom: '16px' }}>
                <div className="patient-banner-left">
                  <div className="patient-banner-name-block">
                    <div className="patient-banner-name">{selectedPrescreenItem.patient_name || '—'}</div>
                    <div className="patient-banner-sub">
                      <span className="font-mono" style={{ fontWeight: 600, color: 'var(--primary-700)' }}>
                        HN: {selectedPrescreenItem.hn}
                      </span>
                      <span>• วันนัดหมาย: {formatThaiDate(selectedPrescreenItem.appointment_date)}</span>
                      <span>• คลินิก: {selectedPrescreenItem.clinic || '—'}</span>
                      <span>• แพทย์: {selectedPrescreenItem.doctor_name || '—'}</span>
                    </div>
                  </div>
                </div>
                <div className="patient-banner-right">
                  {selectedPrescreenItem.status === 'completed' || selectedPrescreenItem.status === 'confirmed' ? (
                    <span className="prescreen-badge-status completed">
                      ✓ กรอกข้อมูลสำเร็จ
                    </span>
                  ) : (
                    <span className="prescreen-badge-status pending">
                      ⏳ รอกรอกข้อมูล
                    </span>
                  )}
                </div>
              </div>

              {/* Grid 3 Columns */}
              <div className="prescreen-detail-grid">
                {/* 1. General Info */}
                <div className="prescreen-detail-card">
                  <div className="prescreen-detail-title">
                    📋 ข้อมูลทั่วไปและการติดต่อ
                  </div>
                  <table className="prescreen-kv-table">
                    <tbody>
                      <tr>
                        <td className="lbl">HN:</td>
                        <td className="val font-mono">{selectedPrescreenItem.hn}</td>
                      </tr>
                      <tr>
                        <td className="lbl">ชื่อคนไข้:</td>
                        <td className="val font-bold">{selectedPrescreenItem.patient_name || '-'}</td>
                      </tr>
                      <tr>
                        <td className="lbl">ที่อยู่:</td>
                        <td className="val" style={{ whiteSpace: 'pre-wrap' }}>{selectedPrescreenItem.address || 'ไม่มีข้อมูลที่อยู่'}</td>
                      </tr>
                      <tr>
                        <td className="lbl">รหัสไปรษณีย์:</td>
                        <td className="val">{selectedPrescreenItem.postal_code || '-'}</td>
                      </tr>
                      <tr>
                        <td className="lbl">เบอร์โทร:</td>
                        <td className="val">{selectedPrescreenItem.phone || '-'}</td>
                      </tr>
                      <tr>
                        <td className="lbl">นัดหมาย:</td>
                        <td className="val">{formatThaiDate(selectedPrescreenItem.appointment_date)} ({selectedPrescreenItem.note || '-'})</td>
                      </tr>
                      {selectedPrescreenItem.line_sent_timestamp && (
                        <tr>
                          <td className="lbl">ส่ง LINE:</td>
                          <td className="val">{formatDateTime(selectedPrescreenItem.line_sent_timestamp)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* 2. Vital Signs */}
                <div className="prescreen-detail-card">
                  <div className="prescreen-detail-title">
                    🩺 ผลการคัดกรองสัญญาณชีพ
                  </div>
                  {selectedPrescreenItem.status === 'completed' || selectedPrescreenItem.status === 'confirmed' ? (
                    <div className="prescreen-vitals-grid">
                      <div className="prescreen-vital-item">
                        <span className="prescreen-vital-lbl">💓 ชีพจร (Pulse Rate)</span>
                        <span className="prescreen-vital-val">{selectedPrescreenItem.pulse ? `${selectedPrescreenItem.pulse} bpm` : '-'}</span>
                      </div>
                      <div className="prescreen-vital-item">
                        <span className="prescreen-vital-lbl">🩸 ความดันโลหิต (BP)</span>
                        <span className="prescreen-vital-val">{selectedPrescreenItem.sbp || selectedPrescreenItem.dbp ? `${selectedPrescreenItem.sbp || '-'}/${selectedPrescreenItem.dbp || '-'}` : '-'}</span>
                      </div>
                      <div className="prescreen-vital-item">
                        <span className="prescreen-vital-lbl">🌡️ อุณหภูมิ (Temp)</span>
                        <span className="prescreen-vital-val">{selectedPrescreenItem.temperature ? `${selectedPrescreenItem.temperature} °C` : '-'}</span>
                      </div>
                      <div className="prescreen-vital-item">
                        <span className="prescreen-vital-lbl">🫁 ออกซิเจน (SpO2)</span>
                        <span className="prescreen-vital-val">{selectedPrescreenItem.spo2 ? `${selectedPrescreenItem.spo2} %` : '-'}</span>
                      </div>
                      <div className="prescreen-vital-item">
                        <span className="prescreen-vital-lbl">🫁 อัตราหายใจ (RR)</span>
                        <span className="prescreen-vital-val">{selectedPrescreenItem.rr ? `${selectedPrescreenItem.rr} /min` : '-'}</span>
                      </div>
                      <div className="prescreen-vital-item">
                        <span className="prescreen-vital-lbl">⚖️ นน. / สส.</span>
                        <span className="prescreen-vital-val">{selectedPrescreenItem.weight ? `${selectedPrescreenItem.weight} กก.` : '-'} / {selectedPrescreenItem.height ? `${selectedPrescreenItem.height} ซม.` : '-'}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: '#94a3b8', fontSize: '0.8125rem', fontStyle: 'italic', padding: '16px 0' }}>
                      ยังไม่ได้รับการกรอกข้อมูล
                    </div>
                  )}
                </div>

                {/* 3. Symptoms & History */}
                <div className="prescreen-detail-card">
                  <div className="prescreen-detail-title">
                    📝 อาการและประวัติ
                  </div>
                  {selectedPrescreenItem.status === 'completed' || selectedPrescreenItem.status === 'confirmed' ? (
                    <div style={{ fontSize: '0.8125rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div>
                        <span style={{ fontWeight: 600, color: '#475569' }}>อาการสำคัญ (CC):</span>
                        <div style={{ padding: '8px 10px', background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '6px', marginTop: '4px', whiteSpace: 'pre-wrap' }}>
                          {selectedPrescreenItem.chief_complaint || 'ไม่มีข้อมูล'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                        <div>
                          <span style={{ fontWeight: 600, color: '#475569' }}>🍺 ดื่มสุรา:</span>{' '}
                          {selectedPrescreenItem.alcohol === 'yes' ? (
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>ดื่ม ({selectedPrescreenItem.alcohol_detail || 'ไม่ระบุ'})</span>
                          ) : (
                            <span style={{ color: '#64748b' }}>ไม่ดื่ม</span>
                          )}
                        </div>
                        <div>
                          <span style={{ fontWeight: 600, color: '#475569' }}>🚬 สูบบุหรี่:</span>{' '}
                          {selectedPrescreenItem.smoking === 'yes' ? (
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>สูบ ({selectedPrescreenItem.smoking_detail || 'ไม่ระบุ'})</span>
                          ) : (
                            <span style={{ color: '#64748b' }}>ไม่สูบ</span>
                          )}
                        </div>
                      </div>
                      {selectedPrescreenItem.additional_notes && (
                        <div>
                          <span style={{ fontWeight: 600, color: '#475569' }}>เพิ่มเติม:</span>
                          <div style={{ padding: '6px 10px', background: '#f8fafc', borderRadius: '6px', marginTop: '2px', color: '#334155' }}>
                            {selectedPrescreenItem.additional_notes}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ color: '#94a3b8', fontSize: '0.8125rem', fontStyle: 'italic', padding: '16px 0' }}>
                      ยังไม่มีข้อมูลการส่งฟอร์ม
                    </div>
                  )}
                </div>
              </div>

              {/* Attached Images */}
              {(selectedPrescreenItem.status === 'completed' || selectedPrescreenItem.status === 'confirmed') && (
                <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#1e40af', marginBottom: '8px' }}>
                    📷 รูปภาพแนบเพิ่มเติม ({images.length} รูป)
                  </div>
                  {imagesLoading ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="spinner-sm"></div>
                      <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>กำลังโหลดรูปภาพ...</span>
                    </div>
                  ) : images.length > 0 ? (
                    <div className="prescreen-images-wrap">
                      {images.map((img) => (
                        <button
                          type="button"
                          key={img.id}
                          className="prescreen-thumb-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLightboxImageSrc(`/api/prescreening/images/${img.id}`);
                          }}
                          title="คลิกเพื่อดูภาพขนาดเต็ม"
                        >
                          <img
                            src={`/api/prescreening/images/${img.id}`}
                            alt="รูปภาพคัดกรอง"
                            className="prescreen-thumb-img"
                          />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic' }}>
                      ไม่มีรูปภาพแนบสำหรับเคสนี้
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="visit-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid #f1f5f9' }}>
              <button
                type="button"
                className="btn btn-secondary rtm-btn-action"
                onClick={closeDetailModal}
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxImageSrc && (
        <div 
          className="lightbox-overlay"
          onClick={() => setLightboxImageSrc(null)}
        >
          <div 
            className="lightbox-content-wrapper"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              className="lightbox-close-btn"
              onClick={() => setLightboxImageSrc(null)}
              aria-label="Close lightbox"
            >
              ✕
            </button>
            <img 
              src={lightboxImageSrc} 
              alt="รูปภาพขยายใหญ่" 
              className="lightbox-image"
            />
          </div>
        </div>
      )}
    </>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

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
  const [expandedRowId, setExpandedRowId] = useState(null);
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

  const toggleExpandRow = async (id) => {
    if (expandedRowId === id) {
      setExpandedRowId(null);
      setImages([]);
    } else {
      setExpandedRowId(id);
      setImages([]);
      setImagesLoading(true);
      try {
        const result = await api.getPrescreeningImages(id);
        setImages(result || []);
      } catch (err) {
        console.error('Failed to fetch prescreening images:', err.message);
      } finally {
        setImagesLoading(false);
      }
    }
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

      <div className="page-body">
        {/* Stats Row */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">เคสทั้งหมด</div>
            <div className="stat-value primary">{totalCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">คัดกรองเสร็จสิ้น</div>
            <div className="stat-value success">{completedCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">รอคัดกรอง</div>
            <div className="stat-value accent">{pendingCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">ส่ง LINE แจ้งเตือนแล้ว</div>
            <div className="stat-value info" style={{ color: '#0288d1' }}>{lineSentCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">ไม่มีบัญชี LINE OA</div>
            <div className="stat-value warning" style={{ color: '#f57c00' }}>{noLineCount}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="table-card" style={{ marginBottom: '20px' }}>
          <div className="table-toolbar" style={{ flexWrap: 'wrap', gap: '15px' }}>
            <div className="search-box">
              <span className="search-icon">🔍</span>
              <input
                className="search-input"
                type="text"
                placeholder="ค้นหา HN, ชื่อผู้ป่วย, แพทย์, คลินิก..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                id="search-prescreening"
              />
            </div>
            
            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
              <div className="date-picker-group">
                <label htmlFor="status-filter">สถานะ:</label>
                <select
                  id="status-filter"
                  className="search-input"
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--gray-300)', backgroundColor: 'white' }}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">ทั้งหมด</option>
                  <option value="pending">⏳ รอกรอกข้อมูล (Pending)</option>
                  <option value="completed">✅ กรอกข้อมูลแล้ว (Completed)</option>
                  <option value="confirmed">🩺 ยืนยันข้อมูลแล้ว (Confirmed)</option>
                  <option value="expired">🛑 หมดอายุ (Expired)</option>
                </select>
              </div>

              <div className="date-picker-group">
                <label htmlFor="date-picker">วันนัดหมาย:</label>
                <input
                  id="date-picker"
                  className="date-picker-input"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="table-card">
          {loading ? (
            <div className="loading-container">
              <div className="spinner"></div>
              <span className="loading-text">กำลังโหลดข้อมูลคัดกรอง...</span>
            </div>
          ) : data.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📭</div>
              <div className="empty-state-title">ไม่พบข้อมูลการคัดกรอง</div>
              <div className="empty-state-text">ไม่มีรายชื่อผู้ป่วยที่กรอกข้อมูลคัดกรองหรือมีนัดหมายตรงตามเงื่อนไขในวันที่เลือก</div>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>HN</th>
                    <th>ชื่อ-นามสกุล</th>
                    <th>คลินิก</th>
                    <th>แพทย์</th>
                    <th style={{ textAlign: 'center' }}>สถานะ LINE</th>
                    <th style={{ textAlign: 'center' }}>สถานะกรอกข้อมูล</th>
                    <th style={{ textAlign: 'center' }}>สัญญาณชีพ (Vital Signs)</th>
                    <th>นัดหมาย / วันเวลากรอก</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => {
                    const isExpanded = expandedRowId === row.id;
                    const isCompleted = row.status === 'completed' || row.status === 'confirmed';
                    return (
                      <>
                        <tr 
                          key={row.id} 
                          onClick={() => toggleExpandRow(row.id)}
                          style={{ cursor: 'pointer', transition: 'background-color 0.2s' }}
                          className={isExpanded ? 'expanded-parent-row' : ''}
                        >
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '10px', minWidth: '10px', color: 'var(--gray-500)' }}>
                                {isExpanded ? '▼' : '▶'}
                              </span>
                              {row.image_count > 0 && (
                                <span title={`มีรูปภาพแนบ ${row.image_count} รูป`} style={{ fontSize: '14px', cursor: 'pointer' }}>
                                  📷
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className="hn-text">{row.hn}</span>
                          </td>
                          <td>
                            <strong>{row.patient_name || '-'}</strong>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.9em', fontWeight: 'bold', color: 'var(--gray-700)' }}>
                              {row.clinic || '-'}
                            </span>
                          </td>
                          <td>
                            {row.doctor_name ? (
                              <span style={{ fontSize: '0.85em', color: 'var(--gray-600)' }}>
                                🩺 {row.doctor_name}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--gray-400)' }}>-</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {row.line_sent === 'Y' && (
                              <span className="badge badge-success" style={{ backgroundColor: '#e2f9e6', color: '#1b802e' }}>
                                ✅ ส่งสำเร็จ
                              </span>
                            )}
                            {row.line_sent === 'N' && (
                              <span className="badge badge-danger" style={{ backgroundColor: '#ffebee', color: '#c62828' }}>
                                ❌ ส่งล้มเหลว
                              </span>
                            )}
                            {row.line_sent === 'NO_LINE' && (
                              <span className="badge badge-warning" style={{ backgroundColor: '#fff3e0', color: '#e65100' }}>
                                ⚠️ ไม่มี LINE
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {row.status === 'pending' && (
                              <span className="badge badge-warning" style={{ borderRadius: '12px', padding: '4px 10px' }}>
                                ⏳ รอกรอกข้อมูล
                              </span>
                            )}
                            {row.status === 'completed' && (
                              <span className="badge badge-success" style={{ borderRadius: '12px', padding: '4px 10px' }}>
                                ✅ กรอกสำเร็จ
                              </span>
                            )}
                            {row.status === 'confirmed' && (
                              <span className="badge badge-success" style={{ borderRadius: '12px', padding: '4px 10px', backgroundColor: '#004d40', color: '#ffffff' }}>
                                🩺 ยืนยันแล้ว
                              </span>
                            )}
                            {row.status === 'expired' && (
                              <span className="badge badge-danger" style={{ borderRadius: '12px', padding: '4px 10px', backgroundColor: '#eeeeee', color: '#666666' }}>
                                🛑 หมดอายุ
                              </span>
                            )}
                            {row.image_count > 0 && (
                              <div style={{ marginTop: '5px' }}>
                                <span className="badge" style={{ backgroundColor: '#e0f7fa', color: '#006064', borderRadius: '12px', padding: '2px 8px', fontSize: '0.725rem', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '3px', border: '1px solid #b2ebf2' }}>
                                  📷 {row.image_count} รูป
                                </span>
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {isCompleted ? (
                              <div style={{ fontSize: '0.85em', textAlign: 'left', display: 'inline-block' }}>
                                <div>💓 <strong>Pulse:</strong> {row.pulse || '-'} bpm | 🩺 <strong>BP:</strong> {row.sbp || '-'}/{row.dbp || '-'}</div>
                                <div style={{ marginTop: '2px' }}>🌡️ <strong>Temp:</strong> {row.temperature || '-'} °C</div>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--gray-400)', fontSize: '0.9em' }}>ไม่มีข้อมูล</span>
                            )}
                          </td>
                          <td>
                            <div style={{ fontSize: '0.85em' }}>
                              <div><strong>นัด:</strong> {formatThaiDate(row.appointment_date)}</div>
                              {isCompleted && row.completed_at && (
                                <div style={{ color: 'var(--gray-500)', marginTop: '2px' }}>
                                  <strong>ส่งข้อมูล:</strong> {formatDateTime(row.completed_at)}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="expanded-details-row" style={{ backgroundColor: '#fcfdfe' }}>
                            <td colSpan="9" style={{ padding: '20px', borderLeft: '3px solid var(--primary-500)' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                                <div>
                                  <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid var(--gray-200)', paddingBottom: '5px', color: '#0056b3' }}>
                                    ข้อมูลทั่วไปและการติดต่อ
                                  </h4>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
                                    <tbody>
                                      <tr>
                                        <td style={{ padding: '4px 0', color: 'var(--gray-500)', width: '100px' }}><strong>HN:</strong></td>
                                        <td style={{ padding: '4px 0' }}>{row.hn}</td>
                                      </tr>
                                      <tr>
                                        <td style={{ padding: '4px 0', color: 'var(--gray-500)' }}><strong>ชื่อคนไข้:</strong></td>
                                        <td style={{ padding: '4px 0' }}>{row.patient_name || '-'}</td>
                                      </tr>
                                      <tr>
                                        <td style={{ padding: '4px 0', color: 'var(--gray-500)' }}><strong>ที่อยู่:</strong></td>
                                        <td style={{ padding: '4px 0', whiteSpace: 'pre-wrap' }}>{row.address || 'ไม่มีข้อมูลที่อยู่'}</td>
                                      </tr>
                                      <tr>
                                        <td style={{ padding: '4px 0', color: 'var(--gray-500)' }}><strong>รหัสไปรษณีย์:</strong></td>
                                        <td style={{ padding: '4px 0' }}>{row.postal_code || '-'}</td>
                                      </tr>
                                      <tr>
                                        <td style={{ padding: '4px 0', color: 'var(--gray-500)' }}><strong>เบอร์โทร:</strong></td>
                                        <td style={{ padding: '4px 0' }}>{row.phone || '-'}</td>
                                      </tr>
                                      <tr>
                                        <td style={{ padding: '4px 0', color: 'var(--gray-500)' }}><strong>นัดหมาย:</strong></td>
                                        <td style={{ padding: '4px 0' }}>{formatThaiDate(row.appointment_date)} ({row.note || '-'})</td>
                                      </tr>
                                      {row.line_sent_timestamp && (
                                        <tr>
                                          <td style={{ padding: '4px 0', color: 'var(--gray-500)' }}><strong>ส่ง LINE:</strong></td>
                                          <td style={{ padding: '4px 0' }}>{formatDateTime(row.line_sent_timestamp)}</td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>

                                <div>
                                  <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid var(--gray-200)', paddingBottom: '5px', color: '#0056b3' }}>
                                    ผลการคัดกรองสัญญาณชีพ
                                  </h4>
                                  {isCompleted ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 15px', fontSize: '0.9em' }}>
                                      <div>💓 <strong>ชีพจร (Pulse Rate):</strong> {row.pulse ? `${row.pulse} ครั้ง/นาที` : '-'}</div>
                                      <div>🩸 <strong>ความดันโลหิต (BP):</strong> {row.sbp || row.dbp ? `${row.sbp || '-'}/${row.dbp || '-'} mmHg` : '-'}</div>
                                      <div>🌡️ <strong>อุณหภูมิ (Temp):</strong> {row.temperature ? `${row.temperature} °C` : '-'}</div>
                                      <div>🫁 <strong>ออกซิเจน (SpO2):</strong> {row.spo2 ? `${row.spo2} %` : '-'}</div>
                                      <div>🫁 <strong>อัตราหายใจ (RR):</strong> {row.rr ? `${row.rr} ครั้ง/นาที` : '-'}</div>
                                      <div>⚖️ <strong>น้ำหนัก/ส่วนสูง:</strong> {row.weight ? `${row.weight} กก.` : '-'} / {row.height ? `${row.height} ซม.` : '-'}</div>
                                    </div>
                                  ) : (
                                    <div style={{ color: 'var(--gray-500)', fontSize: '0.9em', fontStyle: 'italic' }}>
                                      ยังไม่ได้รับการกรอกข้อมูล
                                    </div>
                                  )}
                                </div>

                                <div>
                                  <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid var(--gray-200)', paddingBottom: '5px', color: '#0056b3' }}>
                                    ข้อมูลอาการและประวัติ
                                  </h4>
                                  {isCompleted ? (
                                    <div style={{ fontSize: '0.9em' }}>
                                      <div style={{ marginBottom: '8px' }}>
                                        <strong>อาการสำคัญ (Chief Complaint):</strong>
                                        <div style={{ padding: '8px', backgroundColor: 'var(--gray-50)', borderRadius: '4px', marginTop: '4px', whiteSpace: 'pre-wrap', minHeight: '40px' }}>
                                          {row.chief_complaint || 'ไม่มีข้อมูล'}
                                        </div>
                                      </div>
                                      <div style={{ marginBottom: '8px' }}>
                                        <strong>🍺 ดื่มสุรา:</strong>{' '}
                                        {row.alcohol === 'yes' ? (
                                          <span style={{ color: '#d32f2f' }}>ดื่ม — {row.alcohol_detail || 'ไม่ระบุรายละเอียด'}</span>
                                        ) : (
                                          <span style={{ color: 'var(--gray-500)' }}>ไม่ดื่ม</span>
                                        )}
                                      </div>
                                      <div style={{ marginBottom: '8px' }}>
                                        <strong>🚬 สูบบุหรี่:</strong>{' '}
                                        {row.smoking === 'yes' ? (
                                          <span style={{ color: '#d32f2f' }}>สูบ — {row.smoking_detail || 'ไม่ระบุรายละเอียด'}</span>
                                        ) : (
                                          <span style={{ color: 'var(--gray-500)' }}>ไม่สูบ</span>
                                        )}
                                      </div>
                                      <div>
                                        <strong>ข้อมูลเพิ่มเติมจากผู้ป่วย:</strong>
                                        <div style={{ padding: '8px', backgroundColor: 'var(--gray-50)', borderRadius: '4px', marginTop: '4px', whiteSpace: 'pre-wrap' }}>
                                          {row.additional_notes || '-'}
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div style={{ color: 'var(--gray-500)', fontSize: '0.9em', fontStyle: 'italic' }}>
                                      ยังไม่มีข้อมูลการส่งฟอร์ม
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* รูปภาพแนบเพิ่มเติม */}
                              {isCompleted && (
                                <div className="image-attachments-section">
                                  <h4 className="image-attachments-title">
                                    📷 รูปภาพแนบเพิ่มเติม ({images.length} รูป)
                                  </h4>
                                  {imagesLoading ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                      <div className="spinner-sm"></div>
                                      <span style={{ fontSize: '0.875rem', color: 'var(--gray-500)' }}>
                                        กำลังโหลดรูปภาพ...
                                      </span>
                                    </div>
                                  ) : images.length > 0 ? (
                                    <div className="image-grid">
                                      {images.map((img) => (
                                        <div
                                          key={img.id}
                                          className="image-thumbnail-wrapper"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setLightboxImageSrc(`/api/prescreening/images/${img.id}`);
                                          }}
                                        >
                                          <img
                                            src={`/api/prescreening/images/${img.id}`}
                                            alt="รูปภาพคัดกรอง"
                                            className="image-thumbnail-img"
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: '0.875rem', color: 'var(--gray-400)', fontStyle: 'italic' }}>
                                      ไม่มีรูปภาพแนบสำหรับเคสนี้
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

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

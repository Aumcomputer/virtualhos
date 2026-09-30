import { useState } from 'react';
import { api } from '../api/client';
import './DataTable.css';

// Format phone number nicely e.g. 081-234-5678
function formatPhone(phone) {
  if (!phone) return '-';
  const cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 9) {
    return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 5)}-${cleaned.slice(5)}`;
  }
  return phone;
}

// Format Thai CID e.g. 1-1002-00123-45-6
function formatCid(cid) {
  if (!cid) return '';
  const cleaned = String(cid).replace(/\D/g, '');
  if (cleaned.length === 13) {
    return `${cleaned[0]}-${cleaned.slice(1, 5)}-${cleaned.slice(5, 10)}-${cleaned.slice(10, 12)}-${cleaned[12]}`;
  }
  return cid;
}

// Format Thai Date & Time
function formatThaiDateTime(dateStr) {
  if (!dateStr) return { date: '-', time: '' };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { date: '-', time: '' };

  const day = d.getDate();
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const month = months[d.getMonth()];
  const year = d.getFullYear() + 543;
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');

  return {
    date: `${day} ${month} ${year}`,
    time: `${hours}:${mins} น.`
  };
}

export default function DataTable({ data, loading, onPhoneUpdated }) {
  const [sendingId, setSendingId] = useState(null);
  const [activeSessions, setActiveSessions] = useState({});
  const [copiedHn, setCopiedHn] = useState(null);

  // Edit Phone state
  const [editingRow, setEditingRow] = useState(null);
  const [editPhone, setEditPhone] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  const handleCopyHn = (hn) => {
    if (!hn) return;
    navigator.clipboard?.writeText(hn);
    setCopiedHn(hn);
    setTimeout(() => {
      setCopiedHn(null);
    }, 2000);
  };

  const handleOpenEditPhone = (row) => {
    setEditingRow(row);
    setEditPhone(row.phone || '');
    setPhoneError('');
  };

  const handleCloseEditPhone = () => {
    setEditingRow(null);
    setEditPhone('');
    setPhoneError('');
  };

  const handleSavePhone = async (e) => {
    e.preventDefault();
    if (!editingRow) return;

    setSavingPhone(true);
    setPhoneError('');
    try {
      await api.updateLineIdPhone(editingRow.id, editPhone);
      if (onPhoneUpdated) {
        onPhoneUpdated(editingRow.id, editPhone);
      }
      handleCloseEditPhone();
    } catch (err) {
      setPhoneError(err.message || 'บันทึกเบอร์โทรศัพท์ไม่สำเร็จ');
    } finally {
      setSavingPhone(false);
    }
  };

  const handleCreateTelemedLink = async (row, channel = 'line') => {
    if (!row.hn) {
      alert('ไม่สามารถทดสอบ Telemed ได้ เนื่องจากคนไข้ไม่มีเลข HN');
      return;
    }
    if (!row.cid) {
      alert('ไม่สามารถทดสอบ Telemed ได้ เนื่องจากคนไข้ไม่มีเลขบัตรประชาชน (CID)');
      return;
    }

    const patientName = row.fullname || row.display_name || 'คนไข้';
    const uniqueSendId = `${row.id}-${channel}`;

    try {
      setSendingId(uniqueSendId);
      const res = await api.createTelemedLink(row.hn, row.cid, patientName, channel);

      // Open doctor's link in a popup window
      if (res.doctor_link) {
        const width = 1200;
        const height = 800;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        window.open(
          res.doctor_link,
          `telemed-${row.hn}-${channel}`,
          `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes,menubar=no,toolbar=no,status=no`
        );
      }

      // Mark this session as active in local state
      if (row.hn) {
        setActiveSessions(prev => ({ ...prev, [`${row.hn}-${channel}`]: true }));
      }

      console.log(`Telemed session created successfully for ${patientName}`, res);
    } catch (err) {
      console.error(err);
      alert(`เกิดข้อผิดพลาดในการสร้างลิงก์ Telemed: ${err.message}`);
    } finally {
      setSendingId(null);
    }
  };

  if (loading) {
    return (
      <div className="loa-loading">
        <div className="loa-spinner"></div>
        <span className="loa-loading-text">กำลังโหลดข้อมูลผู้ลงทะเบียน...</span>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="loa-empty">
        <div className="loa-empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </div>
        <div className="loa-empty-title">ไม่พบข้อมูลการลงทะเบียน</div>
        <div className="loa-empty-sub">ไม่มีรายชื่อผู้ป่วยที่ตรงกับเงื่อนไขการค้นหาในระบบ</div>
      </div>
    );
  }

  return (
    <>
      <div className="loa-table-container">
        <table className="loa-table">
          <thead>
            <tr>
              <th className="center" style={{ width: '48px' }}>#</th>
              <th>ผู้ป่วย / บัญชี LINE</th>
              <th>HN / เลขบัตรประชาชน</th>
              <th>เบอร์โทรศัพท์</th>
              <th>Health ID / IAL</th>
              <th>วันที่ลงทะเบียน</th>
              <th className="center" style={{ width: '190px' }}>ทดสอบ Telemed</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => {
              const dt = formatThaiDateTime(row.created_at);
              const displayName = row.display_name || '-';
              const fullName = row.fullname || displayName;
              const hasSeparateName = row.fullname && row.fullname !== row.display_name;
              const isLineSending = sendingId === `${row.id}-line`;
              const isMophSending = sendingId === `${row.id}-moph`;
              const isLineActive = row.has_telemed || activeSessions[`${row.hn}-line`];
              const isMophActive = row.has_telemed_moph || activeSessions[`${row.hn}-moph`];

              // Generate fallback initial
              const initial = (fullName.charAt(0) || '?').toUpperCase();

              return (
                <tr key={row.id}>
                  {/* # */}
                  <td className="loa-col-index">{idx + 1}</td>

                  {/* Patient Profile */}
                  <td>
                    <div className="loa-patient-cell">
                      <div className="loa-avatar-wrap">
                        {row.picture_url ? (
                          <img
                            className="loa-avatar-img"
                            src={row.picture_url}
                            alt={`${displayName} avatar`}
                            loading="lazy"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              if (e.target.nextElementSibling) {
                                e.target.nextElementSibling.style.display = 'flex';
                              }
                            }}
                          />
                        ) : null}
                        <div
                          className="loa-avatar-fallback"
                          style={{ display: row.picture_url ? 'none' : 'flex' }}
                        >
                          {initial}
                        </div>
                        <div className="loa-line-mini-badge" title="ผู้ใช้ลงทะเบียนผ่าน LINE OA">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 5.82 2 10.53c0 2.93 1.76 5.51 4.45 6.98-.19.67-.7 2.45-.8 2.83-.13.48.18.47.38.34.15-.1 2.37-1.61 3.33-2.27.84.14 1.72.22 2.64.22 5.52 0 10-3.82 10-8.53S17.52 2 12 2z"/>
                          </svg>
                        </div>
                      </div>

                      <div className="loa-patient-meta">
                        <div className="loa-patient-name" title={fullName}>
                          {fullName}
                        </div>
                        <div className="loa-patient-line" title={`LINE: ${displayName}`}>
                          <span>@{displayName}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* HN & CID */}
                  <td>
                    <div className="loa-id-cell">
                      {row.hn ? (
                        <div className="loa-hn-badge">
                          <span>HN: {row.hn}</span>
                          <button
                            type="button"
                            className="loa-copy-btn"
                            onClick={() => handleCopyHn(row.hn)}
                            title={copiedHn === row.hn ? 'คัดลอกแล้ว!' : 'คัดลอก HN'}
                          >
                            {copiedHn === row.hn ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                            )}
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>-</span>
                      )}

                      {row.cid ? (
                        <span className="loa-cid-text" title="เลขบัตรประชาชน">
                          {formatCid(row.cid)}
                        </span>
                      ) : null}
                    </div>
                  </td>

                  {/* Phone */}
                  <td>
                    <div className="loa-phone-cell">
                      <span className="loa-phone-text">{formatPhone(row.phone)}</span>
                      <button
                        type="button"
                        className="loa-phone-edit-btn"
                        onClick={() => handleOpenEditPhone(row)}
                        title="แก้ไขเบอร์โทรศัพท์"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    </div>
                  </td>

                  {/* Health ID & IAL */}
                  <td>
                    <div className="loa-status-cell">
                      {row.has_health_id ? (
                        <span className="loa-badge loa-badge-health-ok">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          ยืนยัน Health ID
                        </span>
                      ) : (
                        <span className="loa-badge loa-badge-health-none">
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8' }}></span>
                          ยังไม่ลงทะเบียน
                        </span>
                      )}

                      {row.ver ? (
                        <span className="loa-badge-ial" title={`ระดับความน่าเชื่อถือตัวตน: IAL ${row.ver}`}>
                          IAL {row.ver}
                        </span>
                      ) : null}
                    </div>
                  </td>

                  {/* Registration Date */}
                  <td>
                    <div className="loa-date-cell">
                      <span className="loa-date-primary">{dt.date}</span>
                      {dt.time && (
                        <span className="loa-date-time">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          {dt.time}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Telemed Actions */}
                  <td className="center">
                    <div className="loa-actions-cell">
                      {/* LINE Telemed */}
                      <button
                        type="button"
                        className={`loa-btn-telemed loa-btn-line ${isLineActive ? 'active' : ''}`}
                        onClick={() => handleCreateTelemedLink(row, 'line')}
                        disabled={isLineSending || !row.hn || !row.cid}
                        title={!row.hn || !row.cid ? 'ต้องมีทั้ง HN และเลขบัตรประชาชน' : 'ทดสอบโทรผ่าน LINE OA'}
                      >
                        {isLineSending ? (
                          <div className="loa-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                        ) : (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 10.999h2C22 5.869 18.127 2 12.99 2v2C17.031 4 20 7.238 20 10.999z"/>
                            <path d="M12.99 6v2c2.206 0 4 1.794 4 4h2c0-3.309-2.691-6-6-6z"/>
                            <path d="M13.782 17.568c-.689-.286-1.558-.286-2.247 0l-1.393.578a1.693 1.693 0 0 1-1.637-.168l-3.39-2.542a1.693 1.693 0 0 1-.58-1.547l.4-1.464c.2-.733-.06-1.52-.65-1.97l-1.3-1a1.693 1.693 0 0 0-2.02.046L.518 9.878a1.693 1.693 0 0 0-.5 1.574c1.17 6.438 6.47 11.738 12.908 12.908a1.693 1.693 0 0 0 1.574-.5l.407-.447a1.693 1.693 0 0 0 .046-2.02l-1.171-1.425z"/>
                          </svg>
                        )}
                        <span>LINE</span>
                      </button>

                      {/* MOPH Telemed */}
                      <button
                        type="button"
                        className={`loa-btn-telemed loa-btn-moph ${isMophActive ? 'active' : ''}`}
                        onClick={() => handleCreateTelemedLink(row, 'moph')}
                        disabled={isMophSending || !row.cid || !row.hn}
                        title={!row.cid ? 'ต้องมีเลขบัตรประชาชนเพื่อทดสอบหมอพร้อม' : 'ทดสอบโทรผ่านหมอพร้อม'}
                      >
                        {isMophSending ? (
                          <div className="loa-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                        ) : (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="23 7 16 12 23 17 23 7" />
                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                          </svg>
                        )}
                        <span>หมอพร้อม</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Edit Phone Modal */}
      {editingRow && (
        <div className="loa-modal-overlay" onClick={handleCloseEditPhone}>
          <div className="loa-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="loa-modal-header">
              <h3 className="loa-modal-title">แก้ไขเบอร์โทรศัพท์ผู้ป่วย</h3>
              <button
                type="button"
                className="loa-modal-close"
                onClick={handleCloseEditPhone}
                aria-label="ปิด"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <form onSubmit={handleSavePhone}>
              <div className="loa-modal-body">
                <div className="loa-patient-summary-box">
                  <div className="loa-summary-row">
                    <span className="loa-summary-label">ชื่อ-นามสกุล</span>
                    <span className="loa-summary-value">{editingRow.fullname || editingRow.display_name || '-'}</span>
                  </div>
                  <div className="loa-summary-row">
                    <span className="loa-summary-label">HN ผู้ป่วย</span>
                    <span className="loa-summary-value" style={{ fontFamily: 'monospace' }}>{editingRow.hn || '-'}</span>
                  </div>
                  {editingRow.display_name && (
                    <div className="loa-summary-row">
                      <span className="loa-summary-label">ชื่อ LINE</span>
                      <span className="loa-summary-value">@{editingRow.display_name}</span>
                    </div>
                  )}
                </div>

                <div className="loa-form-field">
                  <label className="loa-form-label" htmlFor="edit-phone-input">
                    เบอร์โทรศัพท์ (มือถือ)
                  </label>
                  <input
                    id="edit-phone-input"
                    className="loa-form-input"
                    type="tel"
                    placeholder="เช่น 0812345678"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    autoFocus
                    maxLength={20}
                  />
                </div>

                {phoneError && (
                  <div className="loa-form-error">
                    {phoneError}
                  </div>
                )}
              </div>

              <div className="loa-modal-footer">
                <button
                  type="button"
                  className="loa-btn loa-btn-secondary"
                  onClick={handleCloseEditPhone}
                  disabled={savingPhone}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="loa-btn loa-btn-primary"
                  disabled={savingPhone}
                >
                  {savingPhone ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

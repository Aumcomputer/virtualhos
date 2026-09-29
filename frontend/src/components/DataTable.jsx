import { useState } from 'react';
import { api } from '../api/client';

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear() + 543; // พ.ศ.
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${mins}`;
}

export default function DataTable({ data, loading, onPhoneUpdated }) {
  const [sendingId, setSendingId] = useState(null);
  const [activeSessions, setActiveSessions] = useState({});

  // Edit Phone state
  const [editingRow, setEditingRow] = useState(null);
  const [editPhone, setEditPhone] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState('');

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
      
      // Open doctor's link in a new popup window
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

      // Mark this session as active in local state to change button color immediately
      if (row.hn) {
        setActiveSessions(prev => ({ ...prev, [`${row.hn}-${channel}`]: true }));
      }

      // Quietly log status to console without interrupting UI
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
      <div className="loading-container">
        <div className="spinner"></div>
        <span className="loading-text">กำลังโหลดข้อมูล...</span>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📭</div>
        <div className="empty-state-title">ไม่พบข้อมูล</div>
        <div className="empty-state-text">ไม่มีข้อมูลการลงทะเบียนที่ตรงกับเงื่อนไข</div>
      </div>
    );
  }

  return (
    <>
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>รูป</th>
              <th>Profile Name</th>
              <th>HN</th>
              <th>ชื่อ-นามสกุล</th>
              <th>เบอร์โทร</th>
              <th>IAL level</th>
              <th>วันที่สมัคร</th>
              <th>Health ID</th>
              <th style={{ textAlign: 'center' }}>ทดสอบ Telemed Line OA</th>
              <th style={{ textAlign: 'center' }}>ทดสอบ Telemed หมอพร้อม</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={row.id}>
                <td>{idx + 1}</td>
                <td>
                  {row.picture_url ? (
                    <img
                      className="table-avatar"
                      src={row.picture_url}
                      alt={`${row.display_name} avatar`}
                      loading="lazy"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    className="table-avatar-placeholder"
                    style={{ display: row.picture_url ? 'none' : 'flex' }}
                  >
                    👤
                  </div>
                </td>
                <td>{row.display_name || '-'}</td>
                <td>
                  {row.hn ? (
                    <span className="hn-text">{row.hn}</span>
                  ) : (
                    <span style={{ color: 'var(--gray-400)' }}>-</span>
                  )}
                </td>
                <td>{row.fullname || '-'}</td>
                <td className="phone-cell">
                  <div className="phone-content-wrapper">
                    <span className="phone-text">{row.phone || '-'}</span>
                    <button
                      type="button"
                      className="btn-edit-phone"
                      onClick={() => handleOpenEditPhone(row)}
                      title="แก้ไขเบอร์โทรศัพท์"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      <span>แก้ไข</span>
                    </button>
                  </div>
                </td>
                <td>
                  {row.ver ? (
                    <span className="ver-badge">{row.ver}</span>
                  ) : (
                    <span style={{ color: 'var(--gray-400)' }}>-</span>
                  )}
                </td>
                <td>
                  <span className="date-text">{formatDate(row.created_at)}</span>
                </td>
                <td>
                  {row.has_health_id ? (
                    <span className="badge badge-success">ลงทะเบียนแล้ว</span>
                  ) : (
                    <span className="badge badge-warning">ยังไม่ลงทะเบียน</span>
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button
                    className={`btn-telemed ${(row.has_telemed || activeSessions[`${row.hn}-line`]) ? 'active' : ''}`}
                    onClick={() => handleCreateTelemedLink(row, 'line')}
                    disabled={sendingId === `${row.id}-line`}
                  >
                    {sendingId === `${row.id}-line` ? '...' : 'Call'}
                  </button>
                </td>
                <td style={{ textAlign: 'center' }}>
                  {row.cid ? (
                    <button
                      className={`btn-telemed ${(row.has_telemed_moph || activeSessions[`${row.hn}-moph`]) ? 'active' : ''}`}
                      onClick={() => handleCreateTelemedLink(row, 'moph')}
                      disabled={sendingId === `${row.id}-moph`}
                    >
                      {sendingId === `${row.id}-moph` ? '...' : 'Call'}
                    </button>
                  ) : (
                    <span style={{ color: 'var(--gray-400)' }}>-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Phone Modal */}
      {editingRow && (
        <div className="modal-overlay" onClick={handleCloseEditPhone}>
          <div className="modal-content edit-phone-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">แก้ไขเบอร์โทรศัพท์</h3>
              <button
                type="button"
                className="modal-close"
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
              <div className="modal-body">
                <div className="patient-info-summary">
                  <div className="patient-info-item">
                    <span className="label">ชื่อ-นามสกุล:</span>
                    <span className="value">{editingRow.fullname || editingRow.display_name || '-'}</span>
                  </div>
                  <div className="patient-info-item">
                    <span className="label">HN:</span>
                    <span className="value font-mono">{editingRow.hn || '-'}</span>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="edit-phone-input">
                    เบอร์โทรศัพท์
                  </label>
                  <input
                    id="edit-phone-input"
                    className="form-input"
                    type="tel"
                    placeholder="กรอกเบอร์โทรศัพท์ เช่น 0812345678"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    autoFocus
                    maxLength={20}
                  />
                </div>

                {phoneError && (
                  <div className="modal-error">
                    {phoneError}
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingPhone}
                >
                  {savingPhone ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
                <button
                  type="button"
                  className="btn btn-cancel"
                  onClick={handleCloseEditPhone}
                  disabled={savingPhone}
                >
                  ยกเลิก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

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

export default function DataTable({ data, loading }) {
  const [sendingId, setSendingId] = useState(null);
  const [activeSessions, setActiveSessions] = useState({});

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
      alert(`❌ เกิดข้อผิดพลาดในการสร้างลิงก์ Telemed: ${err.message}`);
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
              <td>
                {row.phone ? (
                  <span className="phone-text">{row.phone}</span>
                ) : (
                  <span style={{ color: 'var(--gray-400)' }}>-</span>
                )}
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
                  <span className="badge badge-success">✅ ลงทะเบียนแล้ว</span>
                ) : (
                  <span className="badge badge-warning">❌ ยังไม่ลงทะเบียน</span>
                )}
              </td>
              <td style={{ textAlign: 'center' }}>
                <button
                  className={`btn-telemed ${(row.has_telemed || activeSessions[`${row.hn}-line`]) ? 'active' : ''}`}
                  onClick={() => handleCreateTelemedLink(row, 'line')}
                  disabled={sendingId === `${row.id}-line`}
                >
                  {sendingId === `${row.id}-line` ? '⏳...' : '📞 Call'}
                </button>
              </td>
              <td style={{ textAlign: 'center' }}>
                {row.cid ? (
                  <button
                    className={`btn-telemed ${(row.has_telemed_moph || activeSessions[`${row.hn}-moph`]) ? 'active' : ''}`}
                    onClick={() => handleCreateTelemedLink(row, 'moph')}
                    disabled={sendingId === `${row.id}-moph`}
                  >
                    {sendingId === `${row.id}-moph` ? '⏳...' : '📞 Call'}
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
  );
}

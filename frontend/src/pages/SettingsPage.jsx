import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

function formatDateTime(dateTimeStr) {
  if (!dateTimeStr) return '—';
  const d = new Date(dateTimeStr);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear() + 543;
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${mins} น.`;
}

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [adminUsers, setAdminUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Pre-screening Cron Settings States
  const [cronTime, setCronTime] = useState('08:00');
  const [cronLogs, setCronLogs] = useState([]);
  const [cronSaving, setCronSaving] = useState(false);
  const [cronLogsLoading, setCronLogsLoading] = useState(false);
  const [manualTriggerLoading, setManualTriggerLoading] = useState(false);

  // Redirect non-admin users
  useEffect(() => {
    if (!isAdmin) {
      navigate('/', { replace: true });
    }
  }, [isAdmin, navigate]);

  const fetchAdminUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getAdminUsers();
      setAdminUsers(result.data);
    } catch (err) {
      console.error('Failed to fetch admin users');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCronSettings = useCallback(async () => {
    try {
      const res = await api.getCronSettings();
      setCronTime(res.time);
    } catch (err) {
      console.error('Failed to fetch cron settings:', err.message);
    }
  }, []);

  const fetchCronLogs = useCallback(async () => {
    setCronLogsLoading(true);
    try {
      const res = await api.getCronLogs();
      setCronLogs(res);
    } catch (err) {
      console.error('Failed to fetch cron logs:', err.message);
    } finally {
      setCronLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchAdminUsers();
      fetchCronSettings();
      fetchCronLogs();
    }
  }, [fetchAdminUsers, fetchCronSettings, fetchCronLogs, isAdmin]);

  const ROLE_CYCLE = {
    admin: 'request_telemed',
    request_telemed: 'viewer',
    viewer: 'admin',
  };

  const ROLE_CONFIG = {
    admin: { label: 'Admin', icon: '🛡️', badgeClass: 'role-admin' },
    request_telemed: { label: 'Request Telemed', icon: '📦', badgeClass: 'role-request_telemed' },
    viewer: { label: 'Viewer', icon: '👁️', badgeClass: 'role-viewer' },
  };

  const handleToggleRole = async (user) => {
    const nextRole = ROLE_CYCLE[user.role] || 'viewer';
    setActionLoading(user.id);
    try {
      await api.updateAdminUser(user.id, { role: nextRole });
      await fetchAdminUsers();
    } catch (err) {
      console.error('Failed to update role');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id) => {
    setActionLoading(id);
    try {
      await api.deleteAdminUser(id);
      setDeleteConfirmId(null);
      await fetchAdminUsers();
    } catch (err) {
      console.error('Failed to delete user');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUserAdded = () => {
    setShowModal(false);
    fetchAdminUsers();
  };

  const handleSaveCronSettings = async () => {
    setCronSaving(true);
    try {
      await api.updateCronSettings(cronTime);
      alert('💾 บันทึกเวลาดึงข้อมูลและปรับปรุงตารางเวลาทำงานเรียบร้อยแล้ว');
      fetchCronLogs();
    } catch (err) {
      alert(`❌ เกิดข้อผิดพลาดในการบันทึก: ${err.message}`);
    } finally {
      setCronSaving(false);
    }
  };

  const handleRunCronNow = async () => {
    if (!window.confirm('คุณต้องการสั่งให้ระบบดึงข้อมูลนัดหมายคัดกรองเบื้องต้นสำหรับวันพรุ่งนี้ และส่งข้อความ LINE ไปยังคนไข้แต่ละคนทันทีใช่หรือไม่?')) {
      return;
    }

    setManualTriggerLoading(true);
    try {
      const res = await api.runCronNow();
      alert(`รันระบบคัดกรองสำเร็จ!\n- พบนัดหมายใหม่: ${res.summary.recordsFound} รายการ\n- บันทึกเข้าคัดกรอง: ${res.summary.recordsInserted} รายการ\n- ส่ง LINE OA สำเร็จ: ${res.summary.lineSentCount} รายการ\n- ส่ง LINE OA ล้มเหลว/มีปัญหา: ${res.summary.lineFailedCount} รายการ`);
      fetchCronLogs();
    } catch (err) {
      alert(`❌ เกิดข้อผิดพลาดในการรันระบบ: ${err.message}`);
    } finally {
      setManualTriggerLoading(false);
    }
  };

  if (!isAdmin) return null;

  const totalAdmin = adminUsers.filter((u) => u.role === 'admin').length;
  const totalViewer = adminUsers.filter((u) => u.role === 'viewer').length;
  const totalRequestTelemed = adminUsers.filter((u) => u.role === 'request_telemed').length;

  return (
    <>
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h2 className="page-title">ตั้งค่าผู้ใช้งาน</h2>
            <p className="page-subtitle">จัดการรายชื่อผู้ใช้ที่สามารถเข้าสู่ระบบหลังบ้านได้</p>
          </div>
          <button
            className="btn btn-add-user"
            onClick={() => setShowModal(true)}
            type="button"
            id="btn-add-admin-user"
          >
            <span>➕</span>
            เพิ่มผู้ใช้งาน
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">ผู้ใช้งานทั้งหมด</div>
            <div className="stat-value primary">{adminUsers.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Admin</div>
            <div className="stat-value accent">{totalAdmin}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Request Telemed</div>
            <div className="stat-value" style={{ color: '#7c3aed' }}>{totalRequestTelemed}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Viewer</div>
            <div className="stat-value">{totalViewer}</div>
          </div>
        </div>

        {/* Table */}
        <div className="table-card">
          {loading ? (
            <div className="loading-container">
              <div className="spinner" />
              <div className="loading-text">กำลังโหลดข้อมูล...</div>
            </div>
          ) : adminUsers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">👤</div>
              <div className="empty-state-title">ยังไม่มีผู้ใช้งาน</div>
              <div className="empty-state-text">
                กดปุ่ม &quot;เพิ่มผู้ใช้งาน&quot; เพื่อเริ่มเพิ่มผู้ใช้ที่สามารถเข้าสู่ระบบได้
              </div>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table" id="admin-users-table">
                <thead>
                  <tr>
                    <th>ชื่อผู้ใช้งาน</th>
                    <th>ชื่อ-นามสกุล</th>
                    <th>Role</th>
                    <th>สถานะ</th>
                    <th>เพิ่มโดย</th>
                    <th>วันที่เพิ่ม</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <span className="admin-username">{u.username}</span>
                      </td>
                      <td>{u.display_name || '—'}</td>
                      <td>
                        <span className={`role-badge ${ROLE_CONFIG[u.role]?.badgeClass || 'role-viewer'}`}>
                          {ROLE_CONFIG[u.role] ? `${ROLE_CONFIG[u.role].icon} ${ROLE_CONFIG[u.role].label}` : u.role}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${u.is_active ? 'badge-success' : 'badge-warning'}`}>
                          {u.is_active ? '✓ Active' : '⏸ Inactive'}
                        </span>
                      </td>
                      <td className="date-text">{u.created_by || '—'}</td>
                      <td className="date-text">
                        {u.created_at
                          ? new Date(u.created_at).toLocaleDateString('th-TH', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td>
                        <div className="admin-actions">
                          <button
                            className="btn-action btn-role-toggle"
                            onClick={() => handleToggleRole(u)}
                            disabled={actionLoading === u.id}
                            title={`เปลี่ยนเป็น ${ROLE_CONFIG[ROLE_CYCLE[u.role] || 'viewer']?.label}`}
                            type="button"
                          >
                            🔄
                          </button>
                          {deleteConfirmId === u.id ? (
                            <div className="delete-confirm-inline">
                              <button
                                className="btn-action btn-confirm-yes"
                                onClick={() => handleDelete(u.id)}
                                disabled={actionLoading === u.id}
                                type="button"
                              >
                                ✓ ยืนยัน
                              </button>
                              <button
                                className="btn-action btn-confirm-no"
                                onClick={() => setDeleteConfirmId(null)}
                                type="button"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              className="btn-action btn-delete"
                              onClick={() => setDeleteConfirmId(u.id)}
                              disabled={actionLoading === u.id}
                              title="ลบผู้ใช้งาน"
                              type="button"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pre-screening Cron Settings */}
        <div className="page-header" style={{ marginTop: '40px', paddingBottom: '10px' }}>
          <div className="page-title-row">
            <div>
              <h2 className="page-title">⚙️ ตั้งค่าระบบคัดกรองอัตโนมัติ (Cron Job)</h2>
              <p className="page-subtitle">จัดการเวลาการดึงข้อมูลและติดตามประวัติการรันระบบดึงข้อมูลนัดหมาย Telemed อัตโนมัติ</p>
            </div>
          </div>
        </div>

        <div className="table-card" style={{ padding: '25px', marginBottom: '30px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px', alignItems: 'flex-start' }}>
            <div style={{ flex: '1', minWidth: '300px' }}>
              <h3 style={{ margin: '0 0 15px 0', fontSize: '1.2em', color: '#0056b3' }}>⚙️ ตั้งค่าเวลาการทำงาน</h3>
              <p style={{ fontSize: '0.9em', color: 'var(--gray-600)', margin: '0 0 20px 0' }}>
                ระบบจะดึงนัดหมายผู้ป่วยใน HOSxP ที่นัดตรวจ Telemed ในวันถัดไปโดยอัตโนมัติตามเวลาที่กำหนด 
                และจะส่งลิงก์แบบคัดกรองทาง LINE OA ให้กับคนไข้
              </p>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label htmlFor="cron-time-input" style={{ fontSize: '0.85em', fontWeight: 'bold', marginBottom: '5px', color: 'var(--gray-700)' }}>
                    เวลาการทำงาน (HH:mm)
                  </label>
                  <input
                    id="cron-time-input"
                    className="date-picker-input"
                    type="time"
                    value={cronTime}
                    onChange={(e) => setCronTime(e.target.value)}
                    style={{ fontSize: '1.1em', padding: '8px 12px', width: '150px' }}
                  />
                </div>
                <button
                  className="btn btn-add-user"
                  onClick={handleSaveCronSettings}
                  disabled={cronSaving}
                  style={{ marginTop: '23px', minWidth: '100px', height: '40px' }}
                  type="button"
                >
                  {cronSaving ? '⏳...' : '💾 บันทึกเวลา'}
                </button>
              </div>
            </div>

            <div style={{ flex: '1', minWidth: '300px', borderLeft: '1px solid var(--gray-200)', paddingLeft: '30px' }}>
              <h3 style={{ margin: '0 0 15px 0', fontSize: '1.2em', color: '#1b802e' }}>🚀 รันระบบทันที (Manual Trigger)</h3>
              <p style={{ fontSize: '0.9em', color: 'var(--gray-600)', margin: '0 0 20px 0' }}>
                หากต้องการดึงข้อมูลนัดหมายและส่งลิงก์ LINE คัดกรองสำหรับวันพรุ่งนี้ทันที โดยไม่ต้องรอเวลาทำงานอัตโนมัติ 
                ท่านสามารถกดปุ่มเพื่อเริ่มกระบวนการทันที
              </p>
              <button
                className="btn btn-add-user"
                onClick={handleRunCronNow}
                disabled={manualTriggerLoading}
                style={{ backgroundColor: '#28a745', borderColor: '#28a745', height: '40px' }}
                type="button"
              >
                {manualTriggerLoading ? '⏳ กำลังประมวลผลดึงนัดและส่ง LINE...' : '🚀 สั่งดึงนัดหมายและส่งข้อความทันที'}
              </button>
            </div>
          </div>
        </div>

        {/* Cron Job Logs */}
        <div className="table-card" style={{ marginTop: '20px' }}>
          <div className="table-toolbar">
            <h3 style={{ margin: 0, fontSize: '1.1em', color: 'var(--gray-800)' }}>🕒 ประวัติการทำงานล่าสุด (10 รายการล่าสุด)</h3>
            <button 
              className="btn-action" 
              onClick={fetchCronLogs}
              title="รีเฟรชประวัติ"
              style={{ padding: '5px 10px', fontSize: '0.9em', backgroundColor: 'var(--gray-100)', borderRadius: '4px' }}
              type="button"
            >
              🔄 รีเฟรช
            </button>
          </div>

          {cronLogsLoading ? (
            <div className="loading-container">
              <div className="spinner" />
              <div className="loading-text">กำลังโหลดประวัติการทำงาน...</div>
            </div>
          ) : cronLogs.length === 0 ? (
            <div className="empty-state" style={{ padding: '30px 0' }}>
              <div className="empty-state-icon">🕒</div>
              <div className="empty-state-title">ไม่พบประวัติการทำงาน</div>
              <div className="empty-state-text">ระบบยังไม่เคยมีบันทึกการทำงานของ Cron Job</div>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table" style={{ fontSize: '0.9em' }}>
                <thead>
                  <tr>
                    <th>วันเวลาเริ่มต้น</th>
                    <th>วันเวลาเสร็จสิ้น</th>
                    <th>สถานะการทำงาน</th>
                    <th style={{ textAlign: 'center' }}>พบนัดหมาย (ราย)</th>
                    <th style={{ textAlign: 'center' }}>บันทึกสำเร็จ (ราย)</th>
                    <th style={{ textAlign: 'center' }}>ส่ง LINE สำเร็จ</th>
                    <th style={{ textAlign: 'center' }}>ส่ง LINE ล้มเหลว</th>
                    <th>รายละเอียดเพิ่มเติม / ข้อผิดพลาด</th>
                  </tr>
                </thead>
                <tbody>
                  {cronLogs.slice(0, 10).map((log) => (
                    <tr key={log.id}>
                      <td className="date-text"><strong>{formatDateTime(log.started_at)}</strong></td>
                      <td className="date-text">{log.completed_at ? formatDateTime(log.completed_at) : '—'}</td>
                      <td>
                        {log.status === 'started' && (
                          <span className="badge badge-warning" style={{ backgroundColor: '#fff9c4', color: '#f57f17' }}>
                            ⏳ กำลังทำงาน
                          </span>
                        )}
                        {log.status === 'success' && (
                          <span className="badge badge-success">
                            ✅ สำเร็จ
                          </span>
                        )}
                        {log.status === 'failed' && (
                          <span className="badge badge-danger">
                            ❌ ล้มเหลว
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{log.records_found}</td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--primary-600)' }}>{log.records_inserted}</td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#2e7d32' }}>{log.line_sent_count}</td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#c62828' }}>{log.line_failed_count}</td>
                      <td style={{ whiteSpace: 'normal', wordBreak: 'break-word', color: log.status === 'failed' ? '#c62828' : 'var(--gray-600)' }}>
                        {log.error_message || (log.status === 'success' ? 'ทำงานสมบูรณ์' : 'กำลังดำเนินการ...')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add User Modal */}
      {showModal && (
        <AddUserModal onClose={() => setShowModal(false)} onSuccess={handleUserAdded} />
      )}
    </>
  );
}

// ============================================================================
// AddUserModal — search opduser + select role + add
// ============================================================================
function AddUserModal({ onClose, onSuccess }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState('viewer');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const searchTimerRef = useRef(null);
  const modalContentRef = useRef(null);

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const result = await api.searchOpdUser(searchQuery.trim());
        setSearchResults(result.data);
      } catch (err) {
        console.error('Search failed');
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  // Close on clicking outside modal content
  const handleOverlayClick = (e) => {
    if (modalContentRef.current && !modalContentRef.current.contains(e.target)) {
      onClose();
    }
  };

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSelectUser = (user) => {
    setSelectedUser(user);
    setSearchQuery('');
    setSearchResults([]);
    setError('');
  };

  const handleSubmit = async () => {
    if (!selectedUser) {
      setError('กรุณาเลือกผู้ใช้งาน');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await api.addAdminUser(selectedUser.loginname, selectedUser.name, selectedRole);
      onSuccess();
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick} role="presentation">
      <div className="modal-content" ref={modalContentRef} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h3 className="modal-title">เพิ่มผู้ใช้งานระบบ</h3>
          <button className="modal-close" onClick={onClose} type="button" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* Selected User Preview */}
          {selectedUser && (
            <div className="selected-user-card">
              <div className="selected-user-info">
                <div className="selected-user-avatar">
                  {selectedUser.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div>
                  <div className="selected-user-name">{selectedUser.name}</div>
                  <div className="selected-user-login">{selectedUser.loginname}</div>
                  {selectedUser.department && (
                    <div className="selected-user-dept">{selectedUser.department}</div>
                  )}
                </div>
              </div>
              <button
                className="btn-action btn-remove-selected"
                onClick={() => setSelectedUser(null)}
                type="button"
              >
                ✕
              </button>
            </div>
          )}

          {/* Search */}
          {!selectedUser && (
            <div className="modal-search-section">
              <label className="form-label" htmlFor="search-opduser-input">
                ค้นหาผู้ใช้งาน (ชื่อ หรือ Username)
              </label>
              <div className="search-box modal-search-box">
                <span className="search-icon">🔍</span>
                <input
                  className="search-input"
                  type="text"
                  placeholder="พิมพ์อย่างน้อย 2 ตัวอักษร..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  id="search-opduser-input"
                  autoFocus
                  autoComplete="off"
                />
              </div>

              {/* Search Results Dropdown */}
              {(searching || searchResults.length > 0) && (
                <div className="search-results-dropdown">
                  {searching ? (
                    <div className="search-results-loading">
                      <div className="spinner-sm" />
                      <span>กำลังค้นหา...</span>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="search-results-empty">ไม่พบผู้ใช้งาน</div>
                  ) : (
                    searchResults.map((u) => (
                      <button
                        key={u.loginname}
                        className="search-result-item"
                        onClick={() => handleSelectUser(u)}
                        type="button"
                      >
                        <div className="search-result-avatar">
                          {u.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div className="search-result-info">
                          <div className="search-result-name">{u.name}</div>
                          <div className="search-result-meta">
                            {u.loginname}
                            {u.department ? ` · ${u.department}` : ''}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Role Selection */}
          <div className="role-selection">
            <label className="form-label">เลือก Role</label>
            <div className="role-options">
              <label
                className={`role-option ${selectedRole === 'admin' ? 'selected' : ''}`}
                htmlFor="role-admin"
              >
                <input
                  type="radio"
                  name="role"
                  value="admin"
                  id="role-admin"
                  checked={selectedRole === 'admin'}
                  onChange={() => setSelectedRole('admin')}
                />
                <div className="role-option-content">
                  <span className="role-option-icon">🛡️</span>
                  <div>
                    <div className="role-option-title">Admin</div>
                    <div className="role-option-desc">จัดการผู้ใช้งาน, สร้างลิงก์ Telemed</div>
                  </div>
                </div>
              </label>
              <label
                className={`role-option ${selectedRole === 'request_telemed' ? 'selected' : ''}`}
                htmlFor="role-request-telemed"
              >
                <input
                  type="radio"
                  name="role"
                  value="request_telemed"
                  id="role-request-telemed"
                  checked={selectedRole === 'request_telemed'}
                  onChange={() => setSelectedRole('request_telemed')}
                />
                <div className="role-option-content">
                  <span className="role-option-icon">📦</span>
                  <div>
                    <div className="role-option-title">Request Telemed</div>
                    <div className="role-option-desc">เข้าถึงเฉพาะเมนู Line OA และ Request Telemed</div>
                  </div>
                </div>
              </label>
              <label
                className={`role-option ${selectedRole === 'viewer' ? 'selected' : ''}`}
                htmlFor="role-viewer"
              >
                <input
                  type="radio"
                  name="role"
                  value="viewer"
                  id="role-viewer"
                  checked={selectedRole === 'viewer'}
                  onChange={() => setSelectedRole('viewer')}
                />
                <div className="role-option-content">
                  <span className="role-option-icon">👁️</span>
                  <div>
                    <div className="role-option-title">Viewer</div>
                    <div className="role-option-desc">ดูข้อมูลได้อย่างเดียว</div>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Error */}
          {error && <div className="modal-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-cancel" onClick={onClose} type="button">
            ยกเลิก
          </button>
          <button
            className="btn btn-save"
            onClick={handleSubmit}
            disabled={!selectedUser || saving}
            type="button"
            id="btn-save-admin-user"
          >
            {saving ? 'กำลังบันทึก...' : '💾 บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import './SettingsPage.css';

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

function formatDateOnly(dateTimeStr) {
  if (!dateTimeStr) return '—';
  const d = new Date(dateTimeStr);
  if (isNaN(d.getTime())) return '—';
  const day = d.getDate();
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const month = months[d.getMonth()];
  const year = d.getFullYear() + 543;
  return `${day} ${month} ${year}`;
}

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'cron'
  const [adminUsers, setAdminUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRoleUser, setEditingRoleUser] = useState(null);
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

  const ROLE_CONFIG = {
    admin: { label: 'Admin', icon: '🛡️', badgeClass: 'settings-role-admin' },
    request_telemed: { label: 'Request Telemed', icon: '📦', badgeClass: 'settings-role-request_telemed' },
    viewer: { label: 'Viewer', icon: '👁️', badgeClass: 'settings-role-viewer' },
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

  const handleRoleUpdated = () => {
    setEditingRoleUser(null);
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
            <h2 className="page-title">ตั้งค่าระบบและผู้ใช้งาน</h2>
            <p className="page-subtitle">จัดการสิทธิ์บัญชีผู้ใช้ และตั้งค่าการดึงข้อมูลคัดกรองอัตโนมัติ</p>
          </div>
          {activeTab === 'users' && (
            <button
              className="btn btn-primary"
              onClick={() => setShowModal(true)}
              type="button"
              id="btn-add-admin-user"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              เพิ่มผู้ใช้งาน
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        {/* Navigation Tabs */}
        <div className="settings-tabs-container">
          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>ผู้ใช้งานและสิทธิ์</span>
            <span className="settings-tab-badge">{adminUsers.length}</span>
          </button>

          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'cron' ? 'active' : ''}`}
            onClick={() => setActiveTab('cron')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>ระบบคัดกรองอัตโนมัติ (Cron)</span>
          </button>
        </div>

        {/* TAB 1: USERS MANAGEMENT */}
        {activeTab === 'users' && (
          <>
            {/* Stats Row */}
            <div className="settings-stats-grid">
              <div className="settings-stat-card">
                <div>
                  <div className="settings-stat-label">ผู้ใช้งานทั้งหมด</div>
                  <div className="settings-stat-value">{adminUsers.length}</div>
                  <div className="settings-stat-sub">บัญชีที่ได้รับสิทธิ์ในระบบ</div>
                </div>
                <div className="settings-stat-icon blue">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
              </div>

              <div className="settings-stat-card">
                <div>
                  <div className="settings-stat-label">Admin</div>
                  <div className="settings-stat-value" style={{ color: '#be123c' }}>{totalAdmin}</div>
                  <div className="settings-stat-sub">สิทธิ์ผู้ดูแลระบบสูงสุด</div>
                </div>
                <div className="settings-stat-icon rose">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
              </div>

              <div className="settings-stat-card">
                <div>
                  <div className="settings-stat-label">Request Telemed</div>
                  <div className="settings-stat-value" style={{ color: '#7c3aed' }}>{totalRequestTelemed}</div>
                  <div className="settings-stat-sub">สิทธิ์จัดการคำขอและยา</div>
                </div>
                <div className="settings-stat-icon purple">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  </svg>
                </div>
              </div>

              <div className="settings-stat-card">
                <div>
                  <div className="settings-stat-label">Viewer</div>
                  <div className="settings-stat-value" style={{ color: '#475569' }}>{totalViewer}</div>
                  <div className="settings-stat-sub">สิทธิ์ดูรายงานอย่างเดียว</div>
                </div>
                <div className="settings-stat-icon slate">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Users Table Card */}
            <div className="settings-table-card">
              <div className="settings-table-toolbar">
                <h3 className="settings-table-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                  </svg>
                  รายชื่อผู้ใช้งานในระบบ
                </h3>
              </div>

              {loading ? (
                <div className="loading-container">
                  <div className="spinner" />
                  <div className="loading-text">กำลังโหลดข้อมูลผู้ใช้งาน...</div>
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
                <div className="settings-table-container">
                  <table className="settings-table" id="admin-users-table">
                    <thead>
                      <tr>
                        <th>ผู้ใช้งาน (User Profile)</th>
                        <th>Role / สิทธิ์การใช้งาน</th>
                        <th>สถานะ</th>
                        <th>เพิ่มโดย</th>
                        <th>วันที่เพิ่ม</th>
                        <th style={{ textAlign: 'center', width: '130px' }}>จัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminUsers.map((u) => {
                        const initial = (u.display_name?.charAt(0) || u.username?.charAt(0) || '?').toUpperCase();
                        const roleMeta = ROLE_CONFIG[u.role] || { label: u.role, icon: '👤', badgeClass: 'settings-role-viewer' };

                        return (
                          <tr key={u.id}>
                            {/* Profile (Name & Username) */}
                            <td>
                              <div className="settings-user-cell">
                                <div className="settings-user-avatar">
                                  {initial}
                                </div>
                                <div className="settings-user-meta">
                                  <span className="settings-user-name">{u.display_name || u.username}</span>
                                  <span className="settings-user-login">@{u.username}</span>
                                </div>
                              </div>
                            </td>

                            {/* Role Badge */}
                            <td>
                              <span className={`settings-role-badge ${roleMeta.badgeClass}`}>
                                <span>{roleMeta.icon}</span>
                                <span>{roleMeta.label}</span>
                              </span>
                            </td>

                            {/* Status Badge */}
                            <td>
                              {u.is_active ? (
                                <span className="settings-status-active">
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#059669' }}></span>
                                  ใช้งานอยู่
                                </span>
                              ) : (
                                <span className="settings-status-inactive">
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8' }}></span>
                                  ปิดใช้งาน
                                </span>
                              )}
                            </td>

                            {/* Created By */}
                            <td>
                              <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                                {u.created_by || '—'}
                              </span>
                            </td>

                            {/* Created At */}
                            <td>
                              <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                                {formatDateOnly(u.created_at)}
                              </span>
                            </td>

                            {/* Actions */}
                            <td style={{ textAlign: 'center' }}>
                              <div className="settings-actions-group" style={{ justifyContent: 'center' }}>
                                {/* Edit Role Button */}
                                <button
                                  className="settings-btn-icon"
                                  onClick={() => setEditingRoleUser(u)}
                                  title="แก้ไขและเลือกสิทธิ์การใช้งาน"
                                  type="button"
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                  </svg>
                                </button>

                                {/* Delete with Confirm */}
                                {deleteConfirmId === u.id ? (
                                  <div className="settings-delete-confirm-box">
                                    <button
                                      className="settings-btn-confirm-yes"
                                      onClick={() => handleDelete(u.id)}
                                      disabled={actionLoading === u.id}
                                      type="button"
                                    >
                                      ยืนยัน
                                    </button>
                                    <button
                                      className="settings-btn-confirm-no"
                                      onClick={() => setDeleteConfirmId(null)}
                                      type="button"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    className="settings-btn-icon delete"
                                    onClick={() => setDeleteConfirmId(u.id)}
                                    disabled={actionLoading === u.id}
                                    title="ลบผู้ใช้งาน"
                                    type="button"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* TAB 2: CRON JOB & AUTOMATION */}
        {activeTab === 'cron' && (
          <>
            {/* Action Cards */}
            <div className="cron-cards-grid">
              {/* Card 1: Time Settings */}
              <div className="cron-config-card">
                <div>
                  <div className="cron-card-header">
                    <div className="cron-card-icon blue">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="cron-card-title">ตั้งเวลาทำงานอัตโนมัติ (Schedule)</h4>
                      <p className="cron-card-desc">
                        ระบบจะดึงนัดหมายตรวจ Telemed ในวันถัดไปจาก HOSxP อัตโนมัติตามเวลาที่กำหนด และส่งลิงก์แบบคัดกรองทาง LINE OA ให้คนไข้
                      </p>
                    </div>
                  </div>
                </div>

                <div className="cron-time-input-group">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>เวลาทำงานประจำวัน</span>
                    <input
                      id="cron-time-input"
                      className="cron-time-input"
                      type="time"
                      value={cronTime}
                      onChange={(e) => setCronTime(e.target.value)}
                    />
                  </div>
                  <button
                    className="cron-btn cron-btn-blue"
                    onClick={handleSaveCronSettings}
                    disabled={cronSaving}
                    type="button"
                  >
                    {cronSaving ? 'กำลังบันทึก...' : 'บันทึกเวลา'}
                  </button>
                </div>
              </div>

              {/* Card 2: Manual Trigger */}
              <div className="cron-config-card">
                <div>
                  <div className="cron-card-header">
                    <div className="cron-card-icon green">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="cron-card-title">สั่งรันระบบทันที (Manual Trigger)</h4>
                      <p className="cron-card-desc">
                        หากต้องการดึงข้อมูลนัดหมายและส่งข้อความ LINE คัดกรองสำหรับวันพรุ่งนี้ทันที โดยไม่ต้องรอเวลาทำงานอัตโนมัติ
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  className="cron-btn cron-btn-green"
                  onClick={handleRunCronNow}
                  disabled={manualTriggerLoading}
                  type="button"
                >
                  {manualTriggerLoading ? (
                    '⏳ กำลังประมวลผลดึงนัดและส่ง LINE...'
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      สั่งดึงนัดหมายและส่งข้อความทันที
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Cron Job Logs */}
            <div className="settings-table-card">
              <div className="settings-table-toolbar">
                <h3 className="settings-table-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  ประวัติการทำงานของระบบ (10 รายการล่าสุด)
                </h3>
                <button
                  className="settings-btn-icon"
                  onClick={fetchCronLogs}
                  title="รีเฟรชประวัติ"
                  type="button"
                  style={{ width: 'auto', padding: '0 12px', height: '32px', gap: '6px', fontSize: '0.8125rem' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  รีเฟรช
                </button>
              </div>

              {cronLogsLoading ? (
                <div className="loading-container">
                  <div className="spinner" />
                  <div className="loading-text">กำลังโหลดประวัติการทำงาน...</div>
                </div>
              ) : cronLogs.length === 0 ? (
                <div className="empty-state" style={{ padding: '36px 0' }}>
                  <div className="empty-state-icon">🕒</div>
                  <div className="empty-state-title">ไม่พบประวัติการทำงาน</div>
                  <div className="empty-state-text">ระบบยังไม่เคยมีบันทึกการทำงานของ Cron Job</div>
                </div>
              ) : (
                <div className="settings-table-container">
                  <table className="settings-table" style={{ fontSize: '0.875rem' }}>
                    <thead>
                      <tr>
                        <th>เวลาเริ่มต้น</th>
                        <th>เวลาเสร็จสิ้น</th>
                        <th>สถานะ</th>
                        <th style={{ textAlign: 'center' }}>พบนัดหมาย (ราย)</th>
                        <th style={{ textAlign: 'center' }}>บันทึกสำเร็จ (ราย)</th>
                        <th style={{ textAlign: 'center' }}>ส่ง LINE สำเร็จ</th>
                        <th style={{ textAlign: 'center' }}>ส่ง LINE ล้มเหลว</th>
                        <th>รายละเอียด / ข้อผิดพลาด</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cronLogs.slice(0, 10).map((log) => (
                        <tr key={log.id}>
                          <td><strong>{formatDateTime(log.started_at)}</strong></td>
                          <td style={{ color: '#64748b' }}>{log.completed_at ? formatDateTime(log.completed_at) : '—'}</td>
                          <td>
                            {log.status === 'started' && (
                              <span className="settings-status-inactive" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>
                                ⏳ กำลังทำงาน
                              </span>
                            )}
                            {log.status === 'success' && (
                              <span className="settings-status-active">
                                ✓ สำเร็จ
                              </span>
                            )}
                            {log.status === 'failed' && (
                              <span className="settings-status-inactive" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                                ✕ ล้มเหลว
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{log.records_found}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: '#2563eb' }}>{log.records_inserted}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: '#059669' }}>{log.line_sent_count}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: '#dc2626' }}>{log.line_failed_count}</td>
                          <td style={{ whiteSpace: 'normal', wordBreak: 'break-word', color: log.status === 'failed' ? '#dc2626' : '#64748b', fontSize: '0.8125rem' }}>
                            {log.error_message || (log.status === 'success' ? 'ทำงานสมบูรณ์' : 'กำลังดำเนินการ...')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Edit Role Modal */}
      {editingRoleUser && (
        <EditRoleModal
          user={editingRoleUser}
          onClose={() => setEditingRoleUser(null)}
          onSuccess={handleRoleUpdated}
        />
      )}

      {/* Add User Modal */}
      {showModal && (
        <AddUserModal onClose={() => setShowModal(false)} onSuccess={handleUserAdded} />
      )}
    </>
  );
}

// ============================================================================
// EditRoleModal — choose which role to assign to the user
// ============================================================================
function EditRoleModal({ user, onClose, onSuccess }) {
  const [selectedRole, setSelectedRole] = useState(user.role || 'viewer');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await api.updateAdminUser(user.id, { role: selectedRole });
      onSuccess();
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาดในการบันทึกสิทธิ์');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-modal-overlay" onClick={onClose} role="presentation">
      <div className="settings-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="settings-modal-header">
          <h3 className="settings-modal-title">กำหนดสิทธิ์การใช้งาน (Role)</h3>
          <button className="settings-modal-close" onClick={onClose} type="button" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        </div>

        <div className="settings-modal-body">
          {/* User Preview */}
          <div className="settings-selected-user-card">
            <div className="settings-user-preview-left">
              <div className="settings-user-preview-avatar">
                {(user.display_name?.charAt(0) || user.username?.charAt(0) || '?').toUpperCase()}
              </div>
              <div>
                <div className="settings-user-preview-name">{user.display_name || user.username}</div>
                <div className="settings-user-preview-sub">@{user.username}</div>
              </div>
            </div>
          </div>

          {/* Role Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="loa-form-label">เลือกสิทธิ์การใช้งานที่ต้องการกำหนด</label>
            <div className="settings-roles-grid">
              <div
                className={`settings-role-radio-card ${selectedRole === 'admin' ? 'selected' : ''}`}
                onClick={() => setSelectedRole('admin')}
              >
                <span className="settings-role-radio-icon">🛡️</span>
                <div>
                  <div className="settings-role-radio-title">Admin (ผู้ดูแลระบบ)</div>
                  <div className="settings-role-radio-desc">เข้าถึงทุกเมนู จัดการผู้ใช้ ตั้งค่าระบบ และสร้างลิงก์ Telemed</div>
                </div>
              </div>

              <div
                className={`settings-role-radio-card ${selectedRole === 'request_telemed' ? 'selected' : ''}`}
                onClick={() => setSelectedRole('request_telemed')}
              >
                <span className="settings-role-radio-icon">📦</span>
                <div>
                  <div className="settings-role-radio-title">Request Telemed (เจ้าหน้าที่จัดส่งยาและคำขอ)</div>
                  <div className="settings-role-radio-desc">เข้าถึงเฉพาะเมนู LINE OA และจัดการสถานะส่งยา Request Telemed</div>
                </div>
              </div>

              <div
                className={`settings-role-radio-card ${selectedRole === 'viewer' ? 'selected' : ''}`}
                onClick={() => setSelectedRole('viewer')}
              >
                <span className="settings-role-radio-icon">👁️</span>
                <div>
                  <div className="settings-role-radio-title">Viewer (ผู้เข้าชม)</div>
                  <div className="settings-role-radio-desc">ดูข้อมูลเคสและสถิติต่างๆ ในระบบได้อย่างเดียว ไม่สามารถแก้ไขได้</div>
                </div>
              </div>
            </div>
          </div>

          {error && <div className="loa-form-error">{error}</div>}
        </div>

        <div className="settings-modal-footer">
          <button
            className="loa-btn loa-btn-secondary"
            onClick={onClose}
            type="button"
            disabled={saving}
          >
            ยกเลิก
          </button>
          <button
            className="loa-btn loa-btn-primary"
            onClick={handleSave}
            disabled={saving}
            type="button"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกสิทธิ์'}
          </button>
        </div>
      </div>
    </div>
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
    <div className="settings-modal-overlay" onClick={handleOverlayClick} role="presentation">
      <div className="settings-modal-card" ref={modalContentRef} role="dialog" aria-modal="true">
        <div className="settings-modal-header">
          <h3 className="settings-modal-title">เพิ่มผู้ใช้งานระบบ</h3>
          <button className="settings-modal-close" onClick={onClose} type="button" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="12" x2="18" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="settings-modal-body">
          {/* Selected User Preview */}
          {selectedUser && (
            <div className="settings-selected-user-card">
              <div className="settings-user-preview-left">
                <div className="settings-user-preview-avatar">
                  {selectedUser.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div>
                  <div className="settings-user-preview-name">{selectedUser.name}</div>
                  <div className="settings-user-preview-sub">
                    @{selectedUser.loginname}
                    {selectedUser.department ? ` · ${selectedUser.department}` : ''}
                  </div>
                </div>
              </div>
              <button
                className="settings-btn-icon"
                onClick={() => setSelectedUser(null)}
                title="เปลี่ยนผู้ใช้"
                type="button"
                style={{ border: 'none', background: 'transparent' }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Search HOSxP OPD Users */}
          {!selectedUser && (
            <div className="settings-search-wrap">
              <label className="loa-form-label" htmlFor="search-opduser-input">
                ค้นหาเจ้าหน้าที่จาก HOSxP (ชื่อ หรือ Username)
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                  🔍
                </span>
                <input
                  className="settings-modal-search-input"
                  type="text"
                  placeholder="พิมพ์ชื่อ หรือ Loginname อย่างน้อย 2 ตัวอักษร..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  id="search-opduser-input"
                  autoFocus
                  autoComplete="off"
                />
              </div>

              {/* Search Results Dropdown */}
              {(searching || searchResults.length > 0) && (
                <div className="settings-search-dropdown">
                  {searching ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '0.875rem' }}>
                      กำลังค้นหาข้อมูลใน HOSxP...
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '0.875rem' }}>
                      ไม่พบผู้ใช้งานที่ตรงกับเงื่อนไข
                    </div>
                  ) : (
                    searchResults.map((u) => (
                      <button
                        key={u.loginname}
                        className="settings-search-item"
                        onClick={() => handleSelectUser(u)}
                        type="button"
                      >
                        <div className="settings-search-item-avatar">
                          {u.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div className="settings-search-item-info">
                          <span className="settings-search-item-name">{u.name}</span>
                          <span className="settings-search-item-sub">
                            @{u.loginname}
                            {u.department ? ` · ${u.department}` : ''}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Role Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="loa-form-label">กำหนดสิทธิ์การใช้งาน (Role)</label>
            <div className="settings-roles-grid">
              {/* Admin */}
              <div
                className={`settings-role-radio-card ${selectedRole === 'admin' ? 'selected' : ''}`}
                onClick={() => setSelectedRole('admin')}
              >
                <span className="settings-role-radio-icon">🛡️</span>
                <div>
                  <div className="settings-role-radio-title">Admin (ผู้ดูแลระบบ)</div>
                  <div className="settings-role-radio-desc">เข้าถึงทุกเมนู จัดการผู้ใช้ ตั้งค่าระบบ และสร้างลิงก์ Telemed</div>
                </div>
              </div>

              {/* Request Telemed */}
              <div
                className={`settings-role-radio-card ${selectedRole === 'request_telemed' ? 'selected' : ''}`}
                onClick={() => setSelectedRole('request_telemed')}
              >
                <span className="settings-role-radio-icon">📦</span>
                <div>
                  <div className="settings-role-radio-title">Request Telemed (เจ้าหน้าที่จัดส่งยาและคำขอ)</div>
                  <div className="settings-role-radio-desc">เข้าถึงเฉพาะเมนู LINE OA และจัดการสถานะส่งยา Request Telemed</div>
                </div>
              </div>

              {/* Viewer */}
              <div
                className={`settings-role-radio-card ${selectedRole === 'viewer' ? 'selected' : ''}`}
                onClick={() => setSelectedRole('viewer')}
              >
                <span className="settings-role-radio-icon">👁️</span>
                <div>
                  <div className="settings-role-radio-title">Viewer (ผู้เข้าชม)</div>
                  <div className="settings-role-radio-desc">ดูข้อมูลเคสและสถิติต่างๆ ในระบบได้อย่างเดียว ไม่สามารถแก้ไขได้</div>
                </div>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="loa-form-error">
              {error}
            </div>
          )}
        </div>

        <div className="settings-modal-footer">
          <button
            className="loa-btn loa-btn-secondary"
            onClick={onClose}
            type="button"
            disabled={saving}
          >
            ยกเลิก
          </button>
          <button
            className="loa-btn loa-btn-primary"
            onClick={handleSubmit}
            disabled={!selectedUser || saving}
            type="button"
            id="btn-save-admin-user"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกผู้ใช้งาน'}
          </button>
        </div>
      </div>
    </div>
  );
}

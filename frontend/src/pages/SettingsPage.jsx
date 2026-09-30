import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'roles' | 'cron'
  const [adminUsers, setAdminUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRoleUser, setEditingRoleUser] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Dynamic Roles & Permissions States
  const [roles, setRoles] = useState([]);
  const [menus, setMenus] = useState([]);
  const [selectedRoleKey, setSelectedRoleKey] = useState(null);
  const [selectedRolePerms, setSelectedRolePerms] = useState([]);
  const [savingRolePerms, setSavingRolePerms] = useState(false);
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [deletingRoleKey, setDeletingRoleKey] = useState(null);

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

  const fetchRoles = useCallback(async () => {
    try {
      const res = await api.getRoles();
      setRoles(res.data);
      if (!selectedRoleKey && res.data.length > 0) {
        setSelectedRoleKey(res.data[0].role_key);
        setSelectedRolePerms(res.data[0].menu_keys || []);
      } else if (selectedRoleKey) {
        const current = res.data.find((r) => r.role_key === selectedRoleKey);
        if (current) {
          setSelectedRolePerms(current.menu_keys || []);
        }
      }
    } catch (err) {
      console.error('Failed to fetch roles:', err);
    }
  }, [selectedRoleKey]);

  const fetchMenus = useCallback(async () => {
    try {
      const res = await api.getMenus();
      setMenus(res.data);
    } catch (err) {
      console.error('Failed to fetch menus:', err);
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
      fetchRoles();
      fetchMenus();
      fetchCronSettings();
      fetchCronLogs();
    }
  }, [fetchAdminUsers, fetchRoles, fetchMenus, fetchCronSettings, fetchCronLogs, isAdmin]);

  const menuGroups = useMemo(() => {
    const groups = {};
    for (const m of menus) {
      const grp = m.group_name || 'ทั่วไป';
      if (!groups[grp]) groups[grp] = [];
      groups[grp].push(m);
    }
    return groups;
  }, [menus]);

  const selectedRole = useMemo(() => {
    if (!selectedRoleKey) return roles[0] || null;
    return roles.find((r) => r.role_key === selectedRoleKey) || roles[0] || null;
  }, [roles, selectedRoleKey]);

  const handleSelectRole = (r) => {
    setSelectedRoleKey(r.role_key);
    setSelectedRolePerms([...(r.menu_keys || [])]);
  };

  const handleTogglePerm = (menuKey) => {
    setSelectedRolePerms((prev) =>
      prev.includes(menuKey) ? prev.filter((k) => k !== menuKey) : [...prev, menuKey]
    );
  };

  const handleSelectAllPerms = () => {
    setSelectedRolePerms(menus.map((m) => m.menu_key));
  };

  const handleClearAllPerms = () => {
    setSelectedRolePerms([]);
  };

  const handleSaveRolePerms = async () => {
    if (!selectedRole) return;
    setSavingRolePerms(true);
    try {
      await api.updateRole(selectedRole.role_key, {
        menu_keys: selectedRolePerms,
      });
      alert(`💾 บันทึกการตั้งค่าสิทธิ์ "${selectedRole.role_name}" เรียบร้อยแล้ว`);
      await fetchRoles();
    } catch (err) {
      alert(`❌ เกิดข้อผิดพลาดในการบันทึกสิทธิ์: ${err.message}`);
    } finally {
      setSavingRolePerms(false);
    }
  };

  const handleDeleteRole = async (r) => {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบสิทธิ์ "${r.role_name}" (@${r.role_key})?`)) {
      return;
    }
    setDeletingRoleKey(r.role_key);
    try {
      await api.deleteRole(r.role_key);
      alert(`ลบสิทธิ์ "${r.role_name}" สำเร็จ`);
      if (selectedRoleKey === r.role_key) {
        setSelectedRoleKey('admin');
      }
      await fetchRoles();
    } catch (err) {
      alert(`❌ ไม่สามารถลบสิทธิ์ได้: ${err.message}`);
    } finally {
      setDeletingRoleKey(null);
    }
  };

  const handleDelete = async (id) => {
    setActionLoading(id);
    try {
      await api.deleteAdminUser(id);
      setDeleteConfirmId(null);
      await fetchAdminUsers();
      await fetchRoles();
    } catch (err) {
      console.error('Failed to delete user');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUserAdded = () => {
    setShowModal(false);
    fetchAdminUsers();
    fetchRoles();
  };

  const handleRoleUpdated = () => {
    setEditingRoleUser(null);
    fetchAdminUsers();
    fetchRoles();
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

  return (
    <>
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h2 className="page-title">ตั้งค่าระบบและผู้ใช้งาน</h2>
            <p className="page-subtitle">จัดการสิทธิ์บัญชีผู้ใช้ สิทธิ์การเข้าถึงเมนู และตั้งค่าการดึงข้อมูลคัดกรองอัตโนมัติ</p>
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
          {activeTab === 'roles' && (
            <button
              className="btn btn-primary"
              onClick={() => setShowAddRoleModal(true)}
              type="button"
              id="btn-add-role"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              เพิ่มสิทธิ์ใหม่
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
            <span>ผู้ใช้งาน</span>
            <span className="settings-tab-badge">{adminUsers.length}</span>
          </button>

          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'roles' ? 'active' : ''}`}
            onClick={() => setActiveTab('roles')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>สิทธิ์และเมนูเข้าถึง</span>
            <span className="settings-tab-badge">{roles.length}</span>
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

              {roles.slice(0, 4).map((r) => (
                <div key={r.role_key} className="settings-stat-card">
                  <div>
                    <div className="settings-stat-label">{r.role_name}</div>
                    <div className="settings-stat-value">{adminUsers.filter((u) => u.role === r.role_key).length}</div>
                    <div className="settings-stat-sub">@{r.role_key}</div>
                  </div>
                  <div className="settings-stat-icon" style={{ fontSize: '1.5rem', background: '#f8fafc' }}>
                    {r.icon || '👤'}
                  </div>
                </div>
              ))}
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
                        const roleObj = roles.find((r) => r.role_key === u.role);
                        const roleLabel = roleObj ? roleObj.role_name : (u.role_name || u.role);
                        const roleIcon = roleObj ? (roleObj.icon || '👤') : (u.role_icon || '👤');
                        const roleColor = roleObj ? (roleObj.badge_color || 'blue') : (u.role_badge_color || 'blue');

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
                              <span className={`settings-role-badge badge-${roleColor}`}>
                                <span>{roleIcon}</span>
                                <span>{roleLabel}</span>
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

        {/* TAB 2: ROLES & PERMISSIONS MANAGEMENT */}
        {activeTab === 'roles' && (
          <div className="settings-roles-layout">
            {/* Left Master List */}
            <div className="roles-master-list">
              {roles.map((r) => {
                const isSelected = (selectedRoleKey || roles[0]?.role_key) === r.role_key;
                return (
                  <div
                    key={r.role_key}
                    className={`role-master-card ${isSelected ? 'active' : ''}`}
                    onClick={() => handleSelectRole(r)}
                  >
                    <div className="role-master-card-header">
                      <div className="role-master-card-left">
                        <span className="role-master-icon">{r.icon || '👤'}</span>
                        <div>
                          <div className="role-master-title">{r.role_name}</div>
                          <div className="role-master-key">@{r.role_key}</div>
                        </div>
                      </div>
                      {!r.is_system && (
                        <button
                          type="button"
                          className="settings-btn-icon"
                          title="ลบสิทธิ์นี้"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteRole(r);
                          }}
                          disabled={deletingRoleKey === r.role_key}
                          style={{ color: '#ef4444' }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      )}
                    </div>

                    <div className="role-master-desc">
                      {r.description || 'ไม่มีคำอธิบาย'}
                    </div>

                    <div className="role-master-meta">
                      <span className={`role-badge-tag ${r.is_system ? 'system' : ''}`}>
                        {r.is_system ? '🛡️ สิทธิ์ระบบ' : '✨ กำหนดเอง'}
                      </span>
                      <span className="role-badge-tag users-count">
                        👤 {r.user_count || 0} ผู้ใช้
                      </span>
                      <span className="role-badge-tag perms-count">
                        📋 {r.role_key === 'admin' ? 'ทุกเมนู' : `${(r.menu_keys || []).length} เมนู`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Permissions Panel */}
            <div className="role-detail-card">
              {selectedRole ? (
                <>
                  <div className="role-detail-header">
                    <div className="role-detail-title-group">
                      <div className="role-detail-icon-circle">{selectedRole.icon || '👤'}</div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#0f172a' }}>
                            {selectedRole.role_name}
                          </h3>
                          <span className={`role-badge-tag badge-${selectedRole.badge_color || 'blue'}`}>
                            @{selectedRole.role_key}
                          </span>
                          <span className={`role-badge-tag ${selectedRole.is_system ? 'system' : ''}`}>
                            {selectedRole.is_system ? 'สิทธิ์ระบบ' : 'กำหนดเอง'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '3px' }}>
                          {selectedRole.description || 'กำหนดสิทธิ์การมองเห็นและเข้าถึงเมนูต่างๆ ในระบบ'}
                        </div>
                      </div>
                    </div>

                    <div className="role-detail-actions">
                      {selectedRole.role_key !== 'admin' && (
                        <>
                          <button
                            type="button"
                            className="loa-btn loa-btn-secondary"
                            onClick={handleSelectAllPerms}
                            style={{ fontSize: '0.8125rem', height: '34px' }}
                          >
                            เลือกทั้งหมด
                          </button>
                          <button
                            type="button"
                            className="loa-btn loa-btn-secondary"
                            onClick={handleClearAllPerms}
                            style={{ fontSize: '0.8125rem', height: '34px' }}
                          >
                            ล้างทั้งหมด
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="role-perms-body">
                    {selectedRole.role_key === 'admin' ? (
                      <div style={{
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        borderRadius: '12px',
                        padding: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        color: '#1e40af'
                      }}>
                        <span style={{ fontSize: '2rem' }}>👑</span>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e3a8a' }}>
                            สิทธิ์ผู้ดูแลระบบสูงสุด (Super Administrator)
                          </h4>
                          <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: '#1d4ed8' }}>
                            สิทธิ์ Admin มีสิทธิ์เข้าถึง ดูข้อมูล และจัดการทุกเมนูในระบบโดยอัตโนมัติ จึงไม่ต้องกำหนดแยกรายเมนู
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {Object.entries(menuGroups).map(([groupName, items]) => (
                          <div key={groupName} className="role-perms-group">
                            <div className="role-perms-group-title">
                              <span>📁 {groupName}</span>
                              <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#94a3b8' }}>
                                ({items.filter(m => selectedRolePerms.includes(m.menu_key)).length}/{items.length})
                              </span>
                            </div>
                            <div className="role-perms-grid">
                              {items.map((m) => {
                                const checked = selectedRolePerms.includes(m.menu_key);
                                return (
                                  <div
                                    key={m.menu_key}
                                    className={`role-perm-checkbox-card ${checked ? 'selected' : ''}`}
                                    onClick={() => handleTogglePerm(m.menu_key)}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => {}}
                                    />
                                    <div className="role-perm-label-wrap">
                                      <span className="role-perm-label">{m.menu_name}</span>
                                      <span className="role-perm-path">{m.path}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedRole.role_key !== 'admin' && (
                    <div className="role-detail-footer">
                      <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                        เลือกแล้ว {selectedRolePerms.length} จาก {menus.length} เมนู
                      </span>
                      <button
                        type="button"
                        className="loa-btn loa-btn-primary"
                        onClick={handleSaveRolePerms}
                        disabled={savingRolePerms}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        {savingRolePerms ? (
                          '⏳ กำลังบันทึก...'
                        ) : (
                          <>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                              <polyline points="17 21 17 13 7 13 7 21" />
                              <polyline points="7 3 7 8 15 8" />
                            </svg>
                            บันทึกการตั้งค่าสิทธิ์
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  กรุณาเลือกสิทธิ์จากรายการทางซ้าย
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: CRON JOB & AUTOMATION */}
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
          roles={roles}
          onClose={() => setEditingRoleUser(null)}
          onSuccess={handleRoleUpdated}
        />
      )}

      {/* Add User Modal */}
      {showModal && (
        <AddUserModal
          roles={roles}
          onClose={() => setShowModal(false)}
          onSuccess={handleUserAdded}
        />
      )}

      {/* Add Role Modal */}
      {showAddRoleModal && (
        <AddRoleModal
          menus={menus}
          onClose={() => setShowAddRoleModal(false)}
          onSuccess={async (newRoleKey) => {
            setShowAddRoleModal(false);
            await fetchRoles();
            setSelectedRoleKey(newRoleKey);
            setActiveTab('roles');
          }}
        />
      )}
    </>
  );
}

// ============================================================================
// EditRoleModal — choose which role to assign to the user
// ============================================================================
function EditRoleModal({ user, roles, onClose, onSuccess }) {
  const [selectedRole, setSelectedRole] = useState(user.role || (roles[0]?.role_key || 'operator'));
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
            <div className="settings-roles-grid" style={{ maxHeight: '350px', overflowY: 'auto' }}>
              {roles.map((r) => (
                <div
                  key={r.role_key}
                  className={`settings-role-radio-card ${selectedRole === r.role_key ? 'selected' : ''}`}
                  onClick={() => setSelectedRole(r.role_key)}
                >
                  <span className="settings-role-radio-icon">{r.icon || '👤'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div className="settings-role-radio-title">{r.role_name}</div>
                      <span className={`role-badge-tag badge-${r.badge_color || 'blue'}`}>@{r.role_key}</span>
                    </div>
                    <div className="settings-role-radio-desc">{r.description || 'ไม่มีคำอธิบาย'}</div>
                  </div>
                </div>
              ))}
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
function AddUserModal({ roles, onClose, onSuccess }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState(
    roles.find((r) => r.role_key === 'operator')?.role_key || roles[0]?.role_key || 'operator'
  );
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
    <div className="settings-modal-overlay" onClick={onClose} role="presentation">
      <div className="settings-modal-card" ref={modalContentRef} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
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
            <div className="settings-roles-grid" style={{ maxHeight: '280px', overflowY: 'auto' }}>
              {roles.map((r) => (
                <div
                  key={r.role_key}
                  className={`settings-role-radio-card ${selectedRole === r.role_key ? 'selected' : ''}`}
                  onClick={() => setSelectedRole(r.role_key)}
                >
                  <span className="settings-role-radio-icon">{r.icon || '👤'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div className="settings-role-radio-title">{r.role_name}</div>
                      <span className={`role-badge-tag badge-${r.badge_color || 'blue'}`}>@{r.role_key}</span>
                    </div>
                    <div className="settings-role-radio-desc">{r.description || 'ไม่มีคำอธิบาย'}</div>
                  </div>
                </div>
              ))}
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

// ============================================================================
// AddRoleModal — Create a new custom role with menu permissions
// ============================================================================
function AddRoleModal({ menus, onClose, onSuccess }) {
  const [roleKey, setRoleKey] = useState('');
  const [roleName, setRoleName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('👤');
  const [badgeColor, setBadgeColor] = useState('indigo');
  const [selectedPerms, setSelectedPerms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const ICONS = ['🛡️', '🏥', '🎧', '💊', '💰', '🩺', '🧑‍⚕️', '📋', '🔬', '⭐', '👤'];
  const COLORS = [
    { key: 'blue', label: 'น้ำเงิน', hex: '#2563eb' },
    { key: 'rose', label: 'แดง', hex: '#e11d48' },
    { key: 'purple', label: 'ม่วง', hex: '#7c3aed' },
    { key: 'emerald', label: 'เขียว', hex: '#059669' },
    { key: 'amber', label: 'ส้ม', hex: '#d97706' },
    { key: 'indigo', label: 'คราม', hex: '#4f46e5' },
    { key: 'slate', label: 'เทา', hex: '#475569' },
  ];

  // Group menus
  const menuGroups = useMemo(() => {
    const groups = {};
    for (const m of menus) {
      const grp = m.group_name || 'ทั่วไป';
      if (!groups[grp]) groups[grp] = [];
      groups[grp].push(m);
    }
    return groups;
  }, [menus]);

  const handleTogglePerm = (key) => {
    setSelectedPerms((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSelectAll = () => {
    setSelectedPerms(menus.map((m) => m.menu_key));
  };

  const handleClearAll = () => {
    setSelectedPerms([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!roleKey.trim()) {
      setError('กรุณาระบุรหัสสิทธิ์ (Role Key)');
      return;
    }
    if (!roleName.trim()) {
      setError('กรุณาระบุชื่อสิทธิ์ (Role Name)');
      return;
    }

    setSaving(true);
    setError('');
    const cleanKey = roleKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    try {
      await api.createRole({
        role_key: cleanKey,
        role_name: roleName.trim(),
        description: description.trim() || null,
        icon,
        badge_color: badgeColor,
        menu_keys: selectedPerms,
      });
      onSuccess(cleanKey);
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาดในการสร้างสิทธิ์');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-modal-overlay" onClick={onClose} role="presentation">
      <div className="settings-modal-card" style={{ maxWidth: '680px' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="settings-modal-header">
          <h3 className="settings-modal-title">✨ เพิ่มสิทธิ์การใช้งานใหม่ (New Role)</h3>
          <button className="settings-modal-close" onClick={onClose} type="button" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="settings-modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {/* Role Key & Name */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label className="loa-form-label">
                  รหัสสิทธิ์ (Role Key) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  className="settings-modal-search-input"
                  style={{ paddingLeft: '14px' }}
                  placeholder="เช่น head_nurse, cashier"
                  value={roleKey}
                  onChange={(e) => setRoleKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                  required
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>ภาษาอังกฤษพิมพ์เล็กและขีดล่าง _</span>
              </div>

              <div>
                <label className="loa-form-label">
                  ชื่อสิทธิ์ (Role Name) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  className="settings-modal-search-input"
                  style={{ paddingLeft: '14px' }}
                  placeholder="เช่น พยาบาลหัวหน้าเวร"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Description */}
            <div style={{ marginTop: '12px' }}>
              <label className="loa-form-label">คำอธิบายหน้าที่ / ความรับผิดชอบ</label>
              <input
                type="text"
                className="settings-modal-search-input"
                style={{ paddingLeft: '14px' }}
                placeholder="เช่น ดูแลจัดคิวเคส และติดตามคนไข้"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Icon Picker */}
            <div style={{ marginTop: '12px' }}>
              <label className="loa-form-label">เลือกไอคอนสิทธิ์</label>
              <div className="picker-grid">
                {ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    className={`icon-picker-btn ${icon === ic ? 'selected' : ''}`}
                    onClick={() => setIcon(ic)}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            {/* Badge Color Picker */}
            <div style={{ marginTop: '12px' }}>
              <label className="loa-form-label">เลือกโทนสี Badge</label>
              <div className="picker-grid">
                {COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={`color-picker-btn ${badgeColor === c.key ? 'selected' : ''}`}
                    onClick={() => setBadgeColor(c.key)}
                  >
                    <span className="color-dot" style={{ backgroundColor: c.hex }} />
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Menu Permissions Checklist */}
            <div style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label className="loa-form-label" style={{ margin: 0 }}>
                  เลือกเมนูที่อนุญาตให้สิทธิ์นี้เข้าถึง ({selectedPerms.length}/{menus.length})
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="loa-btn loa-btn-secondary"
                    style={{ padding: '3px 8px', fontSize: '0.75rem', height: 'auto' }}
                    onClick={handleSelectAll}
                  >
                    เลือกทั้งหมด
                  </button>
                  <button
                    type="button"
                    className="loa-btn loa-btn-secondary"
                    style={{ padding: '3px 8px', fontSize: '0.75rem', height: 'auto' }}
                    onClick={handleClearAll}
                  >
                    ล้างทั้งหมด
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
                {Object.entries(menuGroups).map(([groupName, items]) => (
                  <div key={groupName} className="role-perms-group">
                    <div className="role-perms-group-title">{groupName}</div>
                    <div className="role-perms-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      {items.map((m) => {
                        const checked = selectedPerms.includes(m.menu_key);
                        return (
                          <div
                            key={m.menu_key}
                            className={`role-perm-checkbox-card ${checked ? 'selected' : ''}`}
                            onClick={() => handleTogglePerm(m.menu_key)}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {}}
                            />
                            <div className="role-perm-label-wrap">
                              <span className="role-perm-label">{m.menu_name}</span>
                              <span className="role-perm-path">{m.path}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error && <div className="loa-form-error" style={{ marginTop: '12px' }}>{error}</div>}
          </div>

          <div className="settings-modal-footer">
            <button
              type="button"
              className="loa-btn loa-btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="loa-btn loa-btn-primary"
              disabled={saving}
            >
              {saving ? 'กำลังสร้าง...' : 'สร้างสิทธิ์ใหม่'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

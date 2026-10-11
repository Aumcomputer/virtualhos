import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

export default function CaregiverListPage() {
  const [caregivers, setCaregivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);

  const fetchCaregivers = useCallback(async (targetPage = 1, searchQuery = '') => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getCaregiverList(targetPage, 20, searchQuery);
      if (res.success) {
        setCaregivers(res.data || []);
        setPagination(res.pagination || { page: targetPage, limit: 20, total: 0, totalPages: 1 });
      }
    } catch (err) {
      console.error('Error fetching caregivers:', err);
      setError(err.message || 'ไม่สามารถโหลดข้อมูลผู้ดูแลได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCaregivers(page, search);
  }, [fetchCaregivers, page]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchCaregivers(1, search);
  };

  const handleAddCaregiver = () => {
    // ใช้ UUID v4 มาตรฐานรูปแบบ เช่น 4fd61764-88e3-4652-a4d9-b2efb2df2202
    let sessionId;
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      sessionId = crypto.randomUUID();
    } else {
      sessionId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
    const mophOAuthUrl = `https://moph.id.th/oauth/redirect?client_id=0199b8f4-6322-7b14-b21e-69a81101abc0&redirect_uri=https://telemed.rajburi.org/line&response_type=code&state=cagiver__${sessionId}`;
    window.open(mophOAuthUrl, '_blank');
  };

  const handleToggleStatus = async (id, currentStatus) => {
    const nextStatus = currentStatus === 'REJECTED' ? 'APPROVED' : 'REJECTED';
    const actionText = nextStatus === 'APPROVED' ? 'อนุมัติ' : 'ไม่อนุมัติ';
    if (!window.confirm(`ต้องการเปลี่ยนสถานะรายการนี้เป็น "${actionText}" ใช่หรือไม่?`)) {
      return;
    }

    try {
      setStatusUpdatingId(id);
      const res = await api.updateCaregiverStatus(id, nextStatus);
      if (res.success) {
        setCaregivers((prev) =>
          prev.map((cg) => (cg.id === id ? { ...cg, status: nextStatus } : cg))
        );
      } else {
        alert(res.error || res.message || 'ไม่สามารถอัปเดตสถานะได้');
      }
    } catch (err) {
      console.error('Error updating status:', err);
      alert('เกิดข้อผิดพลาดในการอัปเดตสถานะ: ' + (err.message || ''));
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const formatCid = (cid) => {
    if (!cid) return '-';
    const clean = String(cid).replace(/[^0-9]/g, '');
    if (clean.length === 13) {
      return `${clean[0]}-${clean.substring(1, 5)}-${clean.substring(5, 10)}-${clean.substring(10, 12)}-${clean[12]}`;
    }
    return cid;
  };

  const formatDate = (isoString) => {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      const day = d.getDate();
      const months = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
      ];
      const month = months[d.getMonth()];
      const year = d.getFullYear() + 543;
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${day} ${month} ${year} ${hours}:${minutes} น.`;
    } catch {
      return isoString;
    }
  };

  const parseReasons = (reasonsJson) => {
    if (!reasonsJson) return [];
    try {
      const parsed = typeof reasonsJson === 'string' ? JSON.parse(reasonsJson) : reasonsJson;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [reasonsJson];
    }
  };

  return (
    <div className="page-container" style={{ padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--gray-900)', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '26px' }}>👥</span> จัดการข้อมูลผู้ดูแล (Caregiver)
          </h1>
          <p style={{ color: 'var(--gray-500)', fontSize: '14px', margin: 0 }}>
            หนังสือรับรองและประวัติการลงทะเบียนผู้ดูแลผู้ป่วยเพื่อรับบริการ Telemedicine โรงพยาบาลราชบุรี
          </p>
        </div>

        <button
          type="button"
          onClick={handleAddCaregiver}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#0f766e',
            color: '#ffffff',
            padding: '10px 20px',
            borderRadius: '10px',
            fontWeight: '600',
            fontSize: '15px',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(15, 118, 110, 0.25)',
            transition: 'all 0.15s ease',
          }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#115e59')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#0f766e')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          เพิ่ม Caregiver
        </button>
      </div>

      {/* Search Bar */}
      <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid var(--gray-200)', marginBottom: '20px', boxShadow: 'var(--shadow-sm)' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="text"
              placeholder="ค้นหาชื่อผู้ดูแล, เลข ปชช, ชื่อผู้ป่วย, HN, หรือเจ้าหน้าที่พยาน..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px 10px 38px',
                borderRadius: '8px',
                border: '1px solid var(--gray-300)',
                fontSize: '14px',
                outline: 'none',
              }}
            />
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--gray-400)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>
          <button
            type="submit"
            style={{
              padding: '10px 18px',
              backgroundColor: 'var(--primary-600)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            ค้นหา
          </button>
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setPage(1);
                fetchCaregivers(1, '');
              }}
              style={{
                padding: '10px 14px',
                backgroundColor: 'var(--gray-100)',
                color: 'var(--gray-600)',
                border: '1px solid var(--gray-300)',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              ล้างค่า
            </button>
          )}
        </form>
      </div>

      {/* Error Notice */}
      {error && (
        <div style={{ padding: '14px 18px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', color: '#b91c1c', marginBottom: '20px', fontSize: '14px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Caregiver Table */}
      <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid var(--gray-200)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid var(--gray-200)', color: 'var(--gray-600)', fontWeight: '600' }}>
                <th style={{ padding: '14px 16px' }}>วันที่บันทึก</th>
                <th style={{ padding: '14px 16px' }}>ผู้ดูแล (Caregiver)</th>
                <th style={{ padding: '14px 16px' }}>ผู้ป่วยในความดูแล (Patient)</th>
                <th style={{ padding: '14px 16px' }}>ความสัมพันธ์ & เหตุผล</th>
                <th style={{ padding: '14px 16px' }}>พยาน (จนท. รพ.)</th>
                <th style={{ padding: '14px 16px', textAlign: 'center' }}>สถานะ</th>
                <th style={{ padding: '14px 16px', textAlign: 'center' }}>หนังสือรับรอง</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: 'var(--gray-400)' }}>
                    <div style={{ display: 'inline-block', width: '24px', height: '24px', border: '3px solid #cbd5e1', borderTopColor: '#0f766e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    <div style={{ marginTop: '10px' }}>กำลังโหลดข้อมูลผู้ดูแล...</div>
                  </td>
                </tr>
              ) : caregivers.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--gray-500)' }}>
                    <div style={{ fontSize: '36px', marginBottom: '10px' }}>📭</div>
                    <div style={{ fontWeight: '600', fontSize: '16px', color: 'var(--gray-700)' }}>ยังไม่มีข้อมูลผู้ดูแล</div>
                    <p style={{ margin: '6px 0 16px 0', fontSize: '13px', color: 'var(--gray-500)' }}>
                      กดปุ่ม "+ เพิ่ม Caregiver" ด้านบนเพื่อเริ่มลงทะเบียนหนังสือรับรองผู้ดูแลผ่านหมอพร้อม
                    </p>
                    <button
                      type="button"
                      onClick={handleAddCaregiver}
                      style={{
                        padding: '8px 18px',
                        backgroundColor: '#0f766e',
                        color: '#fff',
                        borderRadius: '8px',
                        border: 'none',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer',
                      }}
                    >
                      + เพิ่ม Caregiver ทันที
                    </button>
                  </td>
                </tr>
              ) : (
                caregivers.map((cg) => {
                  const reasons = parseReasons(cg.inability_reasons);
                  const isApproved = cg.status !== 'REJECTED';
                  const isUpdating = statusUpdatingId === cg.id;
                  return (
                    <tr key={cg.id} style={{ borderBottom: '1px solid var(--gray-100)', transition: 'background 0.15s ease' }} onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')} onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}>
                      <td style={{ padding: '14px 16px', color: 'var(--gray-500)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                        {formatDate(cg.created_at)}
                      </td>
                      <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: '600', color: 'var(--gray-900)' }}>{cg.caregiver_name}</div>
                        {cg.caregiver_phone && (
                          <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px' }}>
                            โทร: {cg.caregiver_phone}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: '600', color: '#1e40af' }}>{cg.patient_name}</div>
                        <div style={{ fontSize: '13px', color: 'var(--gray-700)', marginTop: '2px' }}>
                          HN: <strong>{cg.patient_hn}</strong>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: '600', color: '#4338ca' }}>
                          {cg.relationship} {cg.relationship_desc ? `(${cg.relationship_desc})` : ''}
                        </div>
                        {reasons.length > 0 && (
                          <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: '12px', color: 'var(--gray-600)' }}>
                            {reasons.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: '500', color: 'var(--gray-800)' }}>{cg.witness_name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>({cg.witness_username})</div>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center', verticalAlign: 'top' }}>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(cg.id, cg.status || 'APPROVED')}
                          disabled={isUpdating}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 12px',
                            borderRadius: '9999px',
                            fontSize: '12px',
                            fontWeight: '600',
                            backgroundColor: isApproved ? '#dcfce7' : '#fee2e2',
                            color: isApproved ? '#15803d' : '#b91c1c',
                            border: `1px solid ${isApproved ? '#bbf7d0' : '#fecaca'}`,
                            cursor: isUpdating ? 'not-allowed' : 'pointer',
                            opacity: isUpdating ? 0.6 : 1,
                            transition: 'all 0.15s ease',
                            outline: 'none',
                          }}
                          onMouseOver={(e) => {
                            if (!isUpdating) {
                              e.currentTarget.style.transform = 'scale(1.03)';
                              e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.08)';
                            }
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                          title={`สถานะปัจจุบัน: ${isApproved ? 'อนุมัติ' : 'ไม่อนุมัติ'} (คลิกเพื่อเปลี่ยนสถานะ)`}
                        >
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              backgroundColor: isApproved ? '#16a34a' : '#dc2626',
                            }}
                          />
                          {isUpdating ? 'กำลังบันทึก...' : (isApproved ? 'อนุมัติ' : 'ไม่อนุมัติ')}
                        </button>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center', verticalAlign: 'top' }}>
                        <a
                          href={`/api/caregiver/pdf/${cg.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            backgroundColor: '#eff6ff',
                            color: '#1d4ed8',
                            border: '1px solid #bfdbfe',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: '600',
                            textDecoration: 'none',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.backgroundColor = '#dbeafe';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.backgroundColor = '#eff6ff';
                          }}
                          title="คลิกเพื่อเปิดดูหนังสือรับรอง PDF"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                          </svg>
                          เปิด PDF
                        </a>
                        {cg.pdf_hash && (
                          <div 
                            title={`SHA-256: ${cg.pdf_hash}`}
                            style={{ 
                              fontSize: '10px', 
                              color: 'var(--gray-500)', 
                              marginTop: '4px',
                              fontFamily: 'monospace'
                            }}
                          >
                            Hash: {cg.pdf_hash.substring(0, 10)}...
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--gray-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: 'var(--gray-600)' }}>
            <div>
              ทั้งหมด {pagination.total} รายการ (หน้า {pagination.page} จาก {pagination.totalPages})
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--gray-300)',
                  backgroundColor: page <= 1 ? 'var(--gray-100)' : '#ffffff',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                  color: page <= 1 ? 'var(--gray-400)' : 'var(--gray-700)',
                }}
              >
                ◀ ก่อนหน้า
              </button>
              <button
                type="button"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--gray-300)',
                  backgroundColor: page >= pagination.totalPages ? 'var(--gray-100)' : '#ffffff',
                  cursor: page >= pagination.totalPages ? 'not-allowed' : 'pointer',
                  color: page >= pagination.totalPages ? 'var(--gray-400)' : 'var(--gray-700)',
                }}
              >
                ถัดไป ▶
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

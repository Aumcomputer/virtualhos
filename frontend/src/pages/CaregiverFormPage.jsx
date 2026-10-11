import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import ImageCropModal from '../components/ImageCropModal';

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

function formatCid(cid) {
  if (!cid) return '-';
  const clean = String(cid).replace(/[^0-9]/g, '');
  if (clean.length === 13) {
    return `${clean[0]}-${clean.substring(1, 5)}-${clean.substring(5, 10)}-${clean.substring(10, 12)}-${clean[12]}`;
  }
  return cid;
}

function formatThaiDate(dateInput) {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const day = d.getDate();
  const month = THAI_MONTHS[d.getMonth()];
  const year = d.getFullYear() + 543;
  return `${day} ${month} ${year}`;
}

export default function CaregiverFormPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // State: Session / Caregiver
  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionError, setSessionError] = useState(null);
  const [caregiver, setCaregiver] = useState(null);

  // State: Patient Lookup
  const [patientQuery, setPatientQuery] = useState('');
  const [searchingPatient, setSearchingPatient] = useState(false);
  const [patientError, setPatientError] = useState(null);
  const [patient, setPatient] = useState(null);

  // State: Address Textareas (รวมรหัสไปรษณีย์ และแก้ไขได้)
  const [caregiverAddress, setCaregiverAddress] = useState('');
  const [patientAddress, setPatientAddress] = useState('');

  const formatAddressString = (addr) => {
    if (!addr) return '';
    if (typeof addr === 'string') return addr;
    const parts = [];
    if (addr.addrpart) parts.push(`บ้านเลขที่ ${addr.addrpart}`);
    if (addr.moopart && addr.moopart !== '-' && addr.moopart !== '0') parts.push(`หมู่ที่ ${addr.moopart}`);
    if (addr.tmb_name) parts.push(`ตำบล/แขวง ${addr.tmb_name.replace(/^(ต\.|ตำบล)/, '')}`);
    if (addr.amp_name) parts.push(`อำเภอ/เขต ${addr.amp_name.replace(/^(อ\.|อำเภอ)/, '')}`);
    if (addr.chw_name) parts.push(`จังหวัด ${addr.chw_name.replace(/^(จ\.|จังหวัด)/, '')}`);
    if (addr.po_code || addr.postcode) {
      const code = String(addr.po_code || addr.postcode).replace(/^รหัสไปรษณีย์\s*/, '').trim();
      if (code) parts.push(`รหัสไปรษณีย์ ${code}`);
    }
    return parts.length > 0 ? parts.join(' ') : (addr.informaddr || '');
  };

  // Master options from backend
  const [relationshipOptions, setRelationshipOptions] = useState([
    { id: 1, title: 'คู่สมรส' },
    { id: 2, title: 'บุตร' },
    { id: 3, title: 'บิดา/มารดา' },
    { id: 4, title: 'พี่น้อง' },
    { id: 5, title: 'หลาน' },
    { id: 6, title: 'ญาติ' },
    { id: 7, title: 'ผู้ปกครองตามกฎหมาย' },
    { id: 8, title: 'อื่นๆ' },
  ]);
  const [reasonOptions, setReasonOptions] = useState([
    { id: 1, title: 'เป็นผู้ป่วยติดเตียง / ภาวะพึ่งพิงสูง ไม่สามารถเคลื่อนย้ายได้' },
    { id: 2, title: 'มีข้อจำกัดทางกายภาพหรือการเคลื่อนไหวรุนแรง' },
    { id: 3, title: 'ผู้ป่วยมีความรู้คิดบกพร่อง / ภาวะสมองเสื่อม / ไม่รู้สติสัมปชัญญะ' },
    { id: 4, title: 'เด็กเล็กหรือเยาวชนที่มีข้อจำกัดด้านสุขภาพหรือการเดินทาง' },
  ]);

  // State: Form details
  const [relationshipId, setRelationshipId] = useState(1);
  const [relationship, setRelationship] = useState('คู่สมรส');
  const [relationshipDesc, setRelationshipDesc] = useState('');
  const [inabilityReasonIds, setInabilityReasonIds] = useState([]);
  const [inabilityReasons, setInabilityReasons] = useState([]);
  const [inabilityOther, setInabilityOther] = useState('');

  // State: Patient ID Card Photo & Cropping
  const [rawImageForCrop, setRawImageForCrop] = useState(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [idCardPreview, setIdCardPreview] = useState(null);
  const [processingImage, setProcessingImage] = useState(false);
  const fileInputRef = useRef(null);

  // State: Consent & Submit
  const [consentChecked, setConsentChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(null);
  const [formError, setFormError] = useState(null);

  // Load Master Options (Relationships & Inability Reasons)
  useEffect(() => {
    async function loadMasterOptions() {
      try {
        const res = await api.getCaregiverMasterOptions();
        if (res.success && res.data) {
          if (Array.isArray(res.data.relationships) && res.data.relationships.length > 0) {
            setRelationshipOptions(res.data.relationships);
            setRelationshipId(res.data.relationships[0].id);
            setRelationship(res.data.relationships[0].title);
          }
          if (Array.isArray(res.data.inabilityReasons) && res.data.inabilityReasons.length > 0) {
            // กรอง 'อื่นๆ' ออกจาก checkboxes เพื่อแสดงใน input แยก
            const mainReasons = res.data.inabilityReasons.filter(r => r.title !== 'อื่นๆ');
            setReasonOptions(mainReasons);
          }
        }
      } catch (err) {
        console.warn('Could not load master options, using default options:', err.message);
      }
    }
    loadMasterOptions();
  }, []);

  // 1. Fetch Caregiver Session from Backend
  useEffect(() => {
    async function loadSession() {
      const urlParams = new URLSearchParams(window.location.search);
      const queryError = urlParams.get('error');
      if (queryError) {
        setSessionError(queryError);
        setLoadingSession(false);
        return;
      }

      if (!sessionId) {
        setSessionError('ไม่พบรหัส Session สำหรับการลงทะเบียน');
        setLoadingSession(false);
        return;
      }
      try {
        setLoadingSession(true);
        setSessionError(null);
        const res = await api.getCaregiverSession(sessionId);
        if (res.success && res.data) {
          const ialNum = parseFloat(res.data.mophIal || '0') || 0;
          if (ialNum < 2.3 || res.data.status === 'REJECTED') {
            setSessionError(`ระดับการยืนยันตัวตน MOPH ID (${res.data.mophIal || 'ไม่ระบุ'}) ต่ำกว่า 2.3 ไม่อนุญาตให้ลงทะเบียนเป็นผู้ดูแล (Caregiver)`);
            return;
          }
          setCaregiver(res.data);
          const initialAddr = res.data.caregiverAddressText || formatAddressString(res.data.caregiverAddress);
          setCaregiverAddress(initialAddr);
        } else {
          setSessionError('ไม่พบข้อมูลการยืนยันตัวตนของ Session นี้');
        }
      } catch (err) {
        console.error('Error loading caregiver session:', err);
        setSessionError(err.message || 'ไม่สามารถดึงข้อมูลการยืนยันตัวตนจาก MOPH ID ได้');
      } finally {
        setLoadingSession(false);
      }
    }
    loadSession();
  }, [sessionId]);

  // 2. Patient Lookup via HOSxP
  const handleLookupPatient = async (e) => {
    if (e) e.preventDefault();
    if (!patientQuery.trim()) {
      setPatientError('กรุณากรอก HN หรือ เลขประจำตัวประชาชน');
      return;
    }
    try {
      setSearchingPatient(true);
      setPatientError(null);
      const res = await api.lookupCaregiverPatient(patientQuery.trim());
      if (res.success && res.data) {
        setPatient(res.data);
        const initialPtAddr = res.data.address || formatAddressString(res.data.addressObj);
        setPatientAddress(initialPtAddr);
      } else {
        setPatient(null);
        setPatientAddress('');
        setPatientError('ไม่พบข้อมูลผู้ป่วย');
      }
    } catch (err) {
      console.error('Error looking up patient:', err);
      setPatient(null);
      setPatientError(err.message || 'ไม่พบข้อมูลผู้ป่วยในระบบ HOSxP');
    } finally {
      setSearchingPatient(false);
    }
  };

  // 3. Handle Reason Checkbox Toggle
  const handleToggleReason = (reasonObj) => {
    const isChecked = inabilityReasonIds.includes(reasonObj.id);
    if (isChecked) {
      setInabilityReasonIds((prev) => prev.filter((id) => id !== reasonObj.id));
      setInabilityReasons((prev) => prev.filter((t) => t !== reasonObj.title));
    } else {
      setInabilityReasonIds((prev) => [...prev, reasonObj.id]);
      setInabilityReasons((prev) => [...prev, reasonObj.title]);
    }
  };

  // 4. Handle ID Card Photo Capture -> เปิด Crop & Enhance Modal ทันที
  const handleImageCapture = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessingImage(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const rawSrc = event.target?.result;
      if (rawSrc) {
        setRawImageForCrop(rawSrc);
        setIsCropModalOpen(true);
      }
      setProcessingImage(false);
      // Reset input value เพื่อให้สามารถเลือกรูปเดิมซ้ำได้
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.onerror = () => {
      alert('เกิดข้อผิดพลาดในการอ่านไฟล์รูปภาพ');
      setProcessingImage(false);
    };
    reader.readAsDataURL(file);
  };

  const handleApplyCroppedImage = (croppedBase64) => {
    setIdCardPreview(croppedBase64);
  };

  const handleClearImage = () => {
    setIdCardPreview(null);
    setRawImageForCrop(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const [previewing, setPreviewing] = useState(false);

  // 5. Preview PDF (โดยยังไม่ต้องบันทึกเป็นไฟล์ลง Server)
  const handlePreviewPdf = async () => {
    if (!patient) {
      setFormError('กรุณาค้นหาและเลือกข้อมูลผู้ป่วยก่อนทำการดูตัวอย่างเอกสาร');
      return;
    }
    const hasReason = inabilityReasonIds.length > 0 || inabilityReasons.length > 0 || Boolean(inabilityOther.trim());
    if (!hasReason) {
      setFormError('กรุณาเลือกเหตุผลความจำเป็นที่ผู้ป่วยไม่สามารถเดินทางมาแสดงตนได้ อย่างน้อย 1 ข้อ');
      return;
    }

    try {
      setPreviewing(true);
      setFormError(null);

      const payload = {
        sessionId,
        patientHn: patient.hn,
        relationshipId,
        relationship,
        relationshipDesc: relationshipDesc.trim() || undefined,
        inabilityReasonIds,
        inabilityReasons,
        inabilityReasonOther: inabilityOther.trim() || undefined,
        idCardImageBase64: idCardPreview || undefined,
        caregiverAddress: caregiverAddress.trim() || undefined,
        patientAddress: patientAddress.trim() || undefined,
      };

      const blob = await api.previewCaregiverPdf(payload);
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Preview error:', err);
      setFormError(err.message || 'เกิดข้อผิดพลาดในการสร้างตัวอย่างเอกสาร PDF');
    } finally {
      setPreviewing(false);
    }
  };

  // 6. Submit Form
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!patient) {
      setFormError('กรุณาค้นหาและเลือกข้อมูลผู้ป่วยก่อน');
      return;
    }
    if (!relationship) {
      setFormError('กรุณาระบุความสัมพันธ์กับผู้ป่วย');
      return;
    }
    if (inabilityReasons.length === 0 && !inabilityOther.trim()) {
      setFormError('กรุณาเลือกเหตุผลความจำเป็นอย่างน้อย 1 ข้อ');
      return;
    }
    if (!consentChecked) {
      setFormError('กรุณากดยินยอมและรับรองความถูกต้องของข้อมูล');
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);

      const payload = {
        sessionId,
        patientHn: patient.hn,
        relationshipId,
        relationship,
        relationshipDesc: relationshipDesc.trim() || undefined,
        inabilityReasonIds,
        inabilityReasons,
        inabilityReasonOther: inabilityOther.trim() || undefined,
        idCardImageBase64: idCardPreview || undefined,
        caregiverAddress: caregiverAddress.trim() || undefined,
        patientAddress: patientAddress.trim() || undefined,
      };

      const res = await api.submitCaregiverAffidavit(payload);
      if (res.success) {
        setSubmitSuccess(res.data);
      } else {
        setFormError(res.error || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
      }
    } catch (err) {
      console.error('Submit error:', err);
      setFormError(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setSubmitting(false);
    }
  };

  // Loading Session State
  if (loadingSession) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '60px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-500)' }}>
        <div style={{ display: 'inline-block', width: '36px', height: '36px', border: '3px solid #cbd5e1', borderTopColor: '#0f766e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <h3 style={{ marginTop: '16px', color: 'var(--gray-800)', fontSize: '18px', fontWeight: '700' }}>กำลังดึงข้อมูลการยืนยันตัวตนจาก MOPH ID...</h3>
        <p style={{ fontSize: '14px', marginTop: '6px' }}>กรุณารอสักครู่ ระบบกำลังตรวจสอบผลการยืนยันตัวตนของผู้ดูแล</p>
      </div>
    );
  }

  // Session Error State
  if (sessionError) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '40px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ maxWidth: '600px', width: '100%', padding: '32px 24px', background: '#fff', borderRadius: '16px', border: '1px solid #fecaca', textAlign: 'center', boxShadow: 'var(--shadow-md)' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚠️</div>
          <h2 style={{ color: '#b91c1c', fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>
            ไม่สามารถดำเนินการต่อได้
          </h2>
          <p style={{ color: 'var(--gray-600)', fontSize: '14px', marginBottom: '24px' }}>
            {sessionError}
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                if (window.opener) {
                  window.close();
                } else {
                  navigate('/caregivers');
                }
              }}
              style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--gray-300)', background: '#fff', color: 'var(--gray-700)', fontWeight: '600', cursor: 'pointer' }}
            >
              ปิดหน้าต่าง / กลับหน้ารายการ
            </button>
            <button
              type="button"
              onClick={() => {
                const newSession = `SESSION_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
                window.location.href = `https://moph.id.th/oauth/redirect?client_id=0199b8f4-6322-7b14-b21e-69a81101abc0&redirect_uri=https://telemed.rajburi.org/line&response_type=code&state=cagiver__${newSession}`;
              }}
              style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#0f766e', color: '#fff', fontWeight: '600', cursor: 'pointer' }}
            >
              ลองยืนยันตัวตน MOPH ID อีกครั้ง
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Success Modal / Screen
  if (submitSuccess) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '40px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ maxWidth: '650px', width: '100%', padding: '36px 28px', background: '#fff', borderRadius: '16px', border: '1px solid #bbf7d0', textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', fontSize: '32px' }}>
            ✅
          </div>
          <h2 style={{ color: '#15803d', fontSize: '22px', fontWeight: '700', marginBottom: '8px' }}>
            บันทึกข้อมูลและสร้างหนังสือรับรองสำเร็จ!
          </h2>
          <p style={{ color: 'var(--gray-600)', fontSize: '14px', marginBottom: '20px' }}>
            ระบบได้บันทึกความยินยอมและออกหนังสือรับรองทางอิเล็กทรอนิกส์ (PDF) เรียบร้อยแล้ว พร้อมผูกสิทธิ์เข้าถึงข้อมูล Telemedicine ให้กับผู้ดูแล
          </p>

          <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--gray-200)', textAlign: 'left', fontSize: '14px', marginBottom: '24px' }}>
            <div style={{ marginBottom: '6px' }}><strong>ผู้ดูแล:</strong> {caregiver?.caregiverFullName} (CID: {caregiver?.caregiverCid})</div>
            <div style={{ marginBottom: '6px' }}><strong>ผู้ป่วย:</strong> {patient?.fullname} (HN: {patient?.hn})</div>
            <div style={{ marginBottom: '6px' }}><strong>ความสัมพันธ์:</strong> {relationship}</div>
            <div><strong>พยานเจ้าหน้าที่:</strong> {user?.displayName || user?.name}</div>
          </div>

          <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a
              href={submitSuccess.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                backgroundColor: '#0f766e',
                color: '#fff',
                borderRadius: '10px',
                fontWeight: '600',
                fontSize: '15px',
                textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(15, 118, 110, 0.25)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              เปิดดูหนังสือรับรอง PDF (พิมพ์เอกสาร)
            </a>
            <button
              type="button"
              onClick={() => {
                if (window.opener) {
                  window.close();
                } else {
                  navigate('/caregivers');
                }
              }}
              style={{
                padding: '12px 20px',
                backgroundColor: '#fff',
                color: 'var(--gray-700)',
                border: '1px solid var(--gray-300)',
                borderRadius: '10px',
                fontWeight: '600',
                fontSize: '15px',
                cursor: 'pointer',
              }}
            >
              ปิดหน้าต่าง / กลับหน้ารายการ
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '32px 20px' }}>
      <div className="page-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* Top Header */}
        <div style={{ marginBottom: '24px' }}>
          <button
            type="button"
            onClick={() => {
              if (window.opener) {
                window.close();
              } else {
                navigate('/caregivers');
              }
            }}
            style={{ background: 'none', border: 'none', color: '#0f766e', fontWeight: '600', fontSize: '14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}
          >
            ← ย้อนกลับ / ปิดหน้าต่าง
          </button>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--gray-900)', margin: '0 0 6px 0' }}>
            หนังสือรับรองการเป็นผู้ดูแลและยินยอมเข้าถึงข้อมูลสุขภาพ (Caregiver)
          </h1>
          <p style={{ color: 'var(--gray-500)', fontSize: '14px', margin: 0 }}>
            บริการการแพทย์ทางไกล (Telemedicine) โรงพยาบาลราชบุรี
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Card 1: ข้อมูลผู้ดูแล (Auto-filled from MOPH ID / HOSxP) */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '22px 26px', marginBottom: '20px', boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                ข้อมูลผู้ดูแล / ผู้รับมอบอำนาจตามพฤตินัย
              </h3>
              <span style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '999px', backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                ✓ ยืนยันตัวตนสำเร็จ (MOPH ID IAL {caregiver?.mophIal || '2.3'})
              </span>
            </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', fontSize: '14px' }}>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '12px', marginBottom: '2px' }}>ชื่อ-นามสกุล:</span>
              <strong style={{ color: '#0f172a', fontSize: '15px' }}>{caregiver?.caregiverFullName || '-'}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '12px', marginBottom: '2px' }}>เลขประจำตัวประชาชน (CID):</span>
              <strong style={{ color: '#0f172a', fontSize: '15px' }}>{formatCid(caregiver?.caregiverCid)}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '12px', marginBottom: '2px' }}>เบอร์โทรศัพท์:</span>
              <strong style={{ color: '#0f172a', fontSize: '15px' }}>{caregiver?.caregiverPhone || '-'}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '12px', marginBottom: '2px' }}>วัน/เดือน/ปีเกิด:</span>
              <strong style={{ color: '#0f172a', fontSize: '15px' }}>{formatThaiDate(caregiver?.caregiverBirthdate)}</strong>
            </div>
            <div style={{ gridColumn: '1 / -1', marginTop: '4px' }}>
              <span style={{ color: '#64748b', display: 'block', fontSize: '12px', marginBottom: '4px' }}>ที่อยู่ตามบัตรประชาชน:</span>
              <textarea
                rows={2}
                value={caregiverAddress}
                onChange={(e) => setCaregiverAddress(e.target.value)}
                placeholder="ระบุที่อยู่ของผู้ดูแล..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  color: '#0f172a',
                  outline: 'none',
                  backgroundColor: '#f8fafc',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.15s, background-color 0.15s'
                }}
                onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.backgroundColor = '#fff'; }}
                onBlur={(e) => { e.target.style.borderColor = '#cbd5e1'; e.target.style.backgroundColor = '#f8fafc'; }}
              />
            </div>
          </div>

          {/* Relationship Fields (ย้ายมาอยู่ในกล่องข้อมูลผู้ดูแล) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                ความสัมพันธ์กับผู้ป่วย (ผู้ดูแลเป็น...ของผู้ป่วย) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={relationshipId}
                onChange={(e) => {
                  const id = parseInt(e.target.value, 10);
                  setRelationshipId(id);
                  const selected = relationshipOptions.find(opt => opt.id === id);
                  if (selected) setRelationship(selected.title);
                }}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', backgroundColor: '#fff', color: '#0f172a' }}
              >
                {relationshipOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                รายละเอียดเพิ่มเติม / ระบุ (กรณีเลือกอื่นๆ)
              </label>
              <input
                type="text"
                placeholder="เช่น ผู้ดูแลตามกฎหมาย / ผู้แทนโดยชอบธรรม"
                value={relationshipDesc}
                onChange={(e) => setRelationshipDesc(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', backgroundColor: '#fff', color: '#0f172a' }}
              />
            </div>
          </div>

          {caregiver?.mophJti && (
            <div style={{ marginTop: '12px', fontSize: '11px', color: '#64748b', borderTop: '1px dashed #e2e8f0', paddingTop: '8px' }}>
              MOPH Transaction Reference: <span style={{ fontFamily: 'monospace', color: '#475569' }}>{caregiver.mophJti}</span>
            </div>
          )}
        </div>

        {/* Card 2: ข้อมูลผู้ป่วยที่อยู่ในความดูแล */}
        <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '22px 26px', marginBottom: '20px', boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
              ข้อมูลผู้ป่วย (ผู้รับการดูแล)
            </h3>
            {patient && (
              <span style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '999px', backgroundColor: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                ✓ พบข้อมูลในระบบ HOSxP
              </span>
            )}
          </div>

          {/* Search Patient Box */}
          <div style={{ marginBottom: patient ? '18px' : '6px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
              ค้นหาข้อมูลผู้ป่วยจาก HOSxP (ระบุ HN หรือ เลขประจำตัวประชาชน) <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="กรอก HN (เช่น 0012345) หรือ เลขบัตรประชาชน 13 หลัก"
                value={patientQuery}
                onChange={(e) => setPatientQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLookupPatient(e);
                }}
                style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}
              />
              <button
                type="button"
                onClick={handleLookupPatient}
                disabled={searchingPatient}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#0f172a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: searchingPatient ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.15s'
                }}
              >
                {searchingPatient ? 'กำลังค้นหา...' : 'ค้นหาผู้ป่วย'}
              </button>
            </div>
            {patientError && (
              <div style={{ marginTop: '8px', fontSize: '13px', color: '#dc2626' }}>
                ⚠️ {patientError}
              </div>
            )}
          </div>

          {/* Patient Details (รูปแบบ ขนาด และการจัดวางเหมือนกล่องที่ 1 ทุกประการ) */}
          {patient && (
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', fontSize: '14px' }}>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '12px', marginBottom: '2px' }}>ชื่อ-นามสกุล ผู้ป่วย:</span>
                  <strong style={{ color: '#0f172a', fontSize: '15px' }}>{patient.fullname}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '12px', marginBottom: '2px' }}>เลขประจำตัวประชาชน (CID):</span>
                  <strong style={{ color: '#0f172a', fontSize: '15px' }}>{formatCid(patient.cid)}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '12px', marginBottom: '2px' }}>เลขประจำตัวผู้ป่วย (HN):</span>
                  <strong style={{ color: '#0f172a', fontSize: '15px' }}>{patient.hn}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '12px', marginBottom: '2px' }}>วัน/เดือน/ปีเกิด:</span>
                  <strong style={{ color: '#0f172a', fontSize: '15px' }}>{formatThaiDate(patient.birthday)}</strong>
                </div>
                <div style={{ gridColumn: '1 / -1', marginTop: '4px' }}>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '12px', marginBottom: '4px' }}>ที่อยู่ปัจจุบันของผู้ป่วย:</span>
                  <textarea
                    rows={2}
                    value={patientAddress}
                    onChange={(e) => setPatientAddress(e.target.value)}
                    placeholder="ระบุที่อยู่ของผู้ป่วย..."
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      lineHeight: '1.5',
                      color: '#0f172a',
                      outline: 'none',
                      backgroundColor: '#f8fafc',
                      resize: 'vertical',
                      fontFamily: 'inherit',
                      transition: 'border-color 0.15s, background-color 0.15s'
                    }}
                    onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.backgroundColor = '#fff'; }}
                    onBlur={(e) => { e.target.style.borderColor = '#cbd5e1'; e.target.style.backgroundColor = '#f8fafc'; }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Card 3: เหตุผลความจำเป็น */}
        <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid var(--gray-200)', padding: '20px 24px', marginBottom: '20px', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#000000', margin: '0 0 14px 0', borderBottom: '1px solid var(--gray-100)', paddingBottom: '10px' }}>
            เหตุผลความจำเป็นที่ผู้ป่วยไม่สามารถเดินทางมาแสดงตนได้ <span style={{ color: '#ef4444' }}>*</span>
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {reasonOptions.map((opt) => (
              <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', cursor: 'pointer', color: 'var(--gray-800)' }}>
                <input
                  type="checkbox"
                  checked={inabilityReasonIds.includes(opt.id)}
                  onChange={() => handleToggleReason(opt)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                {opt.title}
              </label>
            ))}
            <div style={{ marginTop: '6px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--gray-700)', marginBottom: '4px' }}>
                เหตุผลอื่นๆ (ถ้ามี):
              </label>
              <input
                type="text"
                placeholder="ระบุเหตุผลอื่นๆ..."
                value={inabilityOther}
                onChange={(e) => setInabilityOther(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--gray-300)', fontSize: '14px', outline: 'none' }}
              />
            </div>
          </div>
        </div>

        {/* Card 4: ถ่ายรูปบัตรประชาชนผู้ป่วย (ด้านหน้า) */}
        <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid var(--gray-200)', padding: '20px 24px', marginBottom: '20px', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#000000', margin: '0 0 10px 0', borderBottom: '1px solid var(--gray-100)', paddingBottom: '10px' }}>
            หลักฐานภาพถ่ายบัตรประชาชนผู้ป่วย (ด้านหน้า)
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--gray-500)', margin: '0 0 14px 0' }}>
            ถ่ายเฉพาะด้านหน้าบัตรประจำตัวประชาชนของผู้ป่วยตัวจริง โดยไม่ต้องเสียบบัตรที่เครื่องอ่านบัตร ให้เห็นตัวอักษรและรูปถ่ายชัดเจน
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageCapture}
            style={{ display: 'none' }}
            id="input-patient-idcard"
          />

          {!idCardPreview ? (
            <div style={{ textAlign: 'center', padding: '28px', border: '2px dashed var(--gray-300)', borderRadius: '12px', background: '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                  <circle cx="12" cy="13" r="4"></circle>
                </svg>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={processingImage}
                style={{
                  padding: '10px 22px',
                  backgroundColor: '#0f766e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: processingImage ? 'not-allowed' : 'pointer',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                {processingImage ? 'กำลังประมวลผลรูปภาพ...' : 'ถ่ายรูปบัตร หรือเลือกรูปภาพ'}
              </button>
              <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '8px' }}>
                (รองรับกล้อง iPad, แท็บเล็ต, สมาร์ตโฟน และไฟล์รูปภาพ JPG / PNG)
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'inline-block', position: 'relative', border: '2px solid #cbd5e1', borderRadius: '10px', overflow: 'hidden', maxWidth: '360px', width: '100%', boxShadow: 'var(--shadow-md)' }}>
                <img
                  src={idCardPreview}
                  alt="ภาพถ่ายบัตรประชาชนผู้ป่วย"
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </div>
              <div style={{ marginTop: '12px', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setIsCropModalOpen(true)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#eff6ff',
                    color: '#1d4ed8',
                    border: '1px solid #bfdbfe',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"></path>
                    <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"></path>
                  </svg>
                  ปรับแต่ง / ตัดครอบภาพ (Crop & Enhance)
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ padding: '8px 16px', backgroundColor: 'var(--gray-100)', color: 'var(--gray-700)', border: '1px solid var(--gray-300)', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}
                >
                  ถ่ายใหม่ / เปลี่ยนรูป
                </button>
                <button
                  type="button"
                  onClick={handleClearImage}
                  style={{ padding: '8px 16px', backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}
                >
                  ลบรูปภาพ
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Card 5: คำรับรองของผู้ดูแลและการยินยอมตามกฎหมาย */}
        <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid var(--gray-200)', padding: '20px 24px', marginBottom: '24px', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#000000', margin: '0 0 12px 0', borderBottom: '1px solid var(--gray-100)', paddingBottom: '10px' }}>
            คำรับรองของผู้ดูแลและการยินยอมตามกฎหมาย
          </h3>

          <div style={{ background: '#f8fafc', padding: '16px 20px', borderRadius: '10px', border: '1px solid var(--gray-300)', marginBottom: '18px', fontSize: '13.5px', lineHeight: '1.6', color: '#1e293b' }}>
            <div style={{ marginBottom: '12px' }}>
              <strong>1. คำรับรองความถูกต้อง :</strong> ข้าพเจ้าขอรับรองว่า ข้าพเจ้าเป็นผู้บริบาลและดูแลการรักษาพยาบาลของผู้ป่วยรายนี้อยู่จริง และการนำบัตรประจำตัวประชาชนตัวจริงของผู้ป่วยมาแสดงในครั้งนี้ เป็นไปเพื่อประโยชน์สูงสุดในการรักษาพยาบาลและการบริบาลสุขภาพอย่างต่อเนื่องของผู้ป่วย
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>2. ขอบเขตการดำเนินการแทน :</strong> ข้าพเจ้าในฐานะผู้ดูแล มีความประสงค์และขอความยินยอมในการกระทำแทนผู้ป่วย ดังนี้:
              <ul style={{ margin: '6px 0 0 20px', padding: 0 }}>
                <li>เข้าถึง เรียกดู และรับทราบข้อมูลประวัติสุขภาพอิเล็กทรอนิกส์ (EMR), ผลการตรวจทางห้องปฏิบัติการ, ผลเอกซเรย์ และรายการยา</li>
                <li>สื่อสาร ให้ข้อมูลอาการ ปรึกษาแพทย์ และรับฟังคำแนะนำทางการแพทย์ผ่านระบบบริการการแพทย์ทางไกล (Telemedicine)</li>
                <li>รับคำสั่งการรักษา ใบสั่งยา และดำเนินการประสานรับยา/เวชภัณฑ์แทนผู้ป่วย</li>
              </ul>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>3. การรับรองความรับผิดชอบ :</strong> ข้าพเจ้าขอรับรองว่าข้อความทั้งหมดเป็นความจริง หากเกิดกรณีพิพาท ข้อโต้แย้งสิทธิ์ภายในครอบครัว หรือความเสียหายใดๆ อันเกิดจากการแอบอ้างสิทธิ์โดยมิชอบ ข้าพเจ้ายินยอมรับผิดชอบตามกฎหมายทั้งทางแพ่งและทางอาญาแต่เพียงผู้เดียว โดยโรงพยาบาลและบุคลากรทางการแพทย์ไม่มีส่วนเกี่ยวข้อง
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>4. ความยินยอมด้านข้อมูลส่วนบุคคล (PDPA) :</strong> ข้าพเจ้ารับทราบและยินยอมให้โรงพยาบาลจัดเก็บ ใช้ และประมวลผลข้อมูลส่วนบุคคลและข้อมูลสุขภาพ เพื่อประโยชน์ในการให้บริการการแพทย์ทางไกล การบริบาลรักษาพยาบาล และการตรวจสอบความถูกต้องย้อนหลัง
            </div>
            <div>
              <strong>5. การสิ้นสุดของคำรับรอง :</strong> หนังสือฉบับนี้มีผลบังคับใช้นับแต่วันที่ลงนาม จนกว่าจะมีการแจ้งยกเลิกเป็นลายลักษณ์อักษร หรือผู้ป่วยสามารถเดินทางมาแสดงตนเพื่อเพิกถอนสิทธิ์ด้วยตนเอง หรือเมื่อผู้ป่วยถึงแก่กรรม
            </div>
          </div>

          <div style={{ background: '#f1f5f9', padding: '14px 18px', borderRadius: '10px', border: '1px solid var(--gray-300)', marginBottom: '16px', fontSize: '14px' }}>
            <div style={{ color: 'var(--gray-600)', marginBottom: '4px' }}>
              <strong>พยานเจ้าหน้าที่ รพ. (ผู้ลงชื่อตรวจสอบในเอกสาร):</strong>
            </div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f766e' }}>
              {user?.displayName || user?.name || 'เจ้าหน้าที่โรงพยาบาลราชบุรี'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px' }}>
              (รหัสผู้ใช้งาน: {user?.name || user?.username} • ตรวจสอบสิทธิ์และรับรองคำขอ)
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13.5px', color: '#000000', cursor: 'pointer', lineHeight: '1.5', padding: '10px', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px' }}>
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              style={{ width: '18px', height: '18px', marginTop: '2px', cursor: 'pointer' }}
            />
            <span>
              <strong>ข้าพเจ้ายอมรับข้อตกลงและเงื่อนไขทั้งหมด</strong> โดยขอรับรองว่าข้อมูลข้างต้นเป็นความจริงทุกประการ ได้รับการยืนยันตัวตนของผู้ดูแลผ่าน MOPH ID (IAL 2.3) และยินยอมปฏิบัติตามกฎหมายและระเบียบของโรงพยาบาลราชบุรีทุกประการ
            </span>
          </label>
        </div>

        {/* Form Error Notice */}
        {formError && (
          <div style={{ padding: '14px 18px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', color: '#b91c1c', marginBottom: '20px', fontSize: '14px' }}>
            ⚠️ {formError}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '14px', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              if (window.opener) {
                window.close();
              } else {
                navigate('/caregivers');
              }
            }}
            disabled={submitting || previewing}
            style={{
              padding: '12px 24px',
              backgroundColor: '#fff',
              color: 'var(--gray-700)',
              border: '1px solid var(--gray-300)',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: submitting || previewing ? 'not-allowed' : 'pointer',
            }}
          >
            ยกเลิก / ปิดหน้าต่าง
          </button>
          <button
            type="button"
            onClick={handlePreviewPdf}
            disabled={submitting || previewing || !patient}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              backgroundColor: !patient || previewing ? '#f1f5f9' : '#0284c7',
              color: !patient || previewing ? '#94a3b8' : '#ffffff',
              border: !patient || previewing ? '1px solid #cbd5e1' : 'none',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: !patient || previewing ? 'not-allowed' : 'pointer',
              boxShadow: !patient || previewing ? 'none' : '0 2px 8px rgba(2, 132, 199, 0.25)',
              transition: 'all 0.15s ease',
            }}
            title={!patient ? 'กรุณาค้นหาผู้ป่วยก่อนเพื่อดูตัวอย่าง' : 'ดูตัวอย่างเอกสาร PDF (ยังไม่บันทึกลงระบบ)'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            {previewing ? 'กำลังสร้างตัวอย่าง...' : 'Preview PDF (ตัวอย่าง)'}
          </button>
          <button
            type="submit"
            disabled={submitting || previewing || !patient || !consentChecked || (inabilityReasonIds.length === 0 && !inabilityOther.trim())}
            style={{
              padding: '12px 30px',
              backgroundColor: !patient || !consentChecked || (inabilityReasonIds.length === 0 && !inabilityOther.trim()) || submitting || previewing ? 'var(--gray-400)' : '#0f766e',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: '700',
              cursor: !patient || !consentChecked || (inabilityReasonIds.length === 0 && !inabilityOther.trim()) || submitting || previewing ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 8px rgba(15, 118, 110, 0.25)',
            }}
            title={inabilityReasonIds.length === 0 && !inabilityOther.trim() ? 'กรุณาเลือกเหตุผลความจำเป็นอย่างน้อย 1 ข้อก่อนบันทึก' : ''}
          >
            {submitting ? 'กำลังบันทึกและสร้าง PDF...' : 'บันทึกและออกหนังสือรับรอง (PDF)'}
          </button>
        </div>
      </form>

      {/* Image Crop & Enhancement Modal */}
      <ImageCropModal
        isOpen={isCropModalOpen}
        rawImageSrc={rawImageForCrop || idCardPreview}
        onClose={() => setIsCropModalOpen(false)}
        onApplyCrop={handleApplyCroppedImage}
      />
      </div>
    </div>
  );
}

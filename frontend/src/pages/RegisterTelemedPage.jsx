import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import './RegisterTelemedPage.css';

function formatThaiDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const cleanStr = String(dateStr).split('T')[0];
    const parts = cleanStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const monthIndex = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const thaiMonths = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
      ];
      if (!isNaN(year) && monthIndex >= 0 && monthIndex < 12 && !isNaN(day)) {
        return `${day} ${thaiMonths[monthIndex]} ${year + 543}`;
      }
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const thaiMonths = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
    ];
    return `${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
  } catch {
    return dateStr;
  }
}

function formatToYMD(val) {
  if (!val) return null;
  if (val instanceof Date) {
    const year = val.getFullYear();
    const month = String(val.getMonth() + 1).padStart(2, '0');
    const day = String(val.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const s = String(val).trim();
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  return s;
}

export default function RegisterTelemedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Search states
  const [hnInput, setHnInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Loaded data
  const [patient, setPatient] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [maxApptDate, setMaxApptDate] = useState(null);

  // Selection & form states
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [reason, setReason] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [address, setAddress] = useState('');
  const [postcode, setPostcode] = useState('');
  const [phone, setPhone] = useState('');

  // Submission states
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(null);

  const formRef = useRef(null);

  const handleInputChange = (e) => {
    // รับเฉพาะตัวเลข สูงสุด 13 หลัก
    const val = e.target.value.replace(/\D/g, '').slice(0, 13);
    setHnInput(val);
    if (searchError) setSearchError('');
  };

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    const cleanDigits = hnInput.replace(/\D/g, '');

    if (!cleanDigits) {
      setSearchError('กรุณากรอกเลข HN (7 หลัก) หรือ เลขบัตรประชาชน (13 หลัก)');
      return;
    }

    if (cleanDigits.length !== 7 && cleanDigits.length !== 13) {
      setSearchError(
        `รูปแบบไม่ถูกต้อง: กรุณากรอกเลข HN 7 หลัก หรือ เลขบัตรประชาชน 13 หลัก (ปัจจุบันกรอก ${cleanDigits.length} หลัก)`
      );
      return;
    }

    setSearching(true);
    setSearchError('');
    setPatient(null);
    setAppointments([]);
    setSelectedAppt(null);
    setSubmitSuccess(null);
    setSubmitError('');

    try {
      const res = await api.getPatientAppointments(cleanDigits);
      setPatient(res.patient);
      setAppointments(res.appointments || []);
      setMaxApptDate(res.maxApptDate || null);
    } catch (err) {
      setSearchError(err.message || 'ไม่สามารถค้นหาข้อมูลผู้ป่วยได้');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectAppt = (appt) => {
    const thresholdDate = maxApptDate || '2026-10-14';
    const apptYMD = formatToYMD(appt.nextdate);
    const isDisallowed = appt.isDateAllowed === false || (Boolean(thresholdDate) && Boolean(apptYMD) && apptYMD > thresholdDate);
    if (appt.existingRequest || isDisallowed) return;

    setSelectedAppt(appt);
    setReason('');
    setSymptoms('');
    setAddress(patient?.address || '');
    setPostcode(patient?.postcode || '');
    setPhone(patient?.phone || '');
    setSubmitError('');
    setSubmitSuccess(null);

    setTimeout(() => {
      if (formRef.current) {
        formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAppt || !patient) return;

    const cleanReason = reason.trim();
    const cleanSymptoms = symptoms.trim();
    const cleanAddress = address.trim();
    const cleanPostcode = postcode.trim();
    const cleanPhone = phone.trim();

    if (!cleanReason) {
      setSubmitError('กรุณาระบุเหตุผลความจำเป็น');
      return;
    }
    if (!cleanSymptoms) {
      setSubmitError('กรุณาระบุอาการปัจจุบัน');
      return;
    }
    if (!cleanAddress) {
      setSubmitError('กรุณาระบุที่อยู่สำหรับจัดส่งยา');
      return;
    }
    if (!cleanPostcode) {
      setSubmitError('กรุณาระบุรหัสไปรษณีย์');
      return;
    }
    if (!cleanPhone) {
      setSubmitError('กรุณาระบุหมายเลขโทรศัพท์ที่ติดต่อได้');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const payload = {
        oapp_id: selectedAppt.oappId,
        hn: patient.hn,
        reason: cleanReason,
        symptoms: cleanSymptoms,
        address: cleanAddress,
        postcode: cleanPostcode,
        phone: cleanPhone,
      };

      const res = await api.registerTelemedRequest(payload);
      setSubmitSuccess(res);

      // Mark the selected appointment as having an existing request
      setAppointments((prev) =>
        prev.map((a) =>
          a.oappId === selectedAppt.oappId
            ? {
                ...a,
                existingRequest: {
                  id: res.id,
                  status: 'รอตรวจสอบ',
                  approve: 'PENDING',
                  reason: cleanReason,
                  symptoms: cleanSymptoms,
                  address: cleanAddress,
                  postcode: cleanPostcode,
                  phone: cleanPhone,
                },
              }
            : a
        )
      );
    } catch (err) {
      setSubmitError(err.message || 'บันทึกคำขอรับยาไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setHnInput('');
    setPatient(null);
    setAppointments([]);
    setSelectedAppt(null);
    setMaxApptDate(null);
    setSearchError('');
    setSubmitError('');
    setSubmitSuccess(null);
  };

  return (
    <>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h2 className="page-title">ลงทะเบียนขอรับยาไม่พบแพทย์</h2>
            <p className="page-subtitle">
              ค้นหาประวัตินัดหมายล่วงหน้าของผู้ป่วย และบันทึกคำขอจัดส่งยาทางไปรษณีย์
            </p>
          </div>
        </div>
      </div>

      <div className="page-body register-telemed-container">
        {/* Step 1: HN Search Card */}
        <div className="reg-step-card">
          <div className="reg-step-badge">
            <span className="reg-step-num">1</span>
            <span>ขั้นตอนที่ 1 : ค้นหาผู้ป่วย</span>
          </div>
          <form className="reg-search-form" onSubmit={handleSearch}>
            <div className="reg-search-input-group">
              <label htmlFor="hn-search-input">
                เลขประจำตัวผู้ป่วย (HN) หรือ เลขบัตรประชาชน (CID)
              </label>
              <div className="reg-input-btn-row">
                <input
                  id="hn-search-input"
                  className="reg-search-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={13}
                  placeholder="กรอกตัวเลข HN 7 หลัก หรือ CID 13 หลัก"
                  value={hnInput}
                  onChange={handleInputChange}
                  disabled={searching}
                  autoFocus
                />
                <button
                  type="submit"
                  className="reg-search-btn"
                  disabled={searching || !hnInput.trim()}
                >
                  {searching ? (
                    <>
                      <svg className="spin-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      กำลังค้นหา...
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      {hnInput.length === 7 ? 'ค้นหา (HN 7 หลัก)' : hnInput.length === 13 ? 'ค้นหา (CID 13 หลัก)' : 'ค้นหา'}
                    </>
                  )}
                </button>
              </div>

              {hnInput.length > 0 && (
                <div className="reg-input-hint-row">
                  {hnInput.length === 7 ? (
                    <span className="reg-hint-badge reg-hint-hn">
                      ✓ รูปแบบ HN (7 หลัก)
                    </span>
                  ) : hnInput.length === 13 ? (
                    <span className="reg-hint-badge reg-hint-cid">
                      ✓ รูปแบบเลขบัตรประชาชน CID (13 หลัก)
                    </span>
                  ) : (
                    <span className="reg-hint-typing">
                      กรอกแล้ว {hnInput.length} หลัก (ต้องการ 7 หลักสำหรับ HN หรือ 13 หลักสำหรับ CID)
                    </span>
                  )}
                </div>
              )}
            </div>
          </form>

          {searchError && (
            <div className="reg-error-box">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{searchError}</span>
            </div>
          )}
        </div>

        {/* Step 2: Patient Info & Upcoming Appointments */}
        {patient && (
          <div className="reg-step-card">
            {/* Patient Header Summary */}
            <div className="reg-patient-banner">
              <div className="reg-patient-info-group">
                <div className="reg-patient-avatar">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div className="reg-patient-details">
                  <div className="reg-patient-name">{patient.fullname || 'ไม่ระบุชื่อ'}</div>
                  <div className="reg-patient-badges">
                    <span className="reg-pill-badge hn-badge">HN: {patient.hn}</span>
                    {patient.cid && <span className="reg-pill-badge cid-badge">CID: {patient.cid}</span>}
                    {patient.phone && <span className="reg-pill-badge phone-badge">📞 {patient.phone}</span>}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="reg-btn-change-patient"
                onClick={handleReset}
                title="ค้นหาคนไข้รายอื่น"
              >
                🔄 เปลี่ยนผู้ป่วย
              </button>
            </div>

            {/* Appointments Section */}
            <div className="reg-step-badge">
              <span className="reg-step-num">2</span>
              <span>
                ขั้นตอนที่ 2 : เลือกรายการนัดหมายล่วงหน้า {maxApptDate ? `(เปิดรับเฉพาะนัดหมายไม่เกิน ${formatThaiDate(maxApptDate)})` : '(ที่ยังไม่ถึงกำหนด)'}
              </span>
            </div>

            {maxApptDate && (
              <div className="reg-policy-banner">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>
                  เงื่อนไขการรับยา: เปิดรับเฉพาะรายการนัดหมายที่มีกำหนด<strong>ไม่เกินวันที่ {formatThaiDate(maxApptDate)}</strong> เท่านั้น (ใบนัดที่เกินกำหนดจะไม่สามารถเลือกได้)
                </span>
              </div>
            )}

            {appointments.length === 0 ? (
              <div className="reg-no-appts-card">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div>
                  <div className="reg-no-appts-title">ไม่พบรายการนัดหมายล่วงหน้าสำหรับ HN นี้</div>
                  <div className="reg-no-appts-desc">
                    ระบบอนุญาตให้ยื่นคำขอรับยาไม่พบแพทย์ได้เฉพาะผู้ป่วยที่มีรายการนัดหมายล่วงหน้าในระบบ HOSxP เท่านั้น
                  </div>
                </div>
              </div>
            ) : (
              <div className="reg-appts-grid">
                {appointments.map((appt) => {
                  const isSelected = selectedAppt?.oappId === appt.oappId;
                  const hasReq = Boolean(appt.existingRequest);
                  const thresholdDate = maxApptDate || '2026-10-14';
                  const apptYMD = formatToYMD(appt.nextdate);
                  const isDisallowed = appt.isDateAllowed === false || (Boolean(thresholdDate) && Boolean(apptYMD) && apptYMD > thresholdDate);
                  const isDisabled = hasReq || isDisallowed;

                  let cardClass = 'reg-card-item';
                  if (isSelected) cardClass += ' is-selected';
                  if (isDisabled) cardClass += ' is-disabled';
                  if (isDisallowed) cardClass += ' is-disallowed';

                  return (
                    <div
                      key={appt.oappId}
                      className={cardClass}
                      onClick={() => {
                        if (!isDisabled) handleSelectAppt(appt);
                      }}
                    >
                      <div className="reg-card-head">
                        <div className="reg-card-date">
                          📅 {formatThaiDate(appt.nextdate)}
                        </div>
                        <div className="reg-card-badges">
                          {isDisallowed && (
                            <span className="reg-disallowed-pill" title={appt.dateDisallowedReason || 'วันนัดหมายเกินกำหนด'}>
                              เกินกำหนดเปิดรับ
                            </span>
                          )}
                          {appt.timeRange && (
                            <span className="reg-time-pill">{appt.timeRange}</span>
                          )}
                        </div>
                      </div>

                      <div className="reg-card-body">
                        <div className="reg-info-row">
                          <span className="reg-lbl">คลินิก/แผนก:</span>
                          <span className="reg-val">{appt.clinicName}</span>
                        </div>
                        <div className="reg-info-row">
                          <span className="reg-lbl">แพทย์ผู้นัด:</span>
                          <span className="reg-val">{appt.doctorName}</span>
                        </div>
                        {appt.appCause && (
                          <div className="reg-info-row">
                            <span className="reg-lbl">สาเหตุการนัด:</span>
                            <span className="reg-val">{appt.appCause}</span>
                          </div>
                        )}
                        {appt.note && (
                          <div className="reg-info-row">
                            <span className="reg-lbl">หมายเหตุ:</span>
                            <span className="reg-val text-muted">{appt.note}</span>
                          </div>
                        )}
                      </div>

                      <div className="reg-card-foot">
                        {hasReq ? (
                          <div className="reg-indicator-exists">
                            <span className="reg-dot-pending"></span>
                            ยื่นคำขอแล้ว ({appt.existingRequest.status || 'รอตรวจสอบ'})
                          </div>
                        ) : isDisallowed ? (
                          <div className="reg-disallowed-note" title={appt.dateDisallowedReason || `วันนัดหมายเกินกำหนด (เปิดรับเฉพาะนัดหมายไม่เกิน ${formatThaiDate(thresholdDate)})`}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="8" x2="12" y2="12" />
                              <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <span>เกินกำหนดเปิดรับ</span>
                          </div>
                        ) : isSelected ? (
                          <div className="reg-indicator-selected">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            เลือกรอบนัดนี้แล้ว
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="reg-btn-select"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectAppt(appt);
                            }}
                          >
                            เลือกรอบนัดนี้ →
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Registration Form (Only when appointment is selected) */}
        {selectedAppt && (
          <div className="reg-step-card reg-form-card" ref={formRef}>
            <div className="reg-step-badge">
              <span className="reg-step-num">3</span>
              <span>ขั้นตอนที่ 3 : ข้อมูลขอรับยาไม่พบแพทย์ (จัดส่งทางไปรษณีย์)</span>
            </div>

            {/* Selected Summary Banner */}
            <div className="reg-summary-banner">
              <div className="reg-summary-head">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                รอบนัดหมายที่เลือก:
              </div>
              <div className="reg-summary-body">
                วันที่ <strong>{formatThaiDate(selectedAppt.nextdate)}</strong> ({selectedAppt.timeRange || 'ไม่ระบุเวลา'}) • แผนก: <strong>{selectedAppt.clinicName}</strong> • แพทย์: <strong>{selectedAppt.doctorName}</strong>
              </div>
            </div>

            {/* Success state */}
            {submitSuccess ? (
              <div className="reg-success-card">
                <div className="reg-success-icon-wrap">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <h3 className="reg-success-title">บันทึกคำขอรับยาไม่พบแพทย์เรียบร้อยแล้ว</h3>
                <p className="reg-success-desc">
                  รายการคำขอได้รับการบันทึกลงระบบแล้ว เจ้าหน้าที่สามารถติดตามสถานะและรับเรื่องได้ที่หน้ารายชื่อผู้ยื่นความจำนง
                </p>
                <div className="reg-success-buttons">
                  <button
                    type="button"
                    className="reg-btn-submit"
                    onClick={() => navigate('/request-telemed')}
                  >
                    ไปยังหน้ารายชื่อผู้ยื่นความจำนง →
                  </button>
                  <button
                    type="button"
                    className="reg-btn-cancel"
                    onClick={handleReset}
                  >
                    ลงทะเบียนคนไข้รายถัดไป
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="reg-notice-alert">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>
                    กรุณาตรวจสอบและยืนยันข้อมูลที่อยู่สำหรับจัดส่งยาและเบอร์โทรศัพท์ของผู้ป่วยให้ถูกต้อง เพื่อความรวดเร็วในการติดต่อกลับและการจัดส่งพัสดุ
                  </span>
                </div>

                <div className="reg-form-group">
                  <label htmlFor="input-reason">
                    เหตุผลความจำเป็น <span className="reg-req-star">*</span>
                  </label>
                  <textarea
                    id="input-reason"
                    className="reg-textarea"
                    rows="2"
                    placeholder="ตัวอย่าง : น้ำท่วม ไม่สามารถเดินทางไปโรงพยาบาลได้"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                  />
                </div>

                <div className="reg-form-group">
                  <label htmlFor="input-symptoms">
                    อาการปัจจุบัน <span className="reg-req-star">*</span>
                  </label>
                  <textarea
                    id="input-symptoms"
                    className="reg-textarea"
                    rows="2"
                    placeholder="ตัวอย่าง : รับยาความดัน อาการปกติ ไม่มีอาการผิดปกติ"
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                    required
                  />
                </div>

                <div className="reg-form-group">
                  <label htmlFor="input-address">
                    ที่อยู่สำหรับจัดส่งยา <span className="reg-req-star">*</span>
                  </label>
                  <textarea
                    id="input-address"
                    className="reg-textarea"
                    rows="2"
                    placeholder="บ้านเลขที่ หมู่ ซอย ถนน ตำบล อำเภอ จังหวัด"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    required
                  />
                </div>

                <div className="reg-grid-2col">
                  <div className="reg-form-group">
                    <label htmlFor="input-postcode">
                      รหัสไปรษณีย์ <span className="reg-req-star">*</span>
                    </label>
                    <input
                      id="input-postcode"
                      className="reg-input-text font-mono"
                      type="text"
                      maxLength={10}
                      placeholder="รหัสไปรษณีย์"
                      value={postcode}
                      onChange={(e) => setPostcode(e.target.value)}
                      required
                    />
                  </div>

                  <div className="reg-form-group">
                    <label htmlFor="input-phone">
                      หมายเลขโทรศัพท์ที่ติดต่อได้ <span className="reg-req-star">*</span>
                    </label>
                    <input
                      id="input-phone"
                      className="reg-input-text font-mono"
                      type="tel"
                      maxLength={20}
                      placeholder="เช่น 0812345678"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Recorder Info */}
                <div className="reg-recorder-strip">
                  <span>ผู้บันทึกข้อมูล:</span>
                  <span className="reg-recorder-name">
                    {user?.displayName || user?.name || user?.username || 'เจ้าหน้าที่'}
                  </span>
                </div>

                {submitError && (
                  <div className="reg-error-box" style={{ marginBottom: 16 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{submitError}</span>
                  </div>
                )}

                <div className="reg-actions-row">
                  <button
                    type="submit"
                    className="reg-btn-submit"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <svg className="spin-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        กำลังบันทึกข้อมูล...
                      </>
                    ) : (
                      'บันทึกคำขอรับยา'
                    )}
                  </button>
                  <button
                    type="button"
                    className="reg-btn-cancel"
                    onClick={() => setSelectedAppt(null)}
                    disabled={submitting}
                  >
                    ยกเลิกการเลือก
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </>
  );
}

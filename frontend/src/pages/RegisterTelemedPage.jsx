import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

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

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    const cleanHn = hnInput.trim();
    if (!cleanHn) {
      setSearchError('กรุณากรอกเลข HN ที่ต้องการค้นหา');
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
      const res = await api.getPatientAppointments(cleanHn);
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

      <div className="page-body">
        {/* Step 1: HN Search Card */}
        <div className="telemed-card search-step-card">
          <div className="step-badge-label">ขั้นตอนที่ 1 : ค้นหาผู้ป่วย</div>
          <form className="hn-search-form" onSubmit={handleSearch}>
            <div className="hn-search-input-group">
              <label htmlFor="hn-search-input" className="form-label font-bold">
                เลขประจำตัวผู้ป่วย (HN)
              </label>
              <div className="hn-input-btn-row">
                <input
                  id="hn-search-input"
                  className="form-input font-mono"
                  type="text"
                  placeholder="กรอกเลข HN เช่น 123456"
                  value={hnInput}
                  onChange={(e) => setHnInput(e.target.value)}
                  disabled={searching}
                  autoFocus
                />
                <button
                  type="submit"
                  className="btn btn-primary btn-search-hn"
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
                      ค้นหา
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

          {searchError && (
            <div className="search-error-alert">
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
          <div className="telemed-card patient-appointments-card">
            {/* Patient Header Summary */}
            <div className="patient-card-header">
              <div className="patient-avatar-box">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div className="patient-meta-info">
                <div className="patient-name-title">{patient.fullname || 'ไม่ระบุชื่อ'}</div>
                <div className="patient-sub-details">
                  <span className="font-mono">HN: {patient.hn}</span>
                  {patient.cid && <span className="font-mono">CID: {patient.cid}</span>}
                  {patient.phone && <span>เบอร์โทร: {patient.phone}</span>}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleReset}
                title="ค้นหาคนไข้รายอื่น"
              >
                เปลี่ยนผู้ป่วย
              </button>
            </div>

            {/* Appointments Section */}
            <div className="appointments-section-container">
              <div className="step-badge-label">
                ขั้นตอนที่ 2 : เลือกรายการนัดหมายล่วงหน้า {maxApptDate ? `(เปิดรับเฉพาะนัดหมายไม่เกิน ${formatThaiDate(maxApptDate)})` : '(ที่ยังไม่ถึงกำหนด)'}
              </div>

              {maxApptDate && (
                <div className="appt-date-policy-notice">
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
                <div className="no-appointment-alert">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <div className="no-appt-text-group">
                    <div className="no-appt-title">ไม่พบรายการนัดหมายล่วงหน้าสำหรับ HN นี้</div>
                    <div className="no-appt-desc">
                      ระบบอนุญาตให้ยื่นคำขอรับยาไม่พบแพทย์ได้เฉพาะผู้ป่วยที่มีรายการนัดหมายล่วงหน้าในระบบ HOSxP เท่านั้น
                    </div>
                  </div>
                </div>
              ) : (
                <div className="appt-cards-grid">
                  {appointments.map((appt) => {
                    const isSelected = selectedAppt?.oappId === appt.oappId;
                    const hasReq = Boolean(appt.existingRequest);
                    const thresholdDate = maxApptDate || '2026-10-14';
                    const apptYMD = formatToYMD(appt.nextdate);
                    const isDisallowed = appt.isDateAllowed === false || (Boolean(thresholdDate) && Boolean(apptYMD) && apptYMD > thresholdDate);
                    const isDisabled = hasReq || isDisallowed;

                    let cardClass = 'reg-appt-card';
                    if (isSelected) cardClass += ' selected';
                    if (isDisabled) cardClass += ' disabled';
                    if (isDisallowed) cardClass += ' date-disallowed';

                    return (
                      <div
                        key={appt.oappId}
                        className={cardClass}
                        onClick={() => {
                          if (!isDisabled) handleSelectAppt(appt);
                        }}
                      >
                        <div className="reg-appt-header">
                          <div className="reg-appt-date font-bold">
                            {formatThaiDate(appt.nextdate)}
                          </div>
                          <div className="reg-appt-header-badges">
                            {isDisallowed && (
                              <span className="reg-appt-disallowed-badge" title={appt.dateDisallowedReason || 'วันนัดหมายเกินกำหนด'}>
                                เกินกำหนดเปิดรับ
                              </span>
                            )}
                            {appt.timeRange && (
                              <span className="reg-appt-time-badge">{appt.timeRange}</span>
                            )}
                          </div>
                        </div>

                        <div className="reg-appt-details">
                          <div className="reg-appt-detail-row">
                            <span className="label">คลินิก/แผนก:</span>
                            <span className="value">{appt.clinicName}</span>
                          </div>
                          <div className="reg-appt-detail-row">
                            <span className="label">แพทย์ผู้นัด:</span>
                            <span className="value">{appt.doctorName}</span>
                          </div>
                          {appt.appCause && (
                            <div className="reg-appt-detail-row">
                              <span className="label">สาเหตุการนัด:</span>
                              <span className="value">{appt.appCause}</span>
                            </div>
                          )}
                          {appt.note && (
                            <div className="reg-appt-detail-row">
                              <span className="label">หมายเหตุ:</span>
                              <span className="value text-muted">{appt.note}</span>
                            </div>
                          )}
                        </div>

                        <div className="reg-appt-footer">
                          {hasReq ? (
                            <div className="existing-req-badge">
                              <span className="status-dot"></span>
                              ยื่นคำขอแล้ว ({appt.existingRequest.status || 'รอตรวจสอบ'})
                            </div>
                          ) : isDisallowed ? (
                            <div className="disallowed-req-note" title={appt.dateDisallowedReason || `วันนัดหมายเกินกำหนด (เปิดรับเฉพาะนัดหมายไม่เกิน ${formatThaiDate(thresholdDate)})`}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                              </svg>
                              <span>เกินกำหนดเปิดรับ (ไม่สามารถเลือกรอบนี้ได้)</span>
                            </div>
                          ) : isSelected ? (
                            <div className="selected-indicator">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              เลือกรอบนัดนี้แล้ว
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm btn-select-appt"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectAppt(appt);
                              }}
                            >
                              เลือกรอบนัดนี้
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Registration Form (Only when appointment is selected) */}
        {selectedAppt && (
          <div className="telemed-card form-step-card" ref={formRef}>
            <div className="step-badge-label">
              ขั้นตอนที่ 3 : ข้อมูลขอรับยาไม่พบแพทย์ (จัดส่งทางไปรษณีย์)
            </div>

            {/* Selected Summary Banner */}
            <div className="selected-summary-banner">
              <div className="summary-banner-title">รอบนัดหมายที่เลือก:</div>
              <div className="summary-banner-desc">
                วันที่ <strong>{formatThaiDate(selectedAppt.nextdate)}</strong> ({selectedAppt.timeRange || 'ไม่ระบุเวลา'}) • แผนก: <strong>{selectedAppt.clinicName}</strong> • แพทย์: <strong>{selectedAppt.doctorName}</strong>
              </div>
            </div>

            {/* Success state */}
            {submitSuccess ? (
              <div className="submit-success-card">
                <div className="success-icon-box">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <h3 className="success-title">บันทึกคำขอรับยาไม่พบแพทย์เรียบร้อยแล้ว</h3>
                <p className="success-desc">
                  รายการคำขอได้รับการบันทึกลงระบบแล้ว เจ้าหน้าที่สามารถติดตามสถานะและรับเรื่องได้ที่หน้ารายชื่อผู้ยื่นความจำนง
                </p>
                <div className="success-actions-row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => navigate('/request-telemed')}
                  >
                    ไปยังหน้ารายชื่อผู้ยื่นความจำนง
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleReset}
                  >
                    ลงทะเบียนคนไข้รายถัดไป
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="telemed-request-form">
                <div className="alert-notice-box">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>
                    กรุณาตรวจสอบและยืนยันข้อมูลที่อยู่สำหรับจัดส่งยาและเบอร์โทรศัพท์ของผู้ป่วยให้ถูกต้อง เพื่อความรวดเร็วในการติดต่อกลับและการจัดส่งพัสดุ
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="input-reason">
                    เหตุผลความจำเป็น <span className="req-star">*</span>
                  </label>
                  <textarea
                    id="input-reason"
                    className="form-input form-textarea"
                    rows="2"
                    placeholder="ตัวอย่าง : น้ำท่วม ไม่สามารถเดินทางไปโรงพยาบาลได้"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="input-symptoms">
                    อาการปัจจุบัน <span className="req-star">*</span>
                  </label>
                  <textarea
                    id="input-symptoms"
                    className="form-input form-textarea"
                    rows="2"
                    placeholder="ตัวอย่าง : รับยาความดัน อาการปกติ ไม่มีอาการผิดปกติ"
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="input-address">
                    ที่อยู่สำหรับจัดส่งยา <span className="req-star">*</span>
                  </label>
                  <textarea
                    id="input-address"
                    className="form-input form-textarea"
                    rows="2"
                    placeholder="บ้านเลขที่ หมู่ ซอย ถนน ตำบล อำเภอ จังหวัด"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    required
                  />
                </div>

                <div className="form-row-2col">
                  <div className="form-group">
                    <label className="form-label" htmlFor="input-postcode">
                      รหัสไปรษณีย์ <span className="req-star">*</span>
                    </label>
                    <input
                      id="input-postcode"
                      className="form-input font-mono"
                      type="text"
                      maxLength={10}
                      placeholder="รหัสไปรษณีย์"
                      value={postcode}
                      onChange={(e) => setPostcode(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="input-phone">
                      หมายเลขโทรศัพท์ที่ติดต่อได้ <span className="req-star">*</span>
                    </label>
                    <input
                      id="input-phone"
                      className="form-input font-mono"
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
                <div className="recorder-info-strip">
                  <span className="recorder-label">ผู้บันทึกข้อมูล:</span>
                  <span className="recorder-value font-bold">
                    {user?.displayName || user?.name || user?.username || 'เจ้าหน้าที่'}
                  </span>
                </div>

                {submitError && (
                  <div className="submit-error-alert">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{submitError}</span>
                  </div>
                )}

                <div className="form-actions-row">
                  <button
                    type="submit"
                    className="btn btn-primary btn-submit-reg"
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
                    className="btn btn-cancel"
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

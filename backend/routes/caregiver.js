const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pool_hos, pool_vhos } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { generateCaregiverPdf } = require('../helpers/caregiverPdf');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '../uploads/caregivers');
const IDCARDS_DIR = path.join(UPLOADS_DIR, 'idcards');
const PDFS_DIR = path.join(UPLOADS_DIR, 'pdfs');

/**
 * ดึง IP Address ของ Client และตัด ::ffff: IPv6 prefix ออก
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  let ip = '';

  if (forwarded) {
    // x-forwarded-for อาจมีหลาย IP คั่นด้วย comma: "client, proxy1, proxy2"
    const ips = String(forwarded).split(',').map(s => s.trim().replace(/^::ffff:/, ''));
    // หา IP แรกที่ไม่ใช่ 127.0.0.1 หรือ ::1 (หากมี) ถ้าไม่มีให้ใช้ตัวแรก
    const realClient = ips.find(item => item && item !== '127.0.0.1' && item !== '::1');
    ip = realClient || ips[0] || '';
  }

  if (!ip) {
    ip = req.headers['x-real-ip'] || req.ip || req.socket?.remoteAddress || '-';
  }

  ip = String(ip).trim().replace(/^::ffff:/, '');
  if (ip === '::1') {
    ip = '127.0.0.1';
  }
  return ip || '-';
}

// ---------------------------------------------------------------------------
// 1. GET /api/caregiver/session/:sessionId
// ดึงข้อมูล Caregiver จาก Session และค้นหาข้อมูลเพิ่มเติมจาก hos.patient
// ---------------------------------------------------------------------------
router.get('/session/:sessionId', authenticateToken, async (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  let connVhos;
  let connHos;
  try {
    connVhos = await pool_vhos.getConnection();
    const rows = await connVhos.query(`
      SELECT 
        session_id, moph_account_id, caregiver_cid, caregiver_prefix, caregiver_name, caregiver_surname,
        caregiver_phone, caregiver_birthdate, moph_jti, moph_ial, status, created_at
      FROM caregiver_sessions
      WHERE session_id = ?
      LIMIT 1
    `, [sessionId]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูล Session หรือ Session หมดอายุแล้ว' });
    }

    const session = rows[0];

    // ตรวจสอบ IAL Level ต้องไม่ต่ำกว่า 2.3
    const ialNum = parseFloat(session.moph_ial || '0') || 0;
    if (ialNum < 2.3 || session.status === 'REJECTED') {
      return res.status(403).json({
        error: `ระดับการยืนยันตัวตน MOPH ID (${session.moph_ial || 'ไม่ระบุ'}) ต่ำกว่า 2.3 ไม่อนุญาตให้ลงทะเบียนเป็นผู้ดูแล (Caregiver)`
      });
    }

    // ข้อมูลเริ่มต้นจาก MOPH ID
    let caregiverFullName = `${session.caregiver_prefix || ''}${session.caregiver_name || ''} ${session.caregiver_surname || ''}`.trim();
    let caregiverBirthdate = session.caregiver_birthdate;
    let caregiverAddress = null;
    let caregiverAddressText = '';

    // นำ CID ไปค้นหาในตาราง hos.patient (HosXP)
    if (session.caregiver_cid) {
      try {
        connHos = await pool_hos.getConnection();
        const ptRows = await connHos.query(`
          SELECT 
            p.hn, p.cid, p.pname, p.fname, p.lname, p.birthday,
            p.addrpart, p.moopart, 
            COALESCE(NULLIF(TRIM(p.po_code), ''), rp.postcode, '') AS po_code,
            p.informaddr,
            t.name AS tmb_name, a.name AS amp_name, c.name AS chw_name
          FROM patient p
          LEFT JOIN thaiaddress t ON t.chwpart = p.chwpart AND t.amppart = p.amppart AND t.tmbpart = p.tmbpart AND t.codetype = '3'
          LEFT JOIN thaiaddress a ON a.chwpart = p.chwpart AND a.amppart = p.amppart AND a.codetype = '2'
          LEFT JOIN thaiaddress c ON c.chwpart = p.chwpart AND c.codetype = '1'
          LEFT JOIN rbh_postalcode rp ON rp.tambon_id = CONCAT(p.chwpart, p.amppart, p.tmbpart)
          WHERE p.cid = ?
          LIMIT 1
        `, [session.caregiver_cid]);

        if (ptRows && ptRows.length > 0) {
          const pt = ptRows[0];
          caregiverFullName = `${pt.pname || ''}${pt.fname || ''} ${pt.lname || ''}`.trim();
          if (pt.birthday) caregiverBirthdate = pt.birthday;
          caregiverAddress = {
            addrpart: pt.addrpart || '',
            moopart: pt.moopart || '',
            tmb_name: pt.tmb_name || '',
            amp_name: pt.amp_name || '',
            chw_name: pt.chw_name || '',
            po_code: pt.po_code || '',
            informaddr: pt.informaddr || ''
          };

          const parts = [];
          if (pt.addrpart) parts.push(`บ้านเลขที่ ${pt.addrpart}`);
          if (pt.moopart && pt.moopart !== '-' && pt.moopart !== '0') parts.push(`หมู่ที่ ${pt.moopart}`);
          if (pt.tmb_name) parts.push(`ตำบล/แขวง ${pt.tmb_name.replace(/^(ต\.|ตำบล)/, '')}`);
          if (pt.amp_name) parts.push(`อำเภอ/เขต ${pt.amp_name.replace(/^(อ\.|อำเภอ)/, '')}`);
          if (pt.chw_name) parts.push(`จังหวัด ${pt.chw_name.replace(/^(จ\.|จังหวัด)/, '')}`);
          if (pt.po_code) parts.push(`รหัสไปรษณีย์ ${pt.po_code}`);
          caregiverAddressText = parts.length > 0 ? parts.join(' ') : (pt.informaddr || '');
        }
      } catch (hosErr) {
        console.warn('Could not lookup caregiver in hos.patient:', hosErr.message);
      }
    }

    res.json({
      success: true,
      data: {
        sessionId: session.session_id,
        caregiverCid: session.caregiver_cid,
        caregiverFullName,
        caregiverName: session.caregiver_name,
        caregiverSurname: session.caregiver_surname,
        caregiverPhone: session.caregiver_phone, // ใช้จาก MOPH ID เสมอ
        caregiverBirthdate,
        caregiverAddress,
        caregiverAddressText,
        mophJti: session.moph_jti,
        mophIal: session.moph_ial || '2.3',
        status: session.status,
        createdAt: session.created_at
      }
    });
  } catch (err) {
    console.error('Error fetching caregiver session:', err.message);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล Session' });
  } finally {
    if (connVhos) connVhos.release();
    if (connHos) connHos.release();
  }
});

// ---------------------------------------------------------------------------
// 2. GET /api/caregiver/patient-lookup?q=...
// ค้นหาข้อมูลผู้ป่วยจาก HOSxP ด้วย HN หรือ CID
// ---------------------------------------------------------------------------
router.get('/patient-lookup', authenticateToken, async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'กรุณาระบุ HN หรือ เลขประจำตัวประชาชนผู้ป่วย' });
  }

  let conn;
  try {
    conn = await pool_hos.getConnection();
    const cleanQ = query.replace(/[^0-9]/g, '');

    // ค้นหาด้วย HN หรือ CID พร้อมที่อยู่ครบถ้วน
    const rows = await conn.query(`
      SELECT 
        p.hn, p.cid, 
        CONCAT(COALESCE(p.pname,''), COALESCE(p.fname,''), ' ', COALESCE(p.lname,'')) AS fullname,
        p.birthday, p.sex, p.informaddr, p.pttype,
        p.addrpart, p.moopart, 
        COALESCE(NULLIF(TRIM(p.po_code), ''), rp.postcode, '') AS po_code,
        t.name AS tmb_name, a.name AS amp_name, c.name AS chw_name
      FROM patient p
      LEFT JOIN thaiaddress t ON t.chwpart = p.chwpart AND t.amppart = p.amppart AND t.tmbpart = p.tmbpart AND t.codetype = '3'
      LEFT JOIN thaiaddress a ON a.chwpart = p.chwpart AND a.amppart = p.amppart AND a.codetype = '2'
      LEFT JOIN thaiaddress c ON c.chwpart = p.chwpart AND c.codetype = '1'
      LEFT JOIN rbh_postalcode rp ON rp.tambon_id = CONCAT(p.chwpart, p.amppart, p.tmbpart)
      WHERE p.hn = ? OR p.cid = ?
      LIMIT 1
    `, [query, cleanQ]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ป่วยในระบบ HOSxP' });
    }

    const pt = rows[0];
    const addrParts = [];
    if (pt.addrpart) addrParts.push(`บ้านเลขที่ ${pt.addrpart}`);
    if (pt.moopart && pt.moopart !== '-' && pt.moopart !== '0') addrParts.push(`หมู่ที่ ${pt.moopart}`);
    if (pt.tmb_name) addrParts.push(`ตำบล/แขวง ${pt.tmb_name.replace(/^(ต\.|ตำบล)/, '')}`);
    if (pt.amp_name) addrParts.push(`อำเภอ/เขต ${pt.amp_name.replace(/^(อ\.|อำเภอ)/, '')}`);
    if (pt.chw_name) addrParts.push(`จังหวัด ${pt.chw_name.replace(/^(จ\.|จังหวัด)/, '')}`);
    if (pt.po_code) addrParts.push(`รหัสไปรษณีย์ ${pt.po_code}`);
    const fullPatientAddress = addrParts.length > 0 ? addrParts.join(' ') : (pt.informaddr || '-');

    res.json({
      success: true,
      data: {
        hn: pt.hn,
        cid: pt.cid,
        fullname: pt.fullname,
        birthday: pt.birthday,
        sex: pt.sex === '1' ? 'ชาย' : (pt.sex === '2' ? 'หญิง' : '-'),
        address: fullPatientAddress,
        addressObj: {
          addrpart: pt.addrpart || '',
          moopart: pt.moopart || '',
          tmb_name: pt.tmb_name || '',
          amp_name: pt.amp_name || '',
          chw_name: pt.chw_name || '',
          po_code: pt.po_code || ''
        },
        pttype: pt.pttype || '-'
      }
    });
  } catch (err) {
    console.error('Error looking up patient from HOSxP:', err.message);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล HOSxP' });
  } finally {
    if (conn) conn.release();
  }
});

// ---------------------------------------------------------------------------
// 2. GET /api/caregiver/master-options
// ดึงข้อมูลตัวเลือกความสัมพันธ์ และเหตุผลความจำเป็นจากตาราง Master Data
// ---------------------------------------------------------------------------
router.get('/master-options', authenticateToken, async (req, res) => {
  let conn;
  try {
    conn = await pool_vhos.getConnection();
    const relationships = await conn.query(`
      SELECT id, title, sort_order 
      FROM caregiver_relationships 
      WHERE is_active = 1 
      ORDER BY sort_order ASC, id ASC
    `);
    const inabilityReasons = await conn.query(`
      SELECT id, title, sort_order 
      FROM caregiver_inability_reasons 
      WHERE is_active = 1 
      ORDER BY sort_order ASC, id ASC
    `);
    res.json({
      success: true,
      data: {
        relationships,
        inabilityReasons
      }
    });
  } catch (err) {
    console.error('Error fetching caregiver master options:', err);
    res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลตัวเลือกได้: ' + err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ---------------------------------------------------------------------------
// 3. POST /api/caregiver/preview-pdf
// สร้างเอกสาร PDF เพื่อ Preview ในเบราว์เซอร์ โดยไม่บันทึกลงดิสก์หรือฐานข้อมูล
// ---------------------------------------------------------------------------
router.post('/preview-pdf', authenticateToken, requireAdmin, async (req, res) => {
  const {
    sessionId,
    patientHn,
    relationship,
    relationshipDesc,
    inabilityReasons,
    inabilityReasonOther,
    idCardImageBase64,
    caregiverAddress: reqCaregiverAddress,
    patientAddress: reqPatientAddress
  } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }
  if (!patientHn) {
    return res.status(400).json({ error: 'กรุณาระบุข้อมูลผู้ป่วย (HN)' });
  }

  let connVhos;
  let connHos;
  try {
    connVhos = await pool_vhos.getConnection();

    // ดึงข้อมูล Session ผู้ดูแล
    const sessionRows = await connVhos.query(`
      SELECT 
        session_id, moph_account_id, caregiver_cid, caregiver_prefix, caregiver_name, caregiver_surname,
        caregiver_phone, caregiver_birthdate, moph_jti, moph_ial, status
      FROM caregiver_sessions
      WHERE session_id = ?
      LIMIT 1
    `, [sessionId]);

    if (!sessionRows || sessionRows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบ Session ผู้ดูแล หรือหมดอายุแล้ว' });
    }

    const session = sessionRows[0];

    // ตรวจสอบ IAL Level ต้องไม่ต่ำกว่า 2.3
    const ialNum = parseFloat(session.moph_ial || '0') || 0;
    if (ialNum < 2.3 || session.status === 'REJECTED') {
      return res.status(403).json({
        error: `ระดับการยืนยันตัวตน MOPH ID (${session.moph_ial || 'ไม่ระบุ'}) ต่ำกว่า 2.3 ไม่อนุญาตให้ลงทะเบียนเป็นผู้ดูแล (Caregiver)`
      });
    }
    let caregiverFullName = `${session.caregiver_prefix || ''}${session.caregiver_name || ''} ${session.caregiver_surname || ''}`.trim();
    let caregiverBirthdate = session.caregiver_birthdate;
    let caregiverAddress = reqCaregiverAddress || null;

    connHos = await pool_hos.getConnection();

    // ดึงข้อมูลชื่อและที่อยู่ของผู้ดูแลจาก hos.patient (ptname_hos)
    let ptname_hos = '';
    if (session.caregiver_cid) {
      try {
        const cgRows = await connHos.query(`
          SELECT 
            p.hn, p.cid, p.pname, p.fname, p.lname, p.birthday,
            CONCAT(COALESCE(p.pname,''), COALESCE(p.fname,''), ' ', COALESCE(p.lname,'')) AS ptname_hos,
            p.addrpart, p.moopart, p.po_code, p.informaddr,
            t.name AS tmb_name, a.name AS amp_name, c.name AS chw_name
          FROM patient p
          LEFT JOIN thaiaddress t ON t.chwpart = p.chwpart AND t.amppart = p.amppart AND t.tmbpart = p.tmbpart AND t.codetype = '3'
          LEFT JOIN thaiaddress a ON a.chwpart = p.chwpart AND a.amppart = p.amppart AND a.codetype = '2'
          LEFT JOIN thaiaddress c ON c.chwpart = p.chwpart AND c.codetype = '1'
          WHERE p.cid = ?
          LIMIT 1
        `, [session.caregiver_cid]);

        if (cgRows && cgRows.length > 0) {
          const cg = cgRows[0];
          ptname_hos = (cg.ptname_hos || `${cg.pname || ''}${cg.fname || ''} ${cg.lname || ''}`).trim();
          if (ptname_hos) caregiverFullName = ptname_hos;
          if (cg.birthday) caregiverBirthdate = cg.birthday;
          if (!caregiverAddress) {
            caregiverAddress = {
              addrpart: cg.addrpart || '',
              moopart: cg.moopart || '',
              tmb_name: cg.tmb_name || '',
              amp_name: cg.amp_name || '',
              chw_name: cg.chw_name || '',
              po_code: cg.po_code || '',
              informaddr: cg.informaddr || ''
            };
          }
        }
      } catch (cgErr) {
        console.warn('Preview: Could not query caregiver in hos.patient:', cgErr.message);
      }
    }

    // ดึงข้อมูลผู้ป่วยจาก hos.patient
    const ptRows = await connHos.query(`
      SELECT 
        p.hn, p.cid, 
        CONCAT(COALESCE(p.pname,''), COALESCE(p.fname,''), ' ', COALESCE(p.lname,'')) AS fullname,
        p.birthday, p.addrpart, p.moopart, p.po_code, p.informaddr,
        t.name AS tmb_name, a.name AS amp_name, c.name AS chw_name
      FROM patient p
      LEFT JOIN thaiaddress t ON t.chwpart = p.chwpart AND t.amppart = p.amppart AND t.tmbpart = p.tmbpart AND t.codetype = '3'
      LEFT JOIN thaiaddress a ON a.chwpart = p.chwpart AND a.amppart = p.amppart AND a.codetype = '2'
      LEFT JOIN thaiaddress c ON c.chwpart = p.chwpart AND c.codetype = '1'
      WHERE p.hn = ?
      LIMIT 1
    `, [patientHn]);

    if (!ptRows || ptRows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ป่วยในระบบ HOSxP' });
    }

    const pt = ptRows[0];
    const patientAddress = reqPatientAddress || {
      addrpart: pt.addrpart || '',
      moopart: pt.moopart || '',
      tmb_name: pt.tmb_name || '',
      amp_name: pt.amp_name || '',
      chw_name: pt.chw_name || '',
      po_code: pt.po_code || ''
    };

    const witnessUsername = req.user?.name || req.user?.username || 'officer';
    const witnessName = req.user?.displayName || req.user?.name || 'เจ้าหน้าที่โรงพยาบาลราชบุรี';
    const userIp = getClientIp(req);

    const pdfBuffer = await generateCaregiverPdf({
      affidavitId: 0,
      sessionId,
      caregiverName: caregiverFullName,
      ptname_hos: ptname_hos || caregiverFullName,
      caregiverCid: session.caregiver_cid,
      caregiverPhone: session.caregiver_phone,
      caregiverBirthdate,
      caregiverAddress,
      patientName: pt.fullname,
      patientHn: pt.hn,
      patientCid: pt.cid || '',
      patientBirthdate: pt.birthday,
      patientAddress,
      relationship: relationship || '',
      relationshipDesc,
      inabilityReasons: Array.isArray(inabilityReasons) ? inabilityReasons : [],
      inabilityReasonOther,
      idCardImagePath: idCardImageBase64 || null,
      witnessName,
      witnessUsername,
      userIp,
      mophAccountId: session.moph_account_id,
      mophJti: session.moph_jti,
      mophIal: session.moph_ial || '2.3',
      createdAt: new Date()
    });

    const safeSessionId = sessionId ? String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_') : 'preview';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeSessionId}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error generating preview PDF:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างตัวอย่างเอกสาร: ' + err.message });
  } finally {
    if (connVhos) connVhos.release();
    if (connHos) connHos.release();
  }
});

// ---------------------------------------------------------------------------
// 4. POST /api/caregiver/submit
// บันทึกแบบฟอร์มรับรอง, อัปโหลดภาพบัตร ปชช, ออกเอกสาร PDF และผูกสิทธิ์
// ---------------------------------------------------------------------------
router.post('/submit', authenticateToken, requireAdmin, async (req, res) => {
  const {
    sessionId,
    patientHn,
    relationship,
    relationshipDesc,
    inabilityReasons,
    inabilityReasonOther,
    idCardImageBase64,
    caregiverAddress: reqCaregiverAddress,
    patientAddress: reqPatientAddress
  } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }
  if (!patientHn) {
    return res.status(400).json({ error: 'กรุณาระบุข้อมูลผู้ป่วย (HN)' });
  }
  if (!relationship) {
    return res.status(400).json({ error: 'กรุณาระบุความสัมพันธ์กับผู้ป่วย' });
  }
  const hasReasonIds = Array.isArray(req.body.inabilityReasonIds) && req.body.inabilityReasonIds.length > 0;
  const hasReasons = Array.isArray(inabilityReasons) ? inabilityReasons.length > 0 : Boolean(inabilityReasons);
  const hasOther = Boolean(inabilityReasonOther && inabilityReasonOther.trim());
  if (!hasReasonIds && !hasReasons && !hasOther) {
    return res.status(400).json({ error: 'กรุณาเลือกเหตุผลความจำเป็นที่ผู้ป่วยไม่สามารถเดินทางมาแสดงตนได้ อย่างน้อย 1 ข้อ' });
  }

  let connVhos;
  let connHos;
  try {
    connVhos = await pool_vhos.getConnection();

    // 1. ตรวจสอบ Session ข้อมูลผู้ดูแล
    const sessionRows = await connVhos.query(`
      SELECT 
        session_id, moph_account_id, caregiver_cid, caregiver_prefix, caregiver_name, caregiver_surname,
        caregiver_phone, caregiver_birthdate, moph_jti, moph_ial, status
      FROM caregiver_sessions
      WHERE session_id = ?
      LIMIT 1
    `, [sessionId]);

    if (!sessionRows || sessionRows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบ Session ผู้ดูแล หรือหมดอายุแล้ว' });
    }

    const session = sessionRows[0];

    // ตรวจสอบ IAL Level ต้องไม่ต่ำกว่า 2.3
    const ialNum = parseFloat(session.moph_ial || '0') || 0;
    if (ialNum < 2.3 || session.status === 'REJECTED') {
      return res.status(403).json({
        error: `ระดับการยืนยันตัวตน MOPH ID (${session.moph_ial || 'ไม่ระบุ'}) ต่ำกว่า 2.3 ไม่อนุญาตให้ลงทะเบียนเป็นผู้ดูแล (Caregiver)`
      });
    }

    // ข้อมูลเริ่มต้นของผู้ดูแล (Fallback จาก MOPH ID)
    let caregiverFullName = `${session.caregiver_prefix || ''}${session.caregiver_name || ''} ${session.caregiver_surname || ''}`.trim();
    let caregiverBirthdate = session.caregiver_birthdate;
    let caregiverAddress = reqCaregiverAddress || null;

    // 2. ดึงข้อมูลผู้ดูแลและข้อมูลผู้ป่วยจาก HOSxP
    connHos = await pool_hos.getConnection();

    // ดึงข้อมูลชื่อและที่อยู่ของผู้ดูแลจาก hos.patient ด้วย CID (ptname_hos)
    let ptname_hos = '';
    if (session.caregiver_cid) {
      try {
        const cgRows = await connHos.query(`
          SELECT 
            p.hn, p.cid, p.pname, p.fname, p.lname, p.birthday,
            CONCAT(COALESCE(p.pname,''), COALESCE(p.fname,''), ' ', COALESCE(p.lname,'')) AS ptname_hos,
            p.addrpart, p.moopart, p.po_code, p.informaddr,
            t.name AS tmb_name, a.name AS amp_name, c.name AS chw_name
          FROM patient p
          LEFT JOIN thaiaddress t ON t.chwpart = p.chwpart AND t.amppart = p.amppart AND t.tmbpart = p.tmbpart AND t.codetype = '3'
          LEFT JOIN thaiaddress a ON a.chwpart = p.chwpart AND a.amppart = p.amppart AND a.codetype = '2'
          LEFT JOIN thaiaddress c ON c.chwpart = p.chwpart AND c.codetype = '1'
          WHERE p.cid = ?
          LIMIT 1
        `, [session.caregiver_cid]);

        if (cgRows && cgRows.length > 0) {
          const cg = cgRows[0];
          ptname_hos = (cg.ptname_hos || `${cg.pname || ''}${cg.fname || ''} ${cg.lname || ''}`).trim();
          if (ptname_hos) caregiverFullName = ptname_hos;
          if (cg.birthday) caregiverBirthdate = cg.birthday;
          if (!caregiverAddress) {
            caregiverAddress = {
              addrpart: cg.addrpart || '',
              moopart: cg.moopart || '',
              tmb_name: cg.tmb_name || '',
              amp_name: cg.amp_name || '',
              chw_name: cg.chw_name || '',
              po_code: cg.po_code || '',
              informaddr: cg.informaddr || ''
            };
          }
        }
      } catch (cgErr) {
        console.warn('Could not query caregiver in hos.patient:', cgErr.message);
      }
    }

    // ดึงข้อมูลผู้ป่วยจาก hos.patient ด้วย HN
    const ptRows = await connHos.query(`
      SELECT 
        p.hn, p.cid, 
        CONCAT(COALESCE(p.pname,''), COALESCE(p.fname,''), ' ', COALESCE(p.lname,'')) AS fullname,
        p.birthday, p.addrpart, p.moopart, p.po_code, p.informaddr,
        t.name AS tmb_name, a.name AS amp_name, c.name AS chw_name
      FROM patient p
      LEFT JOIN thaiaddress t ON t.chwpart = p.chwpart AND t.amppart = p.amppart AND t.tmbpart = p.tmbpart AND t.codetype = '3'
      LEFT JOIN thaiaddress a ON a.chwpart = p.chwpart AND a.amppart = p.amppart AND a.codetype = '2'
      LEFT JOIN thaiaddress c ON c.chwpart = p.chwpart AND c.codetype = '1'
      WHERE p.hn = ?
      LIMIT 1
    `, [patientHn]);

    if (!ptRows || ptRows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ป่วยในระบบ HOSxP' });
    }

    const pt = ptRows[0];
    const patientAddress = reqPatientAddress || {
      addrpart: pt.addrpart || '',
      moopart: pt.moopart || '',
      tmb_name: pt.tmb_name || '',
      amp_name: pt.amp_name || '',
      chw_name: pt.chw_name || '',
      po_code: pt.po_code || ''
    };

    // จัดการบันทึกภาพถ่ายบัตรประชาชนผู้ป่วย (ถ้ามี)
    let savedImagePath = null;
    if (idCardImageBase64 && typeof idCardImageBase64 === 'string') {
      try {
        const matches = idCardImageBase64.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        let ext = 'jpg';
        let base64Data = idCardImageBase64;
        if (matches) {
          ext = matches[1] === 'png' ? 'png' : 'jpg';
          base64Data = matches[2];
        }
        const filename = `idcard_${patientHn}_${Date.now()}.${ext}`;
        savedImagePath = path.join(IDCARDS_DIR, filename);
        fs.writeFileSync(savedImagePath, Buffer.from(base64Data, 'base64'));
      } catch (imgErr) {
        console.warn('Error saving ID card image file:', imgErr.message);
      }
    }

    // ข้อมูลพยาน (เจ้าหน้าที่ รพ. ที่ Login อยู่ปัจจุบัน)
    const witnessUsername = req.user?.name || req.user?.username || 'officer';
    const witnessName = req.user?.displayName || req.user?.name || 'เจ้าหน้าที่โรงพยาบาลราชบุรี';
    const userIp = getClientIp(req);

    // แปลง/ค้นหา relationship_id จากตาราง caregiver_relationships
    let relId = req.body.relationshipId || null;
    let relTitle = relationship;
    if (relId) {
      const relRows = await connVhos.query('SELECT id, title FROM caregiver_relationships WHERE id = ? LIMIT 1', [relId]);
      if (relRows && relRows.length > 0) {
        relTitle = relRows[0].title;
      }
    } else if (relationship) {
      const relRows = await connVhos.query('SELECT id, title FROM caregiver_relationships WHERE title = ? LIMIT 1', [relationship]);
      if (relRows && relRows.length > 0) {
        relId = relRows[0].id;
      }
    }

    // แปลง/ค้นหา inability_reason_ids จากตาราง caregiver_inability_reasons
    let reasonIds = Array.isArray(req.body.inabilityReasonIds) ? req.body.inabilityReasonIds : [];
    let reasonsArr = Array.isArray(inabilityReasons) ? inabilityReasons : (inabilityReasons ? [inabilityReasons] : []);
    if (reasonIds.length > 0 && reasonsArr.length === 0) {
      const rRows = await connVhos.query('SELECT id, title FROM caregiver_inability_reasons WHERE id IN (?)', [reasonIds]);
      reasonsArr = rRows.map(r => r.title);
    } else if (reasonsArr.length > 0 && reasonIds.length === 0) {
      const rRows = await connVhos.query('SELECT id, title FROM caregiver_inability_reasons WHERE title IN (?)', [reasonsArr]);
      reasonIds = rRows.map(r => r.id);
    }

    const reasonsJson = JSON.stringify(reasonsArr);
    const reasonIdsJson = JSON.stringify(reasonIds);

    const caregiverAddressDb = typeof caregiverAddress === 'string' ? caregiverAddress : (caregiverAddress?.informaddr || JSON.stringify(caregiverAddress));
    const patientAddressDb = typeof patientAddress === 'string' ? patientAddress : (patientAddress?.informaddr || JSON.stringify(patientAddress));

    // 1. บันทึกลง caregiver_affidavits
    const insertAffidavit = await connVhos.query(`
      INSERT INTO caregiver_affidavits (
        session_id, moph_account_id, caregiver_cid, caregiver_name, caregiver_phone, caregiver_birthdate,
        caregiver_address,
        patient_hn, patient_cid, patient_name, patient_address,
        relationship_id, relationship, relationship_desc,
        inability_reason_ids, inability_reasons, inability_reason_other, patient_id_card_img,
        witness_username, witness_name, witness_position, moph_jti, moph_ial
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'เจ้าหน้าที่โรงพยาบาลราชบุรี', ?, ?)
    `, [
      sessionId,
      session.moph_account_id || null,
      session.caregiver_cid,
      caregiverFullName,
      session.caregiver_phone, // จาก MOPH ID
      caregiverBirthdate,
      caregiverAddressDb,
      pt.hn,
      pt.cid || '',
      pt.fullname,
      patientAddressDb,
      relId,
      relTitle,
      relationshipDesc || null,
      reasonIdsJson,
      reasonsJson,
      inabilityReasonOther || null,
      savedImagePath ? path.relative(path.join(__dirname, '..'), savedImagePath) : null,
      witnessUsername,
      witnessName,
      session.moph_jti,
      session.moph_ial || '2.3'
    ]);

    const affidavitId = Number(insertAffidavit.insertId);

    // 2. สร้างเอกสาร PDF รูปแบบทางการ สีดำ เลขอารบิก โดยตั้งชื่อไฟล์เป็น sessionId
    const safeSessionId = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_');
    let pdfFilename = `${safeSessionId}.pdf`;
    let pdfFullPath = path.join(PDFS_DIR, pdfFilename);
    try {
      const pdfBuffer = await generateCaregiverPdf({
        affidavitId,
        sessionId,
        caregiverName: caregiverFullName,
        ptname_hos: ptname_hos || caregiverFullName,
        caregiverCid: session.caregiver_cid,
        caregiverPhone: session.caregiver_phone, // จาก MOPH ID เสมอ
        caregiverBirthdate,
        caregiverAddress,
        patientName: pt.fullname,
        patientHn: pt.hn,
        patientCid: pt.cid || '',
        patientBirthdate: pt.birthday,
        patientAddress,
        relationship,
        relationshipDesc,
        inabilityReasons: Array.isArray(inabilityReasons) ? inabilityReasons : [],
        inabilityReasonOther,
        idCardImagePath: savedImagePath,
        witnessName,
        witnessUsername,
        userIp,
        mophAccountId: session.moph_account_id,
        mophJti: session.moph_jti,
        mophIal: session.moph_ial || '2.3',
        createdAt: new Date()
      });
      fs.writeFileSync(pdfFullPath, pdfBuffer);

      // คำนวณ SHA-256 hash ของไฟล์ PDF
      const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

      // อัปเดต pdf_path และ pdf_hash ใน caregiver_affidavits (ใช้ forward slash สำหรับ Linux/Windows)
      const relPdfPath = path.relative(path.join(__dirname, '..'), pdfFullPath).replace(/\\/g, '/');
      await connVhos.query(`
        UPDATE caregiver_affidavits 
        SET pdf_path = ?, pdf_hash = ?
        WHERE id = ?
      `, [relPdfPath, pdfHash, affidavitId]);
    } catch (pdfErr) {
      console.error('Error generating affidavit PDF:', pdfErr);
    }

    // 3. อัปเดตสถานะ Session เป็น COMPLETED
    await connVhos.query(`
      UPDATE caregiver_sessions 
      SET status = 'COMPLETED' 
      WHERE session_id = ?
    `, [sessionId]);

    // 4. ผูกสิทธิ์ไปยังตาราง caregiver_dependents (ไม่มี column relationship_desc)
    let targetLineUserId = `CID:${session.caregiver_cid}`;
    const userRows = await connVhos.query(`
      SELECT line_user_id FROM lineid WHERE cid = ? LIMIT 1
    `, [session.caregiver_cid]);
    if (userRows && userRows.length > 0 && userRows[0].line_user_id) {
      targetLineUserId = userRows[0].line_user_id;
    }

    await connVhos.query(`
      INSERT INTO caregiver_dependents (
        line_user_id, hn, cid, patient_name, relationship, ial, verify_type, added_by, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'MOPH_ID_OFFICIAL', ?, 'ACTIVE', NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        cid = VALUES(cid),
        patient_name = VALUES(patient_name),
        relationship = VALUES(relationship),
        ial = VALUES(ial),
        verify_type = 'MOPH_ID_OFFICIAL',
        status = 'ACTIVE',
        updated_at = NOW()
    `, [
      targetLineUserId,
      pt.hn,
      pt.cid || '',
      pt.fullname,
      relationship,
      session.moph_ial || '2.3',
      witnessUsername
    ]);

    res.json({
      success: true,
      message: 'บันทึกข้อมูลและสร้างหนังสือรับรองการเป็นผู้ดูแลเรียบร้อยแล้ว',
      data: {
        affidavitId,
        pdfUrl: `/api/caregiver/pdf/${affidavitId}`
      }
    });
  } catch (err) {
    console.error('Error submitting caregiver affidavit:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + err.message });
  } finally {
    if (connVhos) connVhos.release();
    if (connHos) connHos.release();
  }
});

// ---------------------------------------------------------------------------
// 4. GET /api/caregiver/list
// รายการประวัติ Caregiver ทั้งหมด สำหรับแสดงในตาราง
// ---------------------------------------------------------------------------
router.get('/list', authenticateToken, requireAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const search = (req.query.search || '').trim();
  const offset = (page - 1) * limit;

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    let whereClause = '';
    const params = [];

    if (search) {
      whereClause = `
        WHERE caregiver_name LIKE ? 
           OR caregiver_cid LIKE ? 
           OR patient_name LIKE ? 
           OR patient_hn LIKE ? 
           OR witness_name LIKE ?
      `;
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }

    const countRows = await conn.query(`
      SELECT COUNT(*) AS total FROM caregiver_affidavits ${whereClause}
    `, params);
    const total = Number(countRows[0]?.total || 0);

    const rows = await conn.query(`
      SELECT 
        id, session_id, moph_account_id, caregiver_cid, caregiver_name, caregiver_phone, caregiver_birthdate,
        patient_hn, patient_cid, patient_name, relationship_id, relationship, relationship_desc,
        inability_reason_ids, inability_reasons, inability_reason_other, witness_username, witness_name,
        moph_jti, moph_ial, pdf_path, pdf_hash, status, created_at
      FROM caregiver_affidavits
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Error fetching caregiver list:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงรายการผู้ดูแล' });
  } finally {
    if (conn) conn.release();
  }
});

// ---------------------------------------------------------------------------
// 5. PATCH /api/caregiver/:id/status
// อัปเดตสถานะ อนุมัติ / ไม่อนุมัติ
// ---------------------------------------------------------------------------
router.patch('/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !['APPROVED', 'REJECTED', 'PENDING'].includes(status)) {
    return res.status(400).json({ error: 'สถานะไม่ถูกต้อง (ต้องเป็น APPROVED หรือ REJECTED)' });
  }

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    // ตรวจสอบและดึงข้อมูลเดิม
    const rows = await conn.query(`
      SELECT id, caregiver_cid, patient_hn FROM caregiver_affidavits WHERE id = ? LIMIT 1
    `, [id]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบรายการผู้ดูแล' });
    }

    const item = rows[0];

    // อัปเดตสถานะในตาราง caregiver_affidavits
    await conn.query(`
      UPDATE caregiver_affidavits SET status = ? WHERE id = ?
    `, [status, id]);

    // ซิงก์สถานะไปยัง caregiver_dependents
    const depStatus = status === 'APPROVED' ? 'ACTIVE' : 'INACTIVE';
    await conn.query(`
      UPDATE caregiver_dependents 
      SET status = ?, updated_at = NOW() 
      WHERE hn = ? AND (line_user_id LIKE ? OR cid = ?)
    `, [depStatus, item.patient_hn, `%${item.caregiver_cid}%`, item.caregiver_cid]);

    res.json({
      success: true,
      message: `อัปเดตสถานะเป็น ${status === 'APPROVED' ? 'อนุมัติ' : 'ไม่อนุมัติ'} เรียบร้อยแล้ว`,
      data: { id: Number(id), status }
    });
  } catch (err) {
    console.error('Error updating caregiver status:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัปเดตสถานะ: ' + err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ---------------------------------------------------------------------------
// 6. GET /api/caregiver/pdf/:id
// ดู/ดาวน์โหลดไฟล์ PDF เอกสารรับรอง (พร้อมระบบ Auto-Regenerate หากไฟล์บนดิสก์ไม่อยู่)
// ---------------------------------------------------------------------------
router.get('/pdf/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  let conn;
  let connHos;
  try {
    conn = await pool_vhos.getConnection();
    const rows = await conn.query(`
      SELECT * FROM caregiver_affidavits WHERE id = ? LIMIT 1
    `, [id]);

    if (!rows || rows.length === 0) {
      return res.status(404).send('ไม่พบเอกสารรับรองในระบบ');
    }

    const item = rows[0];
    const safeSessionId = item.session_id
      ? String(item.session_id).replace(/[^a-zA-Z0-9_-]/g, '_')
      : `caregiver_affidavit_${id}`;
    const filename = `${safeSessionId}.pdf`;

    // ตรวจสอบที่อยู่ไฟล์เดิม โดยแปลง path ให้รองรับทั้ง Linux และ Windows
    let fullPdfPath = null;
    if (item.pdf_path) {
      const cleanRelativePath = item.pdf_path.replace(/\\/g, '/');
      fullPdfPath = path.resolve(__dirname, '..', cleanRelativePath);
    }

    // หากไฟล์ไม่มีอยู่จริงบนเซิร์ฟเวอร์ ให้ auto-regenerate สร้างเอกสารขึ้นมาใหม่ทันที
    if (!fullPdfPath || !fs.existsSync(fullPdfPath)) {
      if (!fs.existsSync(PDFS_DIR)) {
        fs.mkdirSync(PDFS_DIR, { recursive: true });
      }
      fullPdfPath = path.join(PDFS_DIR, `${safeSessionId}.pdf`);

      // ค้นหาวันเกิดผู้ป่วยจาก HOSxP (ถ้ามี)
      let ptBirthday = null;
      if (item.patient_hn) {
        try {
          connHos = await pool_hos.getConnection();
          const ptRows = await connHos.query('SELECT birthday FROM patient WHERE hn = ? LIMIT 1', [item.patient_hn]);
          if (ptRows && ptRows.length > 0) ptBirthday = ptRows[0].birthday;
        } catch (hErr) {
          console.warn('Error fetching patient birthday for PDF re-generation:', hErr.message);
        }
      }

      let inabilityReasons = [];
      try {
        inabilityReasons = typeof item.inability_reasons === 'string'
          ? JSON.parse(item.inability_reasons)
          : (item.inability_reasons || []);
      } catch (e) {}

      // ตรวจสอบตำแหน่งรูปภาพบัตรประชาชน (ถ้ามี)
      let resolvedIdCardPath = null;
      if (item.patient_id_card_img) {
        const cleanImgRel = item.patient_id_card_img.replace(/\\/g, '/');
        const candidateImgPath = path.resolve(__dirname, '..', cleanImgRel);
        if (fs.existsSync(candidateImgPath)) {
          resolvedIdCardPath = candidateImgPath;
        }
      }

      const pdfBuffer = await generateCaregiverPdf({
        affidavitId: item.id,
        sessionId: item.session_id,
        caregiverName: item.caregiver_name,
        ptname_hos: item.caregiver_name,
        caregiverCid: item.caregiver_cid,
        caregiverPhone: item.caregiver_phone,
        caregiverBirthdate: item.caregiver_birthdate,
        caregiverAddress: item.caregiver_address,
        patientName: item.patient_name,
        patientHn: item.patient_hn,
        patientCid: item.patient_cid,
        patientBirthdate: ptBirthday,
        patientAddress: item.patient_address,
        relationship: item.relationship,
        relationshipDesc: item.relationship_desc,
        inabilityReasons,
        inabilityReasonOther: item.inability_reason_other,
        idCardImagePath: resolvedIdCardPath,
        witnessName: item.witness_name,
        witnessUsername: item.witness_username,
        witnessPosition: item.witness_position,
        mophAccountId: item.moph_account_id,
        mophJti: item.moph_jti,
        mophIal: item.moph_ial || '2.3',
        createdAt: item.created_at || new Date()
      });

      fs.writeFileSync(fullPdfPath, pdfBuffer);

      // อัปเดต path ในฐานข้อมูลให้เป็น forward slash มาตรฐาน
      try {
        const relativeSavedPath = path.relative(path.join(__dirname, '..'), fullPdfPath).replace(/\\/g, '/');
        const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
        await conn.query('UPDATE caregiver_affidavits SET pdf_path = ?, pdf_hash = COALESCE(pdf_hash, ?) WHERE id = ?', [
          relativeSavedPath,
          pdfHash,
          item.id
        ]);
      } catch (uErr) {
        console.warn('Error updating restored pdf_path:', uErr.message);
      }
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    fs.createReadStream(fullPdfPath).pipe(res);
  } catch (err) {
    console.error('Error serving caregiver PDF:', err);
    res.status(500).send('เกิดข้อผิดพลาดในการเปิดเอกสาร PDF: ' + err.message);
  } finally {
    if (conn) conn.release();
    if (connHos) connHos.release();
  }
});

module.exports = router;

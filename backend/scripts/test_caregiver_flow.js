require('dotenv').config();
const crypto = require('crypto');
const { pool_vhos } = require('../config/database');
const { generateCaregiverPdf } = require('../helpers/caregiverPdf');

async function testFlow() {
  const conn = await pool_vhos.getConnection();
  try {
    const testSessionId = 'test-session-dev-999';
    const testMophAccountId = '165902799049006';
    const testCid = '1709900751274';

    // 1. Insert test session with moph_account_id
    await conn.query(`
      INSERT INTO caregiver_sessions 
      (session_id, moph_account_id, caregiver_cid, caregiver_prefix, caregiver_name, caregiver_surname, caregiver_phone, caregiver_birthdate, moph_jti, moph_ial, status)
      VALUES (?, ?, ?, 'นาย', 'สรวิชญ์', 'ชาญเพ็ญ', '0824811927', '1992-10-15', 'mock-jti-12345678', '2.3', 'PENDING')
      ON DUPLICATE KEY UPDATE status = 'PENDING', moph_account_id = VALUES(moph_account_id)
    `, [testSessionId, testMophAccountId, testCid]);
    console.log('✅ 1. Insert test session OK with moph_account_id:', testMophAccountId);

    // 2. Fetch session
    const sRows = await conn.query('SELECT * FROM caregiver_sessions WHERE session_id = ?', [testSessionId]);
    console.log('✅ 2. Found caregiver:', sRows[0].caregiver_name, sRows[0].caregiver_cid, 'moph_account_id:', sRows[0].moph_account_id);

    // 3. Test PDF generation with mophAccountId
    const pdfBuf = await generateCaregiverPdf({
      affidavitId: 999,
      caregiverName: 'นายสรวิชญ์ ชาญเพ็ญ',
      caregiverCid: testCid,
      caregiverPhone: '0824811927',
      caregiverBirthdate: '1992-10-15',
      patientName: 'นายสมชาย ใจดี',
      patientHn: '0012345',
      patientCid: '3709900112233',
      patientBirthdate: '1955-05-10',
      relationship: 'บุตร',
      inabilityReasons: ['เป็นผู้ป่วยติดเตียง / ภาวะพึ่งพิงสูง ไม่สามารถเคลื่อนย้ายได้'],
      witnessName: 'จนท. ทดสอบ',
      witnessUsername: 'tester',
      mophAccountId: testMophAccountId,
      mophJti: 'mock-jti-12345678',
      mophIal: '2.3'
    });
    const pdfHash = crypto.createHash('sha256').update(pdfBuf).digest('hex');
    console.log('✅ 3. PDF generation OK, bytes:', pdfBuf.length, 'pdf_hash (SHA-256):', pdfHash);

    // 4. Test Insert Affidavit with moph_account_id and pdf_hash
    const affRes = await conn.query(`
      INSERT INTO caregiver_affidavits (
        session_id, moph_account_id, caregiver_cid, caregiver_name, caregiver_phone, caregiver_birthdate,
        patient_hn, patient_cid, patient_name, relationship,
        inability_reasons, witness_username, witness_name, witness_position, moph_jti, moph_ial,
        pdf_path, pdf_hash
      ) VALUES (?, ?, ?, 'นายสรวิชญ์ ชาญเพ็ญ', '0824811927', '1992-10-15', '0012345', '3709900112233', 'นายสมชาย ใจดี', 'บุตร',
        '[]', 'tester', 'จนท. ทดสอบ', 'เจ้าหน้าที่ รพ.', 'mock-jti-12345678', '2.3', 'test.pdf', ?)
    `, [testSessionId, testMophAccountId, testCid, pdfHash]);
    const affId = affRes.insertId;
    console.log('✅ 4. Insert affidavit OK with ID:', affId);

    // 5. Test Insert caregiver_dependents WITHOUT relationship_desc
    await conn.query(`
      INSERT INTO caregiver_dependents (
        line_user_id, hn, cid, patient_name, relationship, ial, verify_type, added_by, status, created_at, updated_at
      ) VALUES (?, '0012345', '3709900112233', 'นายสมชาย ใจดี', 'บุตร', '2.3', 'MOPH_ID_OFFICIAL', 'tester', 'ACTIVE', NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        cid = VALUES(cid),
        patient_name = VALUES(patient_name),
        relationship = VALUES(relationship),
        ial = VALUES(ial),
        verify_type = 'MOPH_ID_OFFICIAL',
        status = 'ACTIVE',
        updated_at = NOW()
    `, ['CID:' + testCid]);
    console.log('✅ 5. Caregiver dependent insert OK without relationship_desc');

    // 6. Verify queried affidavit
    const affCheck = await conn.query('SELECT id, moph_account_id, pdf_hash FROM caregiver_affidavits WHERE id = ?', [affId]);
    console.log('✅ 6. Verified saved record -> moph_account_id:', affCheck[0].moph_account_id, 'pdf_hash:', affCheck[0].pdf_hash);

    // Clean up test records
    await conn.query('DELETE FROM caregiver_affidavits WHERE id = ?', [affId]);
    await conn.query('DELETE FROM caregiver_sessions WHERE session_id = ?', [testSessionId]);
    await conn.query('DELETE FROM caregiver_dependents WHERE line_user_id = ? AND hn = ?', ['CID:' + testCid, '0012345']);
    console.log('✅ 7. Test records cleaned up OK');

    console.log('🎉 ALL INTEGRATION TESTS PASSED!');
  } catch (err) {
    console.error('❌ Test failed:', err);
  } finally {
    conn.release();
    process.exit(0);
  }
}

testFlow();

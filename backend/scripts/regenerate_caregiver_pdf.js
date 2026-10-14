require('dotenv').config({ path: __dirname + '/../.env' });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool_vhos, pool_hos } = require('../config/database');
const { generateCaregiverPdf } = require('../helpers/caregiverPdf');

const PDFS_DIR = path.join(__dirname, '../uploads/caregivers/pdfs');

async function main() {
  const targetHn = process.argv[2] || '0517262';
  console.log(`Starting PDF regeneration for HN: ${targetHn}...`);

  const connVhos = await pool_vhos.getConnection();
  const connHos = await pool_hos.getConnection();

  try {
    const cleanHn = targetHn.replace(/^0+/, '');
    const affRows = await connVhos.query(
      "SELECT * FROM caregiver_affidavits WHERE patient_hn = ? OR patient_hn LIKE ? ORDER BY id DESC",
      [targetHn, `%${cleanHn}`]
    );

    if (!affRows || affRows.length === 0) {
      console.error(`❌ No affidavit found for HN: ${targetHn}`);
      process.exit(1);
    }

    for (const aff of affRows) {
      console.log(`\nProcessing Affidavit ID: ${aff.id}, session_id: ${aff.session_id}`);
      console.log(`Caregiver: ${aff.caregiver_name}, Patient: ${aff.patient_name} (HN: ${aff.patient_hn})`);
      console.log(`Witness: ${aff.witness_name} (${aff.witness_username})`);

      // 1. Fetch patient birthday from HOSxP
      let patientBirthdate = null;
      try {
        const ptRows = await connHos.query(
          "SELECT birthday, fname, lname, pname FROM patient WHERE hn = ? LIMIT 1",
          [aff.patient_hn]
        );
        if (ptRows && ptRows.length > 0) {
          patientBirthdate = ptRows[0].birthday;
          console.log(`Found patient birthday from HOSxP: ${patientBirthdate} (${ptRows[0].pname}${ptRows[0].fname} ${ptRows[0].lname})`);
        }
      } catch (ptErr) {
        console.warn('Warning: Could not fetch patient from HOSxP:', ptErr.message);
      }

      // 2. Parse inability reasons
      let reasons = [];
      try {
        reasons = typeof aff.inability_reasons === 'string'
          ? JSON.parse(aff.inability_reasons)
          : aff.inability_reasons;
      } catch (e) {
        reasons = [aff.inability_reasons];
      }

      // 3. Resolve patient ID card image path
      let idCardFullPath = null;
      if (aff.patient_id_card_img) {
        idCardFullPath = path.resolve(__dirname, '..', aff.patient_id_card_img);
        if (!fs.existsSync(idCardFullPath)) {
          console.warn(`ID card image not found on disk at: ${idCardFullPath}`);
          idCardFullPath = null;
        } else {
          console.log(`Using ID card image at: ${idCardFullPath}`);
        }
      }

      // 4. Resolve session details if available
      let mophAccountId = aff.moph_account_id;
      let mophJti = aff.moph_jti;
      let mophIal = aff.moph_ial || '2.3';

      if (aff.session_id) {
        try {
          const sRows = await connVhos.query(
            "SELECT * FROM caregiver_sessions WHERE session_id = ? LIMIT 1",
            [aff.session_id]
          );
          if (sRows && sRows.length > 0) {
            mophAccountId = mophAccountId || sRows[0].moph_account_id;
            mophJti = mophJti || sRows[0].moph_jti;
            mophIal = mophIal || sRows[0].moph_ial || '2.3';
          }
        } catch (sErr) {
          console.warn('Session query warning:', sErr.message);
        }
      }

      // 5. Generate PDF
      const pdfBuffer = await generateCaregiverPdf({
        affidavitId: aff.id,
        sessionId: aff.session_id,
        caregiverName: aff.caregiver_name,
        ptname_hos: aff.caregiver_name,
        caregiverCid: aff.caregiver_cid,
        caregiverPhone: aff.caregiver_phone,
        caregiverBirthdate: aff.caregiver_birthdate,
        caregiverAddress: aff.caregiver_address,
        patientName: aff.patient_name,
        patientHn: aff.patient_hn,
        patientCid: aff.patient_cid || '',
        patientBirthdate: patientBirthdate,
        patientAddress: aff.patient_address,
        relationship: aff.relationship,
        relationshipDesc: aff.relationship_desc,
        inabilityReasons: reasons,
        inabilityReasonOther: aff.inability_reason_other,
        idCardImagePath: idCardFullPath,
        witnessName: aff.witness_name,
        witnessUsername: aff.witness_username,
        userIp: aff.witness_ip || '172.18.5.18',
        mophAccountId: mophAccountId,
        mophJti: mophJti,
        mophIal: mophIal,
        createdAt: aff.created_at
      });

      // 6. Ensure directory exists
      if (!fs.existsSync(PDFS_DIR)) {
        fs.mkdirSync(PDFS_DIR, { recursive: true });
      }

      // 7. Write PDF file
      const safeSessionId = String(aff.session_id || `affidavit_${aff.id}`).replace(/[^a-zA-Z0-9_-]/g, '_');
      const pdfFilename = `${safeSessionId}.pdf`;
      const pdfFullPath = path.join(PDFS_DIR, pdfFilename);
      fs.writeFileSync(pdfFullPath, pdfBuffer);

      // 8. Calculate hash and update DB
      const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
      const relativePdfPath = path.relative(path.join(__dirname, '..'), pdfFullPath).replace(/\\/g, '/');

      await connVhos.query(
        "UPDATE caregiver_affidavits SET pdf_path = ?, pdf_hash = ? WHERE id = ?",
        [relativePdfPath, pdfHash, aff.id]
      );

      console.log(`✅ Saved PDF file to: ${pdfFullPath} (${pdfBuffer.length} bytes)`);
      console.log(`✅ Relative DB path: ${relativePdfPath}`);
      console.log(`✅ SHA-256 Hash: ${pdfHash}`);
    }

    console.log('\n🎉 Finished regenerating all matching caregiver PDFs successfully!');
  } finally {
    connVhos.release();
    connHos.release();
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

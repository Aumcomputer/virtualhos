const express = require('express');
const { pool_hos, pool_vhos } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function serializeRow(row) {
  if (!row) return row;
  const newRow = {};
  for (const key in row) {
    if (typeof row[key] === 'bigint') {
      newRow[key] = Number(row[key]);
    } else {
      newRow[key] = row[key];
    }
  }
  return newRow;
}

/**
 * ดึงข้อมูลราคาและวินิจฉัยจาก hos.vn_stat
 */
async function fetchVnStat(connHos, targetVn) {
  if (!targetVn) return null;
  try {
    const rows = await connHos.query(
      `SELECT vs.vn, vs.hn, vs.vstdate, vs.pdx, vs.dx0, vs.dx1, vs.dx2, vs.dx3, 
              vs.item_money, vs.paid_money, vs.remain_money, vs.uc_money, vs.rcpt_money,
              vs.pttype, pt.name AS pttype_name
       FROM vn_stat vs
       LEFT JOIN pttype pt ON vs.pttype = pt.pttype
       WHERE vs.vn = ? 
       LIMIT 1`,
      [targetVn]
    );
    if (rows && rows.length > 0) {
      return rows[0];
    }
  } catch (err) {
    console.warn('[telemed-finance] vn_stat query warning:', err.message);
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1. GET /api/telemed-finance — รายการการเงิน Telemed (3 Tabs: รอชำระเงิน, ชำระเงินแล้ว, ทั้งหมด)
// ---------------------------------------------------------------------------
router.get('/', authenticateToken, async (req, res) => {
  const tab = (req.query.tab || 'pending').trim(); // 'pending' | 'paid' | 'all'
  const search = (req.query.search || '').trim().toLowerCase();

  let connVhos;
  let connHos;
  try {
    connVhos = await pool_vhos.getConnection();
    connHos = await pool_hos.getConnection();

    // 1. ซิงก์ข้อมูล prescreening ที่เสร็จสิ้นแล้วเข้า telemed_stat อัตโนมัติ
    try {
      await connVhos.query(`
        INSERT INTO virtualhos.telemed_stat (
          prescreening_id, oapp_id, hn, vn, vstdate, patient_name, doctor_code, doctor_name, clinic
        )
        SELECT 
          p.id, p.oapp_id, p.hn, p.confirmed_vn, COALESCE(p.appointment_date, DATE(p.completed_at), CURDATE()), p.patient_name, p.doctor_code, p.doctor_name, p.clinic
        FROM dextor.tele_prescreening p
        WHERE p.status IN ('completed', 'confirmed')
        ON DUPLICATE KEY UPDATE
          patient_name = VALUES(patient_name),
          doctor_name = VALUES(doctor_name),
          clinic = VALUES(clinic),
          vn = COALESCE(virtualhos.telemed_stat.vn, VALUES(vn))
      `);
    } catch (syncErr) {
      console.warn('[telemed-finance] auto sync prescreening warning:', syncErr.message);
    }

    // 2. ดึงรายการ oapp_id ทั้งหมดใน telemed_stat และคัดกรองเฉพาะเคสที่มี oapp.visit_vn ใน HOSxP
    const statOapps = await connVhos.query(`
      SELECT DISTINCT oapp_id 
      FROM virtualhos.telemed_stat 
      WHERE oapp_id IS NOT NULL
    `);

    let validOappIds = [];
    const oappIdMap = new Map();

    if (statOapps && statOapps.length > 0) {
      const oappIds = statOapps.map((r) => Number(r.oapp_id)).filter(Boolean);
      if (oappIds.length > 0) {
        const oappRows = await connHos.query(
          `SELECT oapp_id, visit_vn 
           FROM oapp 
           WHERE oapp_id IN (${oappIds.map(() => '?').join(',')}) 
             AND visit_vn IS NOT NULL 
             AND TRIM(visit_vn) != ''`,
          oappIds
        );

        for (const r of oappRows) {
          if (r.visit_vn) {
            const v = String(r.visit_vn).trim();
            if (v) {
              const oid = Number(r.oapp_id);
              validOappIds.push(oid);
              oappIdMap.set(oid, v);
            }
          }
        }
      }
    }

    // ถ้าไม่มีเคสไหนที่มี oapp.visit_vn เลย ให้ส่งผลลัพธ์ว่างกลับไปทันที
    if (validOappIds.length === 0) {
      return res.json({
        success: true,
        data: [],
        summary: {
          pending_count: 0,
          paid_count: 0,
          all_count: 0,
          total_pending_money: 0,
          total_item_money: 0,
        },
      });
    }

    // อัปเดต vn ใน telemed_stat ให้ตรงกับ oapp.visit_vn อัตโนมัติ
    for (const [oid, visitVn] of oappIdMap.entries()) {
      await connVhos.query(
        `UPDATE virtualhos.telemed_stat 
         SET vn = ?, updated_at = NOW() 
         WHERE oapp_id = ? AND (vn IS NULL OR vn != ?)`,
        [visitVn, oid, visitVn]
      );
    }

    // 3. ดึงรายการข้อมูลทั้งหมดที่ตรงตามเงื่อนไข oapp_id
    const query = `
      SELECT 
        ts.*,
        p.phone,
        p.address,
        p.postal_code,
        p.completed_at
      FROM virtualhos.telemed_stat ts
      LEFT JOIN dextor.tele_prescreening p ON ts.prescreening_id = p.id
      WHERE ts.oapp_id IN (${validOappIds.map(() => '?').join(',')})
      ORDER BY ts.vstdate DESC, ts.id DESC
    `;

    const rawRows = await connVhos.query(query, validOappIds);

    // 4. Enrich ข้อมูล VN วันนี้และราคาจาก vn_stat
    const allEnriched = [];
    for (const raw of rawRows) {
      const item = serializeRow(raw);

      if (!item.vn && item.oapp_id && oappIdMap.has(Number(item.oapp_id))) {
        item.vn = oappIdMap.get(Number(item.oapp_id));
      }

      if (item.vn) {
        // ดึงสิทธิจาก ovst
        try {
          const ovstPtRows = await connHos.query(
            `SELECT o.pttype, pt.name AS pttype_name 
             FROM ovst o 
             LEFT JOIN pttype pt ON o.pttype = pt.pttype 
             WHERE o.vn = ? LIMIT 1`,
            [item.vn]
          );
          if (ovstPtRows && ovstPtRows.length > 0 && ovstPtRows[0].pttype) {
            item.pttype = ovstPtRows[0].pttype;
            item.pttype_name = ovstPtRows[0].pttype_name;
          }
        } catch {
          // ignore
        }

        // ดึงข้อมูลราคาจาก vn_stat
        const stat = await fetchVnStat(connHos, item.vn);
        if (stat) {
          item.item_money = Number(stat.item_money || 0);
          item.paid_money = Number(stat.paid_money || 0);
          item.remain_money = Number(stat.remain_money || 0);
          item.uc_money = Number(stat.uc_money || 0);
          item.rcpt_money = Number(stat.rcpt_money || 0);
          item.pdx = stat.pdx || stat.dx0 || null;
          if (!item.pttype) {
            item.pttype = stat.pttype;
            item.pttype_name = stat.pttype_name;
          }
        } else {
          item.item_money = 0;
          item.paid_money = 0;
          item.remain_money = 0;
          item.uc_money = 0;
          item.rcpt_money = 0;
        }
      } else {
        item.item_money = 0;
        item.paid_money = 0;
        item.remain_money = 0;
        item.uc_money = 0;
        item.rcpt_money = 0;
      }

      // ถ้ายังไม่มี pttype ให้ดึงจาก oapp
      if (!item.pttype && item.oapp_id) {
        try {
          const oappPtRows = await connHos.query(
            `SELECT ov.pttype, pt.name AS pttype_name
             FROM oapp o
             LEFT JOIN ovst ov ON o.vn = ov.vn
             LEFT JOIN pttype pt ON ov.pttype = pt.pttype
             WHERE o.oapp_id = ? LIMIT 1`,
            [item.oapp_id]
          );
          if (oappPtRows && oappPtRows.length > 0 && oappPtRows[0].pttype) {
            item.pttype = oappPtRows[0].pttype;
            item.pttype_name = oappPtRows[0].pttype_name;
          }
        } catch {
          // ignore
        }
      }

      // สถานะรอชำระเงิน:
      // 1. ห้องยาระบุว่า PAID (มีค่าใช้จ่าย) และยังไม่ชำระ
      // 2. หรือยอด paid_money > 0 ใน HOSxP และยังไม่ชำระ
      const isPending =
        (item.pharmacy_pay_type === 'PAID' || item.status === 'รอชำระเงิน' || Number(item.paid_money) > 0) &&
        item.finance_status !== 'PAID';

      const isPaid = item.finance_status === 'PAID';

      item.is_finance_pending = isPending;
      item.is_finance_paid = isPaid;

      allEnriched.push(item);
    }

    // 5. คำนวณสรุปยอดตัวเลข KPI
    let pendingCount = 0;
    let paidCount = 0;
    let allCount = allEnriched.length;
    let totalPendingMoney = 0;
    let totalItemMoney = 0;

    for (const it of allEnriched) {
      if (it.is_finance_pending) {
        pendingCount++;
        totalPendingMoney += Number(it.paid_money || 0);
      }
      if (it.is_finance_paid) {
        paidCount++;
      }
      totalItemMoney += Number(it.item_money || 0);
    }

    // 6. กรองข้อมูลตาม Tab
    let filtered = [];
    if (tab === 'pending') {
      filtered = allEnriched.filter((it) => it.is_finance_pending);
    } else if (tab === 'paid') {
      filtered = allEnriched.filter((it) => it.is_finance_paid);
    } else {
      // 'all'
      filtered = allEnriched;
    }

    // 7. ค้นหา (Search)
    if (search) {
      filtered = filtered.filter((it) => {
        const text = `${it.hn || ''} ${it.patient_name || ''} ${it.vn || ''} ${it.phone || ''} ${it.clinic || ''}`.toLowerCase();
        return text.includes(search);
      });
    }

    res.json({
      success: true,
      data: filtered,
      summary: {
        pending_count: pendingCount,
        paid_count: paidCount,
        all_count: allCount,
        total_pending_money: totalPendingMoney,
        total_item_money: totalItemMoney,
      },
    });
  } catch (err) {
    console.error('Error fetching telemed finance data:', err);
    res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาดในการดึงข้อมูลการเงิน' });
  } finally {
    if (connVhos) connVhos.release();
    if (connHos) connHos.release();
  }
});

// ---------------------------------------------------------------------------
// 2. POST /api/telemed-finance/:id/pay — บันทึกชำระเงินเรียบร้อย
// เมื่อชำระแล้ว เคสจะย้ายไปยังแท็บ "รอจัดส่งยา" ของห้องยา
// ---------------------------------------------------------------------------
router.post('/:id/pay', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const username = req.user?.displayName || req.user?.name || req.user?.username || 'cashier';

  let connVhos;
  try {
    connVhos = await pool_vhos.getConnection();

    await connVhos.query(
      `UPDATE virtualhos.telemed_stat
       SET 
         finance_status = 'PAID',
         status = 'รอจัดส่ง',
         paid_by = ?,
         paid_at = NOW(),
         updated_at = NOW()
       WHERE id = ?`,
      [username, id]
    );

    res.json({
      success: true,
      message: 'บันทึกชำระเงินเรียบร้อยแล้ว (ส่งรายการไปยังแท็บรอจัดส่งของห้องยา)',
    });
  } catch (err) {
    console.error('Error in telemed finance pay:', err);
    res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาดในการบันทึกชำระเงิน' });
  } finally {
    if (connVhos) connVhos.release();
  }
});

module.exports = router;

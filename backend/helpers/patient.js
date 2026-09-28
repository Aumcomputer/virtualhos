const { pool_hos, pool_vhos } = require('../config/database');

// ---------------------------------------------------------------------------
// Get patient name from HOSxP by HN
// ---------------------------------------------------------------------------
async function getPatientNamesByHns(hns) {
  if (!hns || hns.length === 0) return {};
  let conn;
  try {
    conn = await pool_hos.getConnection();
    const placeholders = hns.map(() => '?').join(',');
    const stmt = `SELECT hn, CONCAT(pname, fname, ' ', lname) AS fullname FROM patient WHERE hn IN (${placeholders})`;
    const rows = await conn.query(stmt, hns);
    const map = {};
    for (const row of rows) {
      map[row.hn] = row.fullname;
    }
    return map;
  } catch (err) {
    console.error('Error fetching patient names from HOSxP:', err.message);
    return {};
  } finally {
    if (conn) conn.release();
  }
}

// ---------------------------------------------------------------------------
// Format LINE ID rows with patient names + telemed status
// ---------------------------------------------------------------------------
async function formatLineIdRows(rows) {
  // Collect HNs for batch lookup
  const hns = rows.filter(r => r.hn).map(r => r.hn);
  const nameMap = await getPatientNamesByHns(hns);

  // Collect active telemed sessions for these HNs from the dextor database
  const telemedMap = {};
  if (hns.length > 0) {
    let conn;
    try {
      conn = await pool_vhos.getConnection();
      const placeholders = hns.map(() => '?').join(',');
      const stmt = `SELECT hn, vn FROM dextor.telemed_sessions WHERE expires_at > NOW() AND active = 'Y' AND hn IN (${placeholders})`;
      const teleRows = await conn.query(stmt, hns);
      for (const r of teleRows) {
        if (!telemedMap[r.hn]) {
          telemedMap[r.hn] = {};
        }
        telemedMap[r.hn][r.vn] = true;
      }
    } catch (err) {
      console.error('Error fetching active telemed sessions:', err.message);
    } finally {
      if (conn) conn.release();
    }
  }

  return rows.map(row => {
    // Build fullname: HOSxP first, fallback to lineid table
    let fullname = '';
    if (row.hn && nameMap[row.hn]) {
      fullname = nameMap[row.hn];
    } else if (row.ptname_hos) {
      fullname = row.ptname_hos;
    } else if (row.first_name || row.last_name) {
      const parts = [row.name_prefix, row.first_name, row.last_name].filter(Boolean);
      fullname = parts.join(' ') || '';
    }

    return {
      id: row.id,
      cid: row.cid || '',
      picture_url: row.line_picture_url || null,
      display_name: row.line_display_name || '',
      hn: row.hn || '',
      fullname,
      ptname_hos: row.ptname_hos || '',
      phone: row.mobile_no || '',
      ver: row.ial || '',
      created_at: row.created_at,
      has_health_id: Boolean(row.cid),
      has_telemed: Boolean(row.hn && telemedMap[row.hn] && telemedMap[row.hn]['1111111111']),
      has_telemed_moph: Boolean(row.hn && telemedMap[row.hn] && telemedMap[row.hn]['2222222222']),
    };
  });
}

module.exports = { getPatientNamesByHns, formatLineIdRows };

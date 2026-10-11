const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pdfmake = require('pdfmake');

// กำหนดตำแหน่ง Font TH Sarabun New (เก็บไว้ที่ backend/assets/fonts)
const fontDir = [
  path.join(__dirname, '../assets/fonts'),
  path.join(__dirname, '../../fonts'),
].find(dir => fs.existsSync(path.join(dir, 'THSarabunNew.ttf'))) || path.join(__dirname, '../assets/fonts');

pdfmake.fonts = {
  THSarabunNew: {
    normal: path.join(fontDir, 'THSarabunNew.ttf'),
    bold: path.join(fontDir, 'THSarabunNew-Bold.ttf'),
    italics: path.join(fontDir, 'THSarabunNew-Italic.ttf'),
    bolditalics: path.join(fontDir, 'THSarabunNew-BoldItalic.ttf'),
  }
};

pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy(() => true);

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

/**
 * ฟังก์ชันจัดรูปแบบเลขบัตรประชาชนเป็น X-XXXX-XXXXX-XX-X
 */
function formatCid(cid) {
  if (!cid) return '-';
  const clean = String(cid).replace(/[^0-9]/g, '');
  if (clean.length === 13) {
    return `${clean[0]}-${clean.substring(1, 5)}-${clean.substring(5, 10)}-${clean.substring(10, 12)}-${clean[12]}`;
  }
  return cid;
}

/**
 * ฟังก์ชันแปลงวันที่เป็นรูปแบบภาษาไทย "11 ตุลาคม 2569"
 */
function formatThaiDate(dateInput) {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const day = d.getDate();
  const month = THAI_MONTHS[d.getMonth()];
  const year = d.getFullYear() + 543;
  return `${day} ${month} ${year}`;
}

/**
 * ฟังก์ชันแปลงวันเวลาเป็น "11 ตุลาคม 2569 เวลา 17:17 น."
 */
function formatThaiDateTime(dateInput) {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const day = d.getDate();
  const month = THAI_MONTHS[d.getMonth()];
  const year = d.getFullYear() + 543;
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} เวลา ${hours}:${minutes} น.`;
}

/**
 * แยกส่วนประกอบวันที่สำหรับหัวหนังสือ "วันที่ ... เดือน ... พ.ศ. ..."
 */
function getThaiDateParts(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  const day = d.getDate();
  const month = THAI_MONTHS[d.getMonth()];
  const year = d.getFullYear() + 543;
  return { day: String(day), month, year: String(year) };
}

/**
 * ฟังก์ชันคำนวณอายุจากวันเกิด
 */
function calculateAge(birthday) {
  if (!birthday) return '-';
  const birth = new Date(birthday);
  if (isNaN(birth.getTime())) return '-';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 ? String(age) : '-';
}

/**
 * จัดรูปแบบที่อยู่เป็นสตริง
 */
function formatAddressObj(addr) {
  if (!addr) return { house: '-', moo: '-', tmb: '-', amp: '-', chw: '-', postcode: '', isCustomText: false, customText: '-' };
  if (typeof addr === 'string') {
    return {
      house: '',
      moo: '',
      tmb: '',
      amp: '',
      chw: '',
      postcode: '',
      isCustomText: true,
      customText: addr
    };
  }
  return {
    house: addr.addrpart || addr.house || '-',
    moo: addr.moopart || addr.moo || '-',
    tmb: addr.tmb_name || addr.tmb || '-',
    amp: addr.amp_name || addr.amp || '-',
    chw: addr.chw_name || addr.chw || '-',
    postcode: addr.po_code || addr.postcode || addr.zipcode || '',
    isCustomText: Boolean(addr.customText),
    customText: addr.customText || ''
  };
}

/**
 * ฟังก์ชันวาดกล่อง Checkbox พร้อมเครื่องหมายติ๊กถูก (Vector Canvas)
 * เพื่อรองรับ font TH Sarabun New ที่ไม่มี glyph เครื่องหมายถูก
 */
function drawCheckbox(checked) {
  const canvas = [
    {
      type: 'rect',
      x: 0,
      y: 2,
      w: 10,
      h: 10,
      lineWidth: 1,
      lineColor: '#000000'
    }
  ];
  if (checked) {
    canvas.push({
      type: 'polyline',
      points: [
        { x: 2, y: 6.5 },
        { x: 4.5, y: 10 },
        { x: 8.5, y: 3.5 }
      ],
      lineWidth: 1.5,
      lineColor: '#000000'
    });
  }
  return {
    width: 'auto',
    canvas: canvas,
    margin: [0, 0, 4, 0]
  };
}

/**
 * ทำความสะอาดและจัดรูปแบบ IP Address (ตัด ::ffff: IPv6 mapping ออก)
 */
function cleanIpAddress(ip) {
  if (!ip) return '-';
  let str = String(ip).trim();
  // ตัด ::ffff: นำหน้าของ IPv4-mapped IPv6
  if (str.startsWith('::ffff:')) {
    str = str.replace('::ffff:', '');
  }
  // ถ้าเป็น IPv6 loopback (::1) ให้แสดง 127.0.0.1
  if (str === '::1') {
    str = '127.0.0.1';
  }
  return str || '-';
}

/**
 * ฟังก์ชันสร้างเอกสาร PDF หนังสือรับรองการเป็นผู้ดูแล (Caregiver Affidavit)
 * รูปแบบทางการ สีดำ เลขอารบิกทั้งหมด
 * @param {Object} data 
 * @returns {Promise<Buffer>}
 */
async function generateCaregiverPdf(data) {
  const {
    affidavitId,
    sessionId = '',
    caregiverName,
    ptname_hos,
    caregiverCid,
    caregiverPhone,
    caregiverBirthdate,
    caregiverAddress,
    patientName,
    patientHn,
    patientCid,
    patientBirthdate,
    patientAddress,
    relationship = '',
    relationshipDesc = '',
    inabilityReasons = [],
    inabilityReasonOther = '',
    idCardImagePath, // absolute path or base64 data url
    witnessName = '',
    witnessUsername = '',
    userIp = '',
    mophAccountId = '',
    mophJti = '',
    mophIal = '2.3',
    createdAt = new Date()
  } = data;

  const clientIp = cleanIpAddress(userIp);

  // ชื่อผู้ดูแล: ให้ความสำคัญกับ ptname_hos จากระบบ HOSxP เป็นอันดับแรก
  const effectiveCaregiverName = ptname_hos || caregiverName || '';

  const dateParts = getThaiDateParts(createdAt);
  const signedDateTime = formatThaiDateTime(createdAt);
  const createdDateStr = formatThaiDate(createdAt);

  // ข้อมูลผู้ดูแล
  const cgCidFormatted = formatCid(caregiverCid);
  const cgBirthFormatted = formatThaiDate(caregiverBirthdate);
  const cgAge = calculateAge(caregiverBirthdate);
  const cgAddr = formatAddressObj(caregiverAddress);

  // ข้อมูลผู้ป่วย
  const ptCidFormatted = formatCid(patientCid);
  const ptBirthFormatted = formatThaiDate(patientBirthdate);
  const ptAge = calculateAge(patientBirthdate);
  const ptAddr = formatAddressObj(patientAddress);

  // ตรวจสอบ Checkbox ความสัมพันธ์
  const relStr = String(relationship || '').trim();
  const isSpouse = relStr === 'คู่สมรส';
  const isChild = relStr === 'บุตร';
  const isParent = relStr === 'บิดา/มารดา' || relStr === 'บิดา' || relStr === 'มารดา';
  const isSibling = relStr === 'พี่น้อง' || relStr === 'พี่/น้อง' || relStr.includes('พี่') || relStr.includes('น้อง');
  const isGrandChild = relStr === 'หลาน';
  const isRelative = relStr === 'ญาติ';
  const isLegalGuardian = relStr === 'ผู้ปกครองตามกฎหมาย';
  const isOtherRel = !isSpouse && !isChild && !isParent && !isSibling && !isGrandChild && !isRelative && !isLegalGuardian;

  // ตรวจสอบ Checkbox เหตุผลความจำเป็น
  const reasonsArr = Array.isArray(inabilityReasons) ? inabilityReasons : [inabilityReasons];
  const isBedridden = reasonsArr.some(r => r.includes('ติดเตียง') || r.includes('พึ่งพิงสูง'));
  const isPhysical = reasonsArr.some(r => r.includes('ข้อจำกัดทางกายภาพ') || r.includes('การเคลื่อนไหว'));
  const isCognitive = reasonsArr.some(r => r.includes('รู้คิดบกพร่อง') || r.includes('สมองเสื่อม') || r.includes('สติสัมปชัญญะ'));
  const isChildPatient = reasonsArr.some(r => r.includes('เด็กเล็ก') || r.includes('เยาวชน'));
  const isOtherReason = Boolean(inabilityReasonOther && inabilityReasonOther.trim()) || reasonsArr.some(r => r.includes('อื่นๆ'));
  const otherReasonText = inabilityReasonOther || (reasonsArr.find(r => r.startsWith('อื่นๆ')) || '').replace(/^อื่นๆ:?\s*/, '');

  // รูปภาพบัตร ปชช ผู้ป่วย (ถ้ามี)
  let patientImageElement = null;
  if (idCardImagePath) {
    if (idCardImagePath.startsWith('data:image/')) {
      patientImageElement = {
        image: idCardImagePath,
        width: 320,
        alignment: 'center',
        margin: [0, 8, 0, 8]
      };
    } else if (fs.existsSync(idCardImagePath)) {
      try {
        const imgBuffer = fs.readFileSync(idCardImagePath);
        const ext = path.extname(idCardImagePath).toLowerCase().replace('.', '') || 'jpeg';
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        patientImageElement = {
          image: `data:${mime};base64,${imgBuffer.toString('base64')}`,
          width: 320,
          alignment: 'center',
          margin: [0, 8, 0, 8]
        };
      } catch (e) {
        console.warn('Could not load patient ID card image:', e.message);
      }
    }
  }

  // รหัสอ้างอิงผู้ลงนาม: ใช้ mophJti (ถ้าไม่มี ให้ hash md5)
  const signerRef = mophJti || crypto.createHash('md5').update(`${mophAccountId || ''}_${caregiverCid || ''}_${sessionId || ''}`).digest('hex');
  // รหัสอ้างอิงเอกสาร (session id ในรูปแบบ UUID)
  const docRef = sessionId || 'DOC-' + String(affidavitId || Date.now());

  const docDefinition = {
    pageSize: 'A4',
    // ขอบกระดาษ: ด้านบน 36 pt, ด้านซ้าย/ขวา 48 pt, ด้านล่าง 90 pt (เผื่อพื้นที่ footer สูงขึ้นไม่ให้ชนขอบล่าง)
    pageMargins: [48, 36, 48, 90],
    defaultStyle: {
      font: 'THSarabunNew',
      fontSize: 15,
      lineHeight: 1.15,
      color: '#000000'
    },
    // ท้ายกระดาษทุกหน้า ชิดขอบด้านข้าง (ซ้าย 36, ขวา 36) ยกสูงขึ้นจากขอบล่าง (margin-bottom 32 pt)
    footer: function (currentPage, pageCount) {
      const line = (text) => ({ text, margin: [0, 0, 0, 0] });

      // แบ่งรหัสอ้างอิงผู้ลงนามเป็น 2 บรรทัดหากมีความยาวเกิน 40 ตัวอักษร
      let signerRefLines = [];
      if (signerRef.length > 40) {
        const mid = Math.ceil(signerRef.length / 2);
        signerRefLines = [
          line(`รหัสอ้างอิงผู้ลงนาม: ${signerRef.slice(0, mid)}`),
          { text: signerRef.slice(mid), margin: [0, 0, 0, 0] }
        ];
      } else {
        signerRefLines = [
          { text: `รหัสอ้างอิงผู้ลงนาม: ${signerRef}`, margin: [0, 0, 0, 0] }
        ];
      }

      return {
        margin: [36, 0, 36, 32],
        columns: [
          {
            width: '*',
            fontSize: 9.5,
            lineHeight: 0.95,
            alignment: 'left',
            stack: [
              line('เจ้าหน้าที่'),
              line(`ชื่อ : ${witnessName || '-'}`),
              line(`Username: ${witnessUsername || '-'}`),
              line(`IP Address: ${clientIp}`),
              { text: `รหัสอ้างอิงเอกสาร: ${docRef}`, margin: [0, 0, 0, 0] }
            ]
          },
          {
            width: 'auto',
            alignment: 'right',
            fontSize: 9.5,
            lineHeight: 0.95,
            stack: [
              line('ลงนามลายมือชื่ออิเล็กทรอนิกส์'),
              line(`โดย: ${witnessName || '-'}`),
              line(`MOPH ID: ${mophAccountId || '-'}`),
              line(`เมื่อ: ${signedDateTime}`),
              ...signerRefLines
            ]
          }
        ]
      };
    },
    content: [
      // หัวเอกสารราชการ/โรงพยาบาล
      {
        text: 'หนังสือรับรองการเป็นผู้ดูแลและยินยอมเข้าถึงข้อมูลสุขภาพเพื่อบริการการแพทย์ทางไกล',
        fontSize: 18,
        bold: true,
        alignment: 'center',
        margin: [0, 0, 0, 2]
      },
      {
        text: '(Caregiver Affidavit & EMR Consent Form for Telemedicine Service)',
        fontSize: 14,
        alignment: 'center',
        margin: [0, 0, 0, 8]
      },

      // เขียนที่ โรงพยาบาลราชบุรี และ วันที่ (ชิดติดกัน ไม่ต้องตัวหนา จัดชิดขวา)
      {
        columns: [
          { width: '*', text: '' },
          {
            width: 'auto',
            alignment: 'right',
            stack: [
              { text: 'เขียนที่ โรงพยาบาลราชบุรี', margin: [0, 0, 0, 2] },
              { text: `วันที่ ${dateParts.day} เดือน ${dateParts.month} พ.ศ. ${dateParts.year}`, margin: [0, 0, 0, 6] }
            ]
          }
        ]
      },

      // ส่วนที่ 1: ข้อมูลผู้ดูแล
      {
        text: 'ส่วนที่ 1: ข้อมูลผู้ดูแล',
        fontSize: 15.5,
        bold: true,
        margin: [0, 3, 0, 2]
      },
      {
        text: [
          { text: 'ข้าพเจ้า  ', bold: true },
          effectiveCaregiverName || '....................................................................................'
        ],
        margin: [14, 0, 0, 2]
      },
      {
        text: [
          { text: 'เลขประจำตัวประชาชน  ', bold: true },
          `${cgCidFormatted}     `,
          { text: 'วัน/เดือน/ปี เกิด  ', bold: true },
          `${cgBirthFormatted}     `,
          { text: 'อายุ  ', bold: true },
          `${cgAge} ปี`
        ],
        margin: [14, 0, 0, 2]
      },
      ...(cgAddr.isCustomText ? [
        {
          text: [
            { text: 'ที่อยู่  ', bold: true },
            cgAddr.customText || '-'
          ],
          margin: [14, 0, 0, 2]
        },
        {
          text: [
            { text: 'หมายเลขโทรศัพท์  ', bold: true },
            caregiverPhone || '-'
          ],
          margin: [14, 0, 0, 2]
        }
      ] : [
        {
          text: [
            { text: 'ที่อยู่  ', bold: true },
            'บ้านเลขที่ ',
            cgAddr.house || '-',
            '   หมู่ที่ ',
            cgAddr.moo || '-',
            '   ตำบล/แขวง ',
            cgAddr.tmb || '-'
          ],
          margin: [14, 0, 0, 2]
        },
        {
          text: [
            { text: 'อำเภอ/เขต  ', bold: true },
            `${cgAddr.amp || '-'}   `,
            { text: 'จังหวัด  ', bold: true },
            `${cgAddr.chw || '-'}   `,
            ...(cgAddr.postcode ? [{ text: 'รหัสไปรษณีย์  ', bold: true }, `${cgAddr.postcode}   `] : []),
            { text: 'หมายเลขโทรศัพท์  ', bold: true },
            caregiverPhone || '-'
          ],
          margin: [14, 0, 0, 2]
        }
      ]),
      {
        text: [
          { text: 'ความสัมพันธ์กับผู้ป่วย ', bold: true }
        ],
        margin: [14, 2, 0, 2]
      },
      {
        columns: [
          {
            width: 100,
            columns: [drawCheckbox(isSpouse), { text: 'คู่สมรส', width: '*' }]
          },
          {
            width: 90,
            columns: [drawCheckbox(isChild), { text: 'บุตร', width: '*' }]
          },
          {
            width: 110,
            columns: [drawCheckbox(isParent), { text: 'บิดา/มารดา', width: '*' }]
          },
          {
            width: '*',
            columns: [drawCheckbox(isSibling), { text: 'พี่น้อง', width: '*' }]
          }
        ],
        margin: [28, 0, 0, 2]
      },
      {
        columns: [
          {
            width: 100,
            columns: [drawCheckbox(isGrandChild), { text: 'หลาน', width: '*' }]
          },
          {
            width: 90,
            columns: [drawCheckbox(isRelative), { text: 'ญาติ', width: '*' }]
          },
          {
            width: 150,
            columns: [drawCheckbox(isLegalGuardian), { text: 'ผู้ปกครองตามกฎหมาย', width: '*' }]
          },
          {
            width: '*',
            text: ''
          }
        ],
        margin: [28, 0, 0, 2]
      },
      {
        columns: [
          drawCheckbox(isOtherRel),
          {
            width: '*',
            text: [
              'อื่นๆ (ระบุ) ',
              isOtherRel ? (relationshipDesc ? `${relStr} (${relationshipDesc})` : relStr) : '....................................................................................................................................'
            ]
          }
        ],
        margin: [28, 0, 0, 6]
      },

      // ส่วนที่ 2: ข้อมูลผู้ป่วย
      {
        text: 'ส่วนที่ 2: ข้อมูลผู้ป่วย (ผู้รับการดูแล)',
        fontSize: 15.5,
        bold: true,
        margin: [0, 3, 0, 2]
      },
      {
        text: [
          { text: 'ชื่อ-สกุล ผู้ป่วย  ', bold: true },
          patientName || '....................................................................................'
        ],
        margin: [14, 0, 0, 2]
      },
      {
        text: [
          { text: 'เลขประจำตัวประชาชน  ', bold: true },
          `${ptCidFormatted}     `,
          { text: 'เลขประจำตัวผู้ป่วย (HN)  ', bold: true },
          `${patientHn || '-'}`
        ],
        margin: [14, 0, 0, 2]
      },
      {
        text: [
          { text: 'วัน/เดือน/ปี เกิด  ', bold: true },
          `${ptBirthFormatted}     `,
          { text: 'อายุ  ', bold: true },
          `${ptAge} ปี`
        ],
        margin: [14, 0, 0, 2]
      },
      ...(ptAddr.isCustomText ? [
        {
          text: [
            { text: 'ที่อยู่  ', bold: true },
            ptAddr.customText || '-'
          ],
          margin: [14, 0, 0, 2]
        }
      ] : [
        {
          text: [
            { text: 'ที่อยู่  ', bold: true },
            'บ้านเลขที่ ',
            ptAddr.house || '-',
            '   หมู่ที่ ',
            ptAddr.moo || '-',
            '   ตำบล/แขวง ',
            ptAddr.tmb || '-'
          ],
          margin: [14, 0, 0, 2]
        },
        {
          text: [
            { text: 'อำเภอ/เขต  ', bold: true },
            `${ptAddr.amp || '-'}   `,
            { text: 'จังหวัด  ', bold: true },
            `${ptAddr.chw || '-'}` + (ptAddr.postcode ? `     รหัสไปรษณีย์  ${ptAddr.postcode}` : '')
          ],
          margin: [14, 0, 0, 2]
        }
      ]),
      {
        text: [
          { text: 'เหตุผลความจำเป็นที่ผู้ป่วยไม่สามารถเดินทางมาแสดงตนได้', bold: true }
        ],
        margin: [14, 2, 0, 2]
      },
      {
        columns: [
          drawCheckbox(isBedridden),
          { text: 'เป็นผู้ป่วยติดเตียง / ภาวะพึ่งพิงสูง ไม่สามารถเคลื่อนย้ายได้', width: '*' }
        ],
        margin: [28, 0, 0, 2]
      },
      {
        columns: [
          drawCheckbox(isPhysical),
          { text: 'มีข้อจำกัดทางกายภาพหรือการเคลื่อนไหวรุนแรง', width: '*' }
        ],
        margin: [28, 0, 0, 2]
      },
      {
        columns: [
          drawCheckbox(isCognitive),
          { text: 'ผู้ป่วยมีความรู้คิดบกพร่อง / ภาวะสมองเสื่อม / ไม่รู้สติสัมปชัญญะ', width: '*' }
        ],
        margin: [28, 0, 0, 2]
      },
      {
        columns: [
          drawCheckbox(isChildPatient),
          { text: 'เด็กเล็กหรือเยาวชนที่มีข้อจำกัดด้านสุขภาพหรือการเดินทาง', width: '*' }
        ],
        margin: [28, 0, 0, 2]
      },
      {
        columns: [
          drawCheckbox(isOtherReason),
          {
            width: '*',
            text: [
              'อื่นๆ (ระบุ) ',
              isOtherReason ? otherReasonText : '....................................................................................................................................'
            ]
          }
        ],
        margin: [28, 0, 0, 6]
      },

      // ขึ้นหน้าใหม่สำหรับส่วนที่ 3 อย่างเป็นระเบียบ
      { text: '', pageBreak: 'before' },

      // ส่วนที่ 3: คำรับรองของผู้ดูแลและการยินยอมตามกฎหมาย
      {
        text: 'ส่วนที่ 3: คำรับรองของผู้ดูแลและการยินยอมตามกฎหมาย',
        fontSize: 15.5,
        bold: true,
        margin: [0, 4, 0, 4]
      },
      {
        text: [
          { text: '1. คำรับรองความถูกต้อง  ', bold: true },
          'ข้าพเจ้าขอรับรองว่า ข้าพเจ้าเป็นผู้บริบาลและดูแลการรักษาพยาบาลของผู้ป่วยรายนี้อยู่จริง และการนำบัตรประจำตัวประชาชนตัวจริงของผู้ป่วยมาแสดงในครั้งนี้ เป็นไปเพื่อประโยชน์สูงสุดในการรักษาพยาบาลและการบริบาลสุขภาพอย่างต่อเนื่องของผู้ป่วย'
        ],
        alignment: 'left',
        margin: [14, 0, 0, 4]
      },
      {
        text: [
          { text: '2. ขอบเขตการดำเนินการแทน  ', bold: true },
          'ข้าพเจ้าในฐานะผู้ดูแล มีความประสงค์และขอความยินยอมในการกระทำแทนผู้ป่วย ดังนี้'
        ],
        alignment: 'left',
        margin: [14, 0, 0, 3]
      },
      {
        ul: [
          'เข้าถึง เรียกดู และรับทราบข้อมูลประวัติสุขภาพอิเล็กทรอนิกส์ (EMR), ผลการตรวจทางห้องปฏิบัติการ, ผลเอกซเรย์ และรายการยา',
          'สื่อสาร ให้ข้อมูลอาการ ปรึกษาแพทย์ และรับฟังคำแนะนำทางการแพทย์ผ่านระบบบริการการแพทย์ทางไกล (Telemedicine)',
          'รับคำสั่งการรักษา ใบสั่งยา และดำเนินการประสานรับยา/เวชภัณฑ์แทนผู้ป่วย'
        ],
        margin: [32, 0, 0, 4]
      },
      {
        text: [
          { text: '3. การรับรองความรับผิดชอบ  ', bold: true },
          'ข้าพเจ้าขอรับรองว่าข้อความทั้งหมดเป็นความจริง หากเกิดกรณีพิพาท ข้อโต้แย้งสิทธิ์ภายในครอบครัว หรือความเสียหายใดๆ อันเกิดจากการแอบอ้างสิทธิ์โดยมิชอบ ข้าพเจ้ายินยอมรับผิดชอบตามกฎหมายทั้งทางแพ่งและทางอาญาแต่เพียงผู้เดียว โดยโรงพยาบาลและบุคลากรทางการแพทย์ไม่มีส่วนเกี่ยวข้อง'
        ],
        alignment: 'left',
        margin: [14, 0, 0, 4]
      },
      {
        text: [
          { text: '4. ความยินยอมด้านข้อมูลส่วนบุคคล (PDPA)  ', bold: true },
          'ข้าพเจ้ารับทราบและยินยอมให้โรงพยาบาลจัดเก็บ ใช้ และประมวลผลข้อมูลส่วนบุคคลและข้อมูลสุขภาพ เพื่อประโยชน์ในการให้บริการการแพทย์ทางไกล การบริบาลรักษาพยาบาล และการตรวจสอบความถูกต้องย้อนหลัง'
        ],
        alignment: 'left',
        margin: [14, 0, 0, 4]
      },
      {
        text: [
          { text: '5. การสิ้นสุดของคำรับรอง  ', bold: true },
          'หนังสือฉบับนี้มีผลบังคับใช้นับแต่วันที่ลงนาม จนกว่าจะมีการแจ้งยกเลิกเป็นลายลักษณ์อักษร หรือผู้ป่วยสามารถเดินทางมาแสดงตนเพื่อเพิกถอนสิทธิ์ด้วยตนเอง หรือเมื่อผู้ป่วยถึงแก่กรรม'
        ],
        alignment: 'left',
        margin: [14, 0, 0, 6]
      },

      // หัวข้อ เอกสารแนบ (ขึ้นหน้าใหม่)
      {
        text: 'เอกสารแนบ',
        fontSize: 15.5,
        bold: true,
        pageBreak: 'before',
        margin: [0, 4, 0, 10]
      },
      ...(patientImageElement ? [
        patientImageElement
      ] : [
        {
          table: {
            widths: ['*'],
            heights: [220],
            body: [
              [
                {
                  text: '[ พื้นที่สำหรับแนบภาพถ่ายบัตรประจำตัวประชาชนของผู้ป่วย ]',
                  alignment: 'center',
                  color: '#666666',
                  fontSize: 13,
                  margin: [0, 95, 0, 0]
                }
              ]
            ]
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => '#aaaaaa',
            vLineColor: () => '#aaaaaa',
            hLineStyle: () => ({ dash: { length: 4, space: 4 } }),
            vLineStyle: () => ({ dash: { length: 4, space: 4 } })
          },
          margin: [14, 0, 14, 0]
        }
      ])
    ]
  };

  const doc = pdfmake.createPdf(docDefinition);
  return await doc.getBuffer();
}

module.exports = { generateCaregiverPdf };

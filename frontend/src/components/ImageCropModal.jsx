import React, { useState, useRef, useEffect } from 'react';

// Aspect ratio บัตรประชาชนมาตรฐานสากล (CR80: 85.60 mm x 53.98 mm = 1.5858)
const ID_CARD_ASPECT_RATIO = 85.6 / 53.98;

/**
 * ImageCropModal Component
 * เครื่องมือตัดครอบภาพบัตรประชาชน (Crop), หมุนภาพ (Rotate), ปรับแสง (Brightness),
 * ปรับคอนทราสต์ (Contrast), และตรวจจับขอบบัตรอัตโนมัติ (Auto-Detect Crop)
 */
export default function ImageCropModal({
  isOpen,
  rawImageSrc,
  onClose,
  onApplyCrop
}) {
  const [imageObj, setImageObj] = useState(null);
  const [baseRotation, setBaseRotation] = useState(0); // 0, 90, 180, 270 (หมุนขั้นหลัก)
  const [fineRotation, setFineRotation] = useState(0); // -45 ถึง +45 องศา (หมุนละเอียด)
  const rotation = (baseRotation + fineRotation + 360) % 360; // องศาสุทธิรวม
  const [brightness, setBrightness] = useState(100); // 50 - 150
  const [contrast, setContrast] = useState(100); // 50 - 200
  const [grayscale, setGrayscale] = useState(false);

  // Crop Box ในระบบ Coordinate สัมพัทธ์ของภาพดั้งเดิม (x, y, width, height)
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [activeHandle, setActiveHandle] = useState(null);
  const [isRotating, setIsRotating] = useState(false);
  const [dragStart, setDragStart] = useState(null);

  const containerRef = useRef(null);
  const imageCanvasRef = useRef(null);
  const previewCanvasRef = useRef(null);

  // โหลดรูปภาพ Image Object เมื่อ rawImageSrc เปลี่ยน
  useEffect(() => {
    if (!rawImageSrc) {
      setImageObj(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImageObj(img);
      setBaseRotation(0);
      setFineRotation(0);
      setBrightness(100);
      setContrast(100);
      setGrayscale(false);
      initDefaultCrop(img, 0);
    };
    img.src = rawImageSrc;
  }, [rawImageSrc]);

  // คำนวณขนาด Bounding Box ของภาพที่หมุนด้วยองศาใดๆ
  const getRotatedDimensions = (img, rad) => {
    if (!img) return { width: 0, height: 0 };
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const w = Math.round(img.width * cos + img.height * sin);
    const h = Math.round(img.width * sin + img.height * cos);
    return { width: w, height: h };
  };

  // คำนวณเริ่มต้น หรือ Auto-Detect Crop
  const initDefaultCrop = (img, rotAngle) => {
    if (!img) return;
    const rad = (rotAngle * Math.PI) / 180;
    const { width: imgW, height: imgH } = getRotatedDimensions(img, rad);

    // หา Auto-Detect เบื้องต้นด้วย CR80 Aspect Ratio
    let boxW = imgW * 0.88;
    let boxH = boxW / ID_CARD_ASPECT_RATIO;

    if (boxH > imgH * 0.9) {
      boxH = imgH * 0.88;
      boxW = boxH * ID_CARD_ASPECT_RATIO;
    }

    const boxX = (imgW - boxW) / 2;
    const boxY = (imgH - boxH) / 2;

    setCropBox({
      x: Math.round(boxX),
      y: Math.round(boxY),
      width: Math.round(boxW),
      height: Math.round(boxH)
    });
  };

  // หมุนภาพ 90 องศา
  const handleRotate90 = (dir = 'cw') => {
    const nextBase = dir === 'cw' ? (baseRotation + 90) % 360 : (baseRotation - 90 + 360) % 360;
    setBaseRotation(nextBase);
    const nextTot = (nextBase + fineRotation + 360) % 360;
    if (imageObj) {
      initDefaultCrop(imageObj, nextTot);
    }
  };

  // ปรับแต่งสี, ความสว่าง, คอนทราสต์ และขาว-ดำ ด้วย Pixel Manipulation โดยตรง
  // เพื่อให้แสดงผลและส่งออกรูปภาพได้ 100% ในทุกเบราว์เซอร์ (Safari, Chrome, Firefox, Mobile)
  const applyDirectFilters = (ctx, width, height, bPercent, cPercent, isGray) => {
    if (bPercent === 100 && cPercent === 100 && !isGray) return;
    try {
      const imgData = ctx.getImageData(0, 0, width, height);
      const d = imgData.data;
      const bFactor = bPercent / 100;
      const cFactor = cPercent / 100;

      for (let i = 0; i < d.length; i += 4) {
        let r = d[i];
        let g = d[i + 1];
        let b = d[i + 2];

        // 1. Grayscale
        if (isGray) {
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          r = gray;
          g = gray;
          b = gray;
        }

        // 2. Brightness
        if (bPercent !== 100) {
          r *= bFactor;
          g *= bFactor;
          b *= bFactor;
        }

        // 3. Contrast: (color - 128) * factor + 128
        if (cPercent !== 100) {
          r = (r - 128) * cFactor + 128;
          g = (g - 128) * cFactor + 128;
          b = (b - 128) * cFactor + 128;
        }

        d[i] = r < 0 ? 0 : (r > 255 ? 255 : r);
        d[i + 1] = g < 0 ? 0 : (g > 255 ? 255 : g);
        d[i + 2] = b < 0 ? 0 : (b > 255 ? 255 : b);
      }
      ctx.putImageData(imgData, 0, 0);
    } catch (err) {
      console.warn('Direct filter manipulation error:', err);
    }
  };

  // Smart Auto-Detect Crop (ค้นหาขอบสี่เหลี่ยมบัตรประชาชนอัตโนมัติจาก Contrast/Edge)
  const handleAutoDetect = () => {
    if (!imageObj) return;

    try {
      const rad = (rotation * Math.PI) / 180;
      const { width: w, height: h } = getRotatedDimensions(imageObj, rad);

      // สร้าง canvas ย่อส่วนเพื่อวิเคราะห์ Edge & Gradient เร็วๆ
      const sampleCanvas = document.createElement('canvas');
      const scale = Math.min(1, 400 / Math.max(w, h));
      const sw = Math.round(w * scale);
      const sh = Math.round(h * scale);
      sampleCanvas.width = sw;
      sampleCanvas.height = sh;
      const sctx = sampleCanvas.getContext('2d');

      // วาดภาพตามการหมุน
      sctx.save();
      sctx.translate(sw / 2, sh / 2);
      sctx.rotate(rad);
      sctx.drawImage(imageObj, -imageObj.width * scale / 2, -imageObj.height * scale / 2, imageObj.width * scale, imageObj.height * scale);
      sctx.restore();

      const imgData = sctx.getImageData(0, 0, sw, sh);
      const data = imgData.data;

      // คำนวณ Grayscale และ Gradient Energy แนวนอนและแนวตั้ง
      const gray = new Float32Array(sw * sh);
      for (let i = 0; i < data.length; i += 4) {
        gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }

      // หาขอบเขตที่มี Gradient พุ่งสูง (Card Boundaries)
      let minX = Math.round(sw * 0.08), maxX = Math.round(sw * 0.92);
      let minY = Math.round(sh * 0.08), maxY = Math.round(sh * 0.92);

      // โปรเจกต์ความเข้มของการเปลี่ยนแปลงแสงแนวนอน (Column differences)
      let colEnergy = new Float32Array(sw);
      for (let x = 1; x < sw - 1; x++) {
        let diff = 0;
        for (let y = Math.round(sh * 0.2); y < Math.round(sh * 0.8); y++) {
          diff += Math.abs(gray[y * sw + x + 1] - gray[y * sw + x - 1]);
        }
        colEnergy[x] = diff;
      }

      // กรองหาช่วงที่มีความหนาแน่นสูงสุด
      let bestLeft = minX;
      let maxEnergyLeft = 0;
      for (let x = Math.round(sw * 0.05); x < Math.round(sw * 0.35); x++) {
        if (colEnergy[x] > maxEnergyLeft) {
          maxEnergyLeft = colEnergy[x];
          bestLeft = x;
        }
      }

      let bestRight = maxX;
      let maxEnergyRight = 0;
      for (let x = Math.round(sw * 0.65); x < Math.round(sw * 0.95); x++) {
        if (colEnergy[x] > maxEnergyRight) {
          maxEnergyRight = colEnergy[x];
          bestRight = x;
        }
      }

      // แปลงสเกลกลับเป็นพิกัดภาพจริง
      let detectedW = ((bestRight - bestLeft) / scale);
      let detectedH = detectedW / ID_CARD_ASPECT_RATIO;
      if (detectedH > h * 0.92) {
        detectedH = h * 0.88;
        detectedW = detectedH * ID_CARD_ASPECT_RATIO;
      }

      let detectedX = (bestLeft / scale);
      let detectedY = (h - detectedH) / 2;

      // จัดระเบียบให้อยู่ในขอบเขตภาพ
      detectedX = Math.max(0, Math.min(w - detectedW, detectedX));
      detectedY = Math.max(0, Math.min(h - detectedH, detectedY));

      setCropBox({
        x: Math.round(detectedX),
        y: Math.round(detectedY),
        width: Math.round(detectedW),
        height: Math.round(detectedH)
      });
    } catch (e) {
      console.warn('Auto-detect error fallback:', e);
      initDefaultCrop(imageObj, rotation);
    }
  };

  // เรนเดอร์ภาพบน Display Canvas พร้อม Filter และ Crop Overlay
  useEffect(() => {
    if (!isOpen || !imageObj || !imageCanvasRef.current) return;

    const canvas = imageCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const rad = (rotation * Math.PI) / 180;
    const { width: w, height: h } = getRotatedDimensions(imageObj, rad);

    // คำนวณขนาดที่ฟิตใน Modal (Max width ~640px, max height ~420px)
    const maxDisplayW = Math.min(window.innerWidth - 64, 620);
    const maxDisplayH = 400;
    const displayScale = Math.min(maxDisplayW / w, maxDisplayH / h, 1);

    const dw = Math.round(w * displayScale);
    const dh = Math.round(h * displayScale);

    canvas.width = dw;
    canvas.height = dh;

    // 1. วาดรูปพร้อม Filter และ Rotation
    ctx.save();
    try {
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) ${grayscale ? 'grayscale(100%)' : ''}`;
    } catch (_) {}
    ctx.translate(dw / 2, dh / 2);
    ctx.rotate(rad);

    const drawW = imageObj.width * displayScale;
    const drawH = imageObj.height * displayScale;
    ctx.drawImage(imageObj, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    // ประมวลผล pixel ตรงผ่าน applyDirectFilters (ทำงานแน่นอน 100% แม้เบราว์เซอร์ไม่รองรับ ctx.filter)
    applyDirectFilters(ctx, dw, dh, brightness, contrast, grayscale);

    // 2. วาด Dimmed Overlay รอบนอกกรอบ Crop
    const bx = cropBox.x * displayScale;
    const by = cropBox.y * displayScale;
    const bw = cropBox.width * displayScale;
    const bh = cropBox.height * displayScale;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    // Top
    ctx.fillRect(0, 0, dw, Math.max(0, by));
    // Bottom
    ctx.fillRect(0, by + bh, dw, Math.max(0, dh - (by + bh)));
    // Left
    ctx.fillRect(0, by, Math.max(0, bx), bh);
    // Right
    ctx.fillRect(bx + bw, by, Math.max(0, dw - (bx + bw)), bh);

    // 3. วาดเส้นกรอบ Crop Box
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(bx, by, bw, bh);

    // Grid lines 3x3 ภายในกรอบ (Rule of thirds)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx + bw / 3, by);
    ctx.lineTo(bx + bw / 3, by + bh);
    ctx.moveTo(bx + (bw * 2) / 3, by);
    ctx.lineTo(bx + (bw * 2) / 3, by + bh);
    ctx.moveTo(bx, by + bh / 3);
    ctx.lineTo(bx + bw, by + bh / 3);
    ctx.moveTo(bx, by + (bh * 2) / 3);
    ctx.lineTo(bx + bw, by + (bh * 2) / 3);
    ctx.stroke();

    // วาด Corner Handles (มุม 4 มุม)
    const handleSize = 14;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2.5;

    const corners = [
      [bx, by],
      [bx + bw, by],
      [bx, by + bh],
      [bx + bw, by + bh]
    ];
    corners.forEach(([cx, cy]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, handleSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // 4. วาด On-Canvas Rotation Handle (แกนหมุนบนตัวรูปภาพ เหนือขอบบนของ Crop Box)
    const rotStemLen = 32;
    const rotCenterX = bx + bw / 2;
    const rotCenterY = by;
    const rotHandleY = by - rotStemLen;

    // ก้านเชื่อมต่อ
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(rotCenterX, rotCenterY);
    ctx.lineTo(rotCenterX, rotHandleY);
    ctx.stroke();
    ctx.setLineDash([]); // รีเซ็ตเส้นประ

    // วงกลมจุดจับหมุน
    ctx.fillStyle = '#0284c7';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(rotCenterX, rotHandleY, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // ไอคอนลูกศรหมุนข้างในวงกลม
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(rotCenterX, rotHandleY, 5.5, -Math.PI * 0.7, Math.PI * 0.7);
    ctx.stroke();
    // หัวลูกศร
    const arrowX = rotCenterX + 5.5 * Math.cos(Math.PI * 0.7);
    const arrowY = rotHandleY + 5.5 * Math.sin(Math.PI * 0.7);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(arrowX - 2, arrowY - 4);
    ctx.lineTo(arrowX + 2, arrowY);
    ctx.lineTo(arrowX - 4, arrowY + 1);
    ctx.fill();

    // ป้ายแสดงองศาปัจจุบันบนรูปภาพเมื่อมีการหมุน
    if (rotation !== 0 || isRotating) {
      const tagText = `${rotation.toFixed(1)}°`;
      ctx.font = 'bold 12px sans-serif';
      const textW = ctx.measureText(tagText).width;
      const tagPadding = 6;
      const tagX = rotCenterX - (textW + tagPadding * 2) / 2;
      const tagY = rotHandleY - 26;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(tagX, tagY, textW + tagPadding * 2, 20, 6) : ctx.rect(tagX, tagY, textW + tagPadding * 2, 20);
      ctx.fill();

      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tagText, rotCenterX, tagY + 10);
      ctx.textAlign = 'start';
    }

  }, [isOpen, imageObj, rotation, brightness, contrast, grayscale, cropBox, isRotating]);

  // จัดการ Mouse / Touch Dragging สำหรับย้าย ย่อ-ขยาย และหมุนภาพบน Canvas
  const handlePointerDown = (e) => {
    if (!imageCanvasRef.current || !imageObj) return;

    const rect = imageCanvasRef.current.getBoundingClientRect();
    const clientX = e.clientX || e.touches?.[0]?.clientX;
    const clientY = e.clientY || e.touches?.[0]?.clientY;
    const rad = (rotation * Math.PI) / 180;
    const { width: w, height: h } = getRotatedDimensions(imageObj, rad);
    const scale = rect.width / w;

    const clickX = (clientX - rect.left) / scale;
    const clickY = (clientY - rect.top) / scale;

    const tolerance = 24 / scale; // รัศมีความแม่นยำในการจับจุดมุม

    // ตรวจสอบ Rotation Handle ก่อน (อยู่เหนือขอบบนกึ่งกลาง 32px)
    const { x, y, width, height } = cropBox;
    const rotCenterX = x + width / 2;
    const rotCenterY = y - 32;

    if (Math.hypot(clickX - rotCenterX, clickY - rotCenterY) < tolerance * 1.2) {
      setActiveHandle('rotate');
      setIsRotating(true);
      // คำนวณมุมเริ่มต้น relative กับจุดกึ่งกลางของ Canvas
      const canvasCenterX = w / 2;
      const canvasCenterY = h / 2;
      const startAngle = Math.atan2(clickY - canvasCenterY, clickX - canvasCenterX) * (180 / Math.PI);
      setDragStart({ startAngle, initialRotation: rotation });
      return;
    }

    // ตรวจสอบมุมทั้ง 4
    if (Math.hypot(clickX - x, clickY - y) < tolerance) {
      setActiveHandle('top-left');
    } else if (Math.hypot(clickX - (x + width), clickY - y) < tolerance) {
      setActiveHandle('top-right');
    } else if (Math.hypot(clickX - x, clickY - (y + height)) < tolerance) {
      setActiveHandle('bottom-left');
    } else if (Math.hypot(clickX - (x + width), clickY - (y + height)) < tolerance) {
      setActiveHandle('bottom-right');
    } else if (clickX >= x && clickX <= x + width && clickY >= y && clickY <= y + height) {
      setActiveHandle('move');
    } else {
      setActiveHandle(null);
    }

    setDragStart({ x: clickX, y: clickY, origBox: { ...cropBox } });
  };

  const handlePointerMove = (e) => {
    if (!activeHandle || !dragStart || !imageObj) return;
    const rect = imageCanvasRef.current.getBoundingClientRect();
    const clientX = e.clientX || e.touches?.[0]?.clientX;
    const clientY = e.clientY || e.touches?.[0]?.clientY;

    const rad = (rotation * Math.PI) / 180;
    const { width: totalW, height: totalH } = getRotatedDimensions(imageObj, rad);
    const scale = rect.width / totalW;

    const currX = (clientX - rect.left) / scale;
    const currY = (clientY - rect.top) / scale;

    // โหมดหมุนภาพโดยตรงบนรูปภาพ (Rotate Handle)
    if (activeHandle === 'rotate') {
      const canvasCenterX = totalW / 2;
      const canvasCenterY = totalH / 2;
      const currentAngle = Math.atan2(currY - canvasCenterY, currX - canvasCenterX) * (180 / Math.PI);
      let deltaAngle = currentAngle - dragStart.startAngle;

      let newRot = (dragStart.initialRotation + deltaAngle) % 360;
      if (newRot < 0) newRot += 360;

      // จัดแบ่งเป็น Base Rotation + Fine Rotation
      // หมุนฐาน 90 (0, 90, 180, 270)
      const nearestBase = Math.round(newRot / 90) * 90 % 360;
      let fine = newRot - nearestBase;
      if (fine > 180) fine -= 360;
      if (fine < -180) fine += 360;

      // ถ้าใกล้ 0, 90, 180, 270 ในระยะ 0.8 องศา ให้ Snap ตรงฉาก
      if (Math.abs(fine) < 0.8) {
        fine = 0;
      }

      setBaseRotation(nearestBase);
      setFineRotation(Math.round(fine * 10) / 10);
      return;
    }

    const dx = currX - dragStart.x;
    const dy = currY - dragStart.y;
    const { origBox } = dragStart;

    if (activeHandle === 'move') {
      let newX = Math.max(0, Math.min(totalW - origBox.width, origBox.x + dx));
      let newY = Math.max(0, Math.min(totalH - origBox.height, origBox.y + dy));
      setCropBox({
        ...origBox,
        x: Math.round(newX),
        y: Math.round(newY)
      });
    } else if (activeHandle === 'bottom-right') {
      let newW = Math.max(120, origBox.width + dx);
      let newH = newW / ID_CARD_ASPECT_RATIO;
      if (origBox.x + newW > totalW) {
        newW = totalW - origBox.x;
        newH = newW / ID_CARD_ASPECT_RATIO;
      }
      if (origBox.y + newH > totalH) {
        newH = totalH - origBox.y;
        newW = newH * ID_CARD_ASPECT_RATIO;
      }
      setCropBox({
        x: origBox.x,
        y: origBox.y,
        width: Math.round(newW),
        height: Math.round(newH)
      });
    } else if (activeHandle === 'top-left') {
      let newW = Math.max(120, origBox.width - dx);
      let newH = newW / ID_CARD_ASPECT_RATIO;
      let newX = origBox.x + (origBox.width - newW);
      let newY = origBox.y + (origBox.height - newH);
      if (newX >= 0 && newY >= 0) {
        setCropBox({
          x: Math.round(newX),
          y: Math.round(newY),
          width: Math.round(newW),
          height: Math.round(newH)
        });
      }
    } else if (activeHandle === 'top-right') {
      let newW = Math.max(120, origBox.width + dx);
      let newH = newW / ID_CARD_ASPECT_RATIO;
      let newY = origBox.y + (origBox.height - newH);
      if (origBox.x + newW <= totalW && newY >= 0) {
        setCropBox({
          x: origBox.x,
          y: Math.round(newY),
          width: Math.round(newW),
          height: Math.round(newH)
        });
      }
    } else if (activeHandle === 'bottom-left') {
      let newW = Math.max(120, origBox.width - dx);
      let newH = newW / ID_CARD_ASPECT_RATIO;
      let newX = origBox.x + (origBox.width - newW);
      if (newX >= 0 && origBox.y + newH <= totalH) {
        setCropBox({
          x: Math.round(newX),
          y: origBox.y,
          width: Math.round(newW),
          height: Math.round(newH)
        });
      }
    }
  };

  const handlePointerUp = () => {
    setActiveHandle(null);
    setIsRotating(false);
    setDragStart(null);
  };

  // นำผลลัพธ์การตัดครอบและปรับแสงไปใช้งาน (Export Base64)
  const handleConfirmCrop = () => {
    if (!imageObj) return;

    try {
      const rad = (rotation * Math.PI) / 180;
      const { width: fullW, height: fullH } = getRotatedDimensions(imageObj, rad);

      // 1. สร้าง Full-size intermediate canvas พร้อม Filter และ Rotation
      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = fullW;
      fullCanvas.height = fullH;
      const fctx = fullCanvas.getContext('2d');

      fctx.save();
      try {
        fctx.filter = `brightness(${brightness}%) contrast(${contrast}%) ${grayscale ? 'grayscale(100%)' : ''}`;
      } catch (_) {}
      fctx.translate(fullW / 2, fullH / 2);
      fctx.rotate(rad);
      fctx.drawImage(imageObj, -imageObj.width / 2, -imageObj.height / 2, imageObj.width, imageObj.height);
      fctx.restore();

      // ปรับแต่ง Pixel โดยตรงบน intermediate canvas
      applyDirectFilters(fctx, fullW, fullH, brightness, contrast, grayscale);

      // 2. Crop เฉพาะบริเวณ CropBox ไปยัง Final Result Canvas
      const finalCanvas = document.createElement('canvas');
      // กำหนดความละเอียดผลลัพธ์มาตรฐาน คมชัดสูง (กว้าง 1024px สูง ~645px)
      const targetW = 1024;
      const targetH = Math.round(targetW / ID_CARD_ASPECT_RATIO);
      finalCanvas.width = targetW;
      finalCanvas.height = targetH;
      const tctx = finalCanvas.getContext('2d');

      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = 'high';

      tctx.drawImage(
        fullCanvas,
        cropBox.x,
        cropBox.y,
        cropBox.width,
        cropBox.height,
        0,
        0,
        targetW,
        targetH
      );

      // Export เป็น JPEG คุณภาพสูง 0.85
      const resultBase64 = finalCanvas.toDataURL('image/jpeg', 0.85);
      onApplyCrop(resultBase64);
      onClose();
    } catch (err) {
      console.error('Confirm crop error:', err);
      alert('เกิดข้อผิดพลาดในการตัดครอบรูปภาพ: ' + err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
        backdropFilter: 'blur(3px)'
      }}
      onPointerUp={handlePointerUp}
    >
      <div
        ref={containerRef}
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '680px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f8fafc'
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"></path>
                <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"></path>
              </svg>
              ปรับแต่งภาพบัตรประชาชน (Crop & Enhance)
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
              ลากจุดหมุนด้านบนเพื่อเอียงภาพตามต้องการ หรือลากกรอบสี่เหลี่ยมเพื่อครอบบัตร
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              color: '#64748b',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body / Canvas Viewport */}
        <div
          style={{
            flex: 1,
            padding: '16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0f172a'
          }}
        >
          <div
            style={{
              position: 'relative',
              display: 'inline-block',
              cursor: activeHandle === 'rotate' ? 'grab' : (activeHandle === 'move' ? 'grabbing' : 'crosshair'),
              userSelect: 'none',
              touchAction: 'none'
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
          >
            <canvas
              ref={imageCanvasRef}
              style={{
                display: 'block',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
              }}
            />
          </div>
        </div>

        {/* Modal Toolbar: Brightness, Contrast, Rotate, Auto-crop */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid #e2e8f0',
            backgroundColor: '#ffffff'
          }}
        >
          {/* Quick Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => handleRotate90('ccw')}
              title="หมุนทวนเข็มนาฬิกา 90°"
              style={{
                padding: '6px 10px',
                backgroundColor: '#f1f5f9',
                color: '#334155',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 2v6h6M2.66 15.57a10 10 0 1 0 .57-8.38l-5.67-5.67"/>
              </svg>
              -90°
            </button>

            <button
              type="button"
              onClick={() => handleRotate90('cw')}
              title="หมุนตามเข็มนาฬิกา 90°"
              style={{
                padding: '6px 12px',
                backgroundColor: '#f1f5f9',
                color: '#334155',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
              +90°
            </button>

            <button
              type="button"
              onClick={handleAutoDetect}
              style={{
                padding: '6px 14px',
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              ตรวจจับขอบบัตรอัตโนมัติ
            </button>

            <button
              type="button"
              onClick={() => setGrayscale(!grayscale)}
              style={{
                padding: '6px 12px',
                backgroundColor: grayscale ? '#0f172a' : '#f1f5f9',
                color: grayscale ? '#ffffff' : '#334155',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9"/>
                <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>
              </svg>
              ขาว-ดำ
            </button>

            <button
              type="button"
              onClick={() => {
                setBaseRotation(0);
                setFineRotation(0);
                setBrightness(100);
                setContrast(100);
                setGrayscale(false);
                initDefaultCrop(imageObj, 0);
              }}
              style={{
                padding: '6px 12px',
                backgroundColor: '#f8fafc',
                color: '#64748b',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '13px',
                cursor: 'pointer',
                marginLeft: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
              รีเซ็ตทั้งหมด
            </button>
          </div>

          {/* Sliders: Brightness & Contrast */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px',
              padding: '12px 14px',
              backgroundColor: '#f8fafc',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              marginBottom: '14px'
            }}
          >
            {/* Brightness Slider */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3"/>
                    <line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/>
                    <line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                  ความสว่าง (Brightness)
                </span>
                <span>{brightness}%</span>
              </div>
              <input
                type="range"
                min="60"
                max="160"
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: '#0f766e' }}
              />
            </div>

            {/* Contrast Slider */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9"/>
                    <path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor"/>
                  </svg>
                  คอนทราสต์ (Contrast)
                </span>
                <span>{contrast}%</span>
              </div>
              <input
                type="range"
                min="70"
                max="180"
                value={contrast}
                onChange={(e) => setContrast(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: '#0f766e' }}
              />
            </div>
          </div>

          {/* Bottom Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 18px',
                backgroundColor: '#ffffff',
                color: '#64748b',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleConfirmCrop}
              style={{
                padding: '9px 24px',
                backgroundColor: '#0f766e',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(15, 118, 110, 0.3)'
              }}
            >
              ✓ นำไปใช้งาน
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

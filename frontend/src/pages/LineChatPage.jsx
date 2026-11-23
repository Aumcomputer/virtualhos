import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api/client';
import './LineChatPage.css';

const QUICK_REPLIES = [
  {
    label: 'ทักทาย',
    text: 'สวัสดีครับ/ค่ะ โรงพยาบาลราชบุรี ยินดีให้บริการครับ/ค่ะ',
  },
  {
    label: 'ขอเลข HN / ชื่อ-สกุล',
    text: 'รบกวนขอทราบเลขประจำตัวผู้ป่วย (HN) หรือชื่อ-นามสกุลผู้ป่วย เพื่อตรวจสอบข้อมูลให้นะครับ/คะ',
  },
  {
    label: 'ขั้นตอน Telemed',
    text: 'สำหรับบริการการแพทย์ทางไกล (Telemedicine) เมื่อแพทย์ตรวจเสร็จแล้ว ห้องยาจะดำเนินการจัดเตรียมและจัดส่งยาตามที่อยู่ที่แจ้งไว้ครับ/ค่ะ',
  },
  {
    label: 'แจ้งจัดส่งยา',
    text: 'ขณะนี้เจ้าหน้าที่ได้ดำเนินการจัดเตรียมและส่งยาเรียบร้อยแล้วครับ/ค่ะ',
  },
];

const LINE_MAX_PREVIEW_BYTES = 950 * 1024;
const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function prepareImageForLine(file) {
  if (file.type === 'image/png' && file.size <= LINE_MAX_PREVIEW_BYTES) {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
      el.src = objectUrl;
    });

    const maxDim = 1600;
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    if (width > maxDim || height > maxDim) {
      if (width >= height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let resultBlob = null;
    for (const q of [0.85, 0.75, 0.65, 0.5]) {
      const blob = await canvasToBlob(canvas, 'image/jpeg', q);
      if (blob) {
        resultBlob = blob;
        if (blob.size <= LINE_MAX_PREVIEW_BYTES) break;
      }
    }

    if (!resultBlob) {
      return file;
    }

    const baseName = (file.name || 'image').replace(/\.[^.]+$/, '');
    return new File([resultBlob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getInitial(name) {
  const s = (name || '?').trim();
  return s.charAt(0).toUpperCase() || '?';
}

function formatMsgTime(dateVal) {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function formatThaiDateLabel(dateVal) {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const todayStr = now.toDateString();
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === todayStr) return 'วันนี้';
  if (d.toDateString() === yest.toDateString()) return 'เมื่อวานนี้';
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function formatRoomTime(dateVal) {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return formatMsgTime(d);
  }
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]}`;
}

function formatThaiDate(dateVal) {
  if (!dateVal) return '-';
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return String(dateVal);
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function maskCid(cid) {
  const clean = String(cid || '').replace(/\D/g, '');
  if (clean.length !== 13) return cid || '-';
  return `${clean[0]}-xxxx-xxxx${clean[9]}-${clean.slice(10, 12)}-${clean[12]}`;
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function renderTextWithLinks(text) {
  if (!text) return null;
  const parts = String(text).split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, idx) => {
    if (/^https?:\/\/[^\s]+$/.test(part)) {
      return (
        <a key={idx} href={part} target="_blank" rel="noopener noreferrer">
          {part}
        </a>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function RoomAvatar({ src, name, size = 'md' }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const cls = size === 'sm' ? 'lc-avatar sm' : 'lc-avatar';
  if (!src || failedSrc === src) {
    return <div className={cls}>{getInitial(name)}</div>;
  }
  return (
    <img
      src={src}
      alt={name || 'LINE user'}
      className={cls}
      onError={() => setFailedSrc(src)}
    />
  );
}

function StickerImage({ stickerId }) {
  const [failedId, setFailedId] = useState(null);
  if (!stickerId || failedId === stickerId) {
    return <span className="lc-msg-bubble">[สติ๊กเกอร์]</span>;
  }
  const url = `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/android/sticker.png`;
  return (
    <img
      src={url}
      alt="LINE Sticker"
      className="lc-msg-sticker"
      onError={() => setFailedId(stickerId)}
    />
  );
}

function notifySidebarUnreadChanged() {
  window.dispatchEvent(new CustomEvent('line-chat-unread-changed'));
}

export default function LineChatPage() {
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'unread' | 'linked'
  const [sseState, setSseState] = useState('reconnecting');

  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [showPatientPanel, setShowPatientPanel] = useState(true);
  const [patientInfo, setPatientInfo] = useState(null);
  const [patientLoading, setPatientLoading] = useState(false);
  const [editingHn, setEditingHn] = useState(false);
  const [hnInput, setHnInput] = useState('');
  const [savingHn, setSavingHn] = useState(false);

  const [textInput, setTextInput] = useState('');
  const [sending, setSending] = useState(false);
  const [stagedImage, setStagedImage] = useState(null); // { file, previewUrl }
  const [compressingImage, setCompressingImage] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [sendError, setSendError] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState(null);

  const selectedRoomIdRef = useRef(null);
  const messagesScrollRef = useRef(null);
  const scrollActionRef = useRef('bottom'); // 'bottom' | 'preserve' | 'none'
  const prevScrollHeightRef = useRef(0);
  const prevScrollTopRef = useRef(0);
  const fileInputRef = useRef(null);
  const stagedPreviewRef = useRef(null);

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const clearStagedImage = useCallback(() => {
    if (stagedPreviewRef.current) {
      URL.revokeObjectURL(stagedPreviewRef.current);
      stagedPreviewRef.current = null;
    }
    setStagedImage(null);
  }, []);

  useEffect(() => {
    return () => {
      if (stagedPreviewRef.current) {
        URL.revokeObjectURL(stagedPreviewRef.current);
      }
    };
  }, []);

  const loadRooms = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setRoomsLoading(true);
    try {
      const res = await api.getLineChatRooms({
        search: debouncedSearch,
        filter,
        page: 1,
        limit: 50,
      });
      setRooms(res.data || []);
      notifySidebarUnreadChanged();
    } catch (err) {
      console.error('Failed to load LINE chat rooms:', err);
    } finally {
      if (!silent) setRoomsLoading(false);
    }
  }, [debouncedSearch, filter]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const loadMessages = useCallback(async (roomId) => {
    setMessagesLoading(true);
    setSendError('');
    scrollActionRef.current = 'bottom';
    try {
      const res = await api.getLineChatMessages(roomId, null, 50);
      setMessages(res.data || []);
      setHasMore(Boolean(res.hasMore));
      setRooms((prev) =>
        prev.map((r) => (r.id === roomId ? { ...r, unread_count: 0 } : r))
      );
      notifySidebarUnreadChanged();
    } catch (err) {
      setSendError(err.message || 'ไม่สามารถโหลดข้อความได้');
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  const loadPatientInfo = useCallback(async (roomId) => {
    setPatientLoading(true);
    try {
      const res = await api.getLineChatPatientInfo(roomId);
      setPatientInfo(res);
      setHnInput(res.room?.hn || '');
      setEditingHn(false);
    } catch (err) {
      console.error('Failed to load patient info:', err);
      setPatientInfo(null);
    } finally {
      setPatientLoading(false);
    }
  }, []);

  const handleSelectRoom = useCallback((roomId) => {
    clearStagedImage();
    setSelectedRoomId(roomId);
    loadMessages(roomId);
    loadPatientInfo(roomId);
  }, [clearStagedImage, loadMessages, loadPatientInfo]);

  const handleLoadOlder = async () => {
    if (!selectedRoomId || loadingOlder || !hasMore || messages.length === 0) return;
    const oldestId = messages[0].id;
    const container = messagesScrollRef.current;
    if (container) {
      prevScrollHeightRef.current = container.scrollHeight;
      prevScrollTopRef.current = container.scrollTop;
    }
    scrollActionRef.current = 'preserve';
    setLoadingOlder(true);
    try {
      const res = await api.getLineChatMessages(selectedRoomId, oldestId, 50);
      const older = res.data || [];
      setHasMore(Boolean(res.hasMore));
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const filtered = older.filter((m) => !seen.has(m.id));
        return [...filtered, ...prev];
      });
    } catch (err) {
      setSendError(err.message || 'โหลดข้อความเก่าไม่สำเร็จ');
    } finally {
      setLoadingOlder(false);
    }
  };

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    if (scrollActionRef.current === 'bottom') {
      el.scrollTop = el.scrollHeight;
      scrollActionRef.current = 'none';
    } else if (scrollActionRef.current === 'preserve') {
      const diff = el.scrollHeight - prevScrollHeightRef.current;
      el.scrollTop = prevScrollTopRef.current + Math.max(0, diff);
      scrollActionRef.current = 'none';
    }
  }, [messages]);

  // Real-time SSE stream subscription
  useEffect(() => {
    const es = new EventSource('/api/line-chat/stream', { withCredentials: true });

    const onConnected = () => setSseState('connected');
    const onOpen = () => setSseState('connected');
    const onError = () => setSseState('reconnecting');

    const onNewMessage = (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        const msg = payload.message;
        const incomingRoomId = Number(payload.roomId || msg?.room_id);
        const isCurrent = selectedRoomIdRef.current === incomingRoomId;

        if (isCurrent && msg) {
          scrollActionRef.current = 'bottom';
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          if (msg.direction === 'inbound') {
            api.markLineChatRoomRead(incomingRoomId).catch(() => {});
          }
        }

        if (payload.room) {
          setRooms((prev) => {
            const existingIdx = prev.findIndex((r) => r.id === payload.room.id);
            const nextUnread = isCurrent ? 0 : Number(payload.room.unread_count || 0);
            if (existingIdx >= 0) {
              const merged = {
                ...prev[existingIdx],
                ...payload.room,
                unread_count: nextUnread,
              };
              const others = prev.filter((r) => r.id !== payload.room.id);
              return [merged, ...others];
            }
            return [{ ...payload.room, unread_count: nextUnread }, ...prev];
          });
        } else {
          loadRooms({ silent: true });
        }
        notifySidebarUnreadChanged();
      } catch (err) {
        console.warn('SSE new_message parse error:', err);
      }
    };

    const onRoomUpdated = (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        if (payload.room) {
          const isCurrent = selectedRoomIdRef.current === payload.room.id;
          setRooms((prev) => {
            const idx = prev.findIndex((r) => r.id === payload.room.id);
            if (idx < 0) return [payload.room, ...prev];
            return prev.map((r) =>
              r.id === payload.room.id
                ? {
                    ...r,
                    ...payload.room,
                    unread_count: isCurrent ? 0 : Number(payload.room.unread_count || 0),
                  }
                : r
            );
          });
          notifySidebarUnreadChanged();
        }
      } catch (err) {
        console.warn('SSE room_updated parse error:', err);
      }
    };

    const onRoomRead = (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        const rid = Number(payload.roomId);
        if (rid) {
          setRooms((prev) =>
            prev.map((r) => (r.id === rid ? { ...r, unread_count: 0 } : r))
          );
          notifySidebarUnreadChanged();
        }
      } catch {
        // ignore
      }
    };

    es.addEventListener('connected', onConnected);
    es.addEventListener('new_message', onNewMessage);
    es.addEventListener('room_updated', onRoomUpdated);
    es.addEventListener('room_read', onRoomRead);
    es.onopen = onOpen;
    es.onerror = onError;

    return () => {
      es.close();
    };
  }, [loadRooms]);

  const stageImageFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setSendError('รองรับเฉพาะไฟล์รูปภาพ (JPEG / PNG / WebP)');
      return;
    }
    setSendError('');
    setCompressingImage(true);
    try {
      const prepared = await prepareImageForLine(file);
      if (stagedPreviewRef.current) {
        URL.revokeObjectURL(stagedPreviewRef.current);
      }
      const previewUrl = URL.createObjectURL(prepared);
      stagedPreviewRef.current = previewUrl;
      setStagedImage({ file: prepared, previewUrl });
    } catch (err) {
      setSendError(err.message || 'ไม่สามารถเตรียมไฟล์รูปภาพได้');
    } finally {
      setCompressingImage(false);
    }
  };

  const handleSendText = async () => {
    const trimmed = textInput.trim();
    if (!selectedRoomId || !trimmed || sending) return;
    setSending(true);
    setSendError('');
    try {
      const res = await api.sendLineChatText(selectedRoomId, trimmed);
      setTextInput('');
      if (res.data) {
        scrollActionRef.current = 'bottom';
        setMessages((prev) =>
          prev.some((m) => m.id === res.data.id) ? prev : [...prev, res.data]
        );
      }
    } catch (err) {
      setSendError(err.message || 'ส่งข้อความไม่สำเร็จ');
      if (err.data?.data) {
        scrollActionRef.current = 'bottom';
        setMessages((prev) =>
          prev.some((m) => m.id === err.data.data.id) ? prev : [...prev, err.data.data]
        );
      }
    } finally {
      setSending(false);
    }
  };

  const handleSendStagedImage = async () => {
    if (!selectedRoomId || !stagedImage?.file || sending) return;
    setSending(true);
    setSendError('');
    try {
      const res = await api.sendLineChatImage(selectedRoomId, stagedImage.file);
      clearStagedImage();
      if (res.data) {
        scrollActionRef.current = 'bottom';
        setMessages((prev) =>
          prev.some((m) => m.id === res.data.id) ? prev : [...prev, res.data]
        );
      }
    } catch (err) {
      setSendError(err.message || 'ส่งรูปภาพไม่สำเร็จ');
      if (err.data?.data) {
        scrollActionRef.current = 'bottom';
        setMessages((prev) =>
          prev.some((m) => m.id === err.data.data.id) ? prev : [...prev, err.data.data]
        );
      }
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (stagedImage && !textInput.trim()) {
        handleSendStagedImage();
      } else {
        handleSendText();
      }
    }
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          e.preventDefault();
          stageImageFile(blob);
          break;
        }
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (!selectedRoomId) return;
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      stageImageFile(file);
    }
  };

  const handleSaveHn = async (e) => {
    e.preventDefault();
    if (!selectedRoomId || savingHn) return;
    setSavingHn(true);
    try {
      await api.linkLineChatHn(selectedRoomId, hnInput.trim());
      setEditingHn(false);
      await loadPatientInfo(selectedRoomId);
      await loadRooms({ silent: true });
    } catch (err) {
      setSendError(err.message || 'บันทึก HN ไม่สำเร็จ');
    } finally {
      setSavingHn(false);
    }
  };

  const activeRoom = rooms.find((r) => r.id === selectedRoomId) || patientInfo?.room || null;
  const totalUnreadInList = rooms.reduce((sum, r) => sum + Number(r.unread_count || 0), 0);

  const shellClasses = [
    'line-chat-page',
    showPatientPanel && selectedRoomId ? '' : 'no-patient-panel',
    selectedRoomId ? 'mobile-has-room' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClasses}>
      {/* ==================== Column 1: Room List ==================== */}
      <aside className="lc-sidebar">
        <div className="lc-sidebar-header">
          <div className="lc-sidebar-title-row">
            <h2 className="lc-sidebar-title">
              <span>แชท LINE OA</span>
              <span
                className={`lc-live-dot ${sseState === 'connected' ? '' : 'reconnecting'}`}
                title={sseState === 'connected' ? 'เชื่อมต่อ Real-time แล้ว' : 'กำลังเชื่อมต่อ Real-time...'}
              />
            </h2>
            <button
              type="button"
              className="lc-icon-btn"
              onClick={() => loadRooms()}
              title="รีเฟรชรายการแชท"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
            </button>
          </div>

          <div className="lc-search-box">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="lc-search-input"
              placeholder="ค้นหาชื่อ LINE / ชื่อคนไข้ / HN..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <div className="lc-filter-tabs">
            <button
              type="button"
              className={`lc-filter-tab ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              ทั้งหมด
            </button>
            <button
              type="button"
              className={`lc-filter-tab ${filter === 'unread' ? 'active' : ''}`}
              onClick={() => setFilter('unread')}
            >
              <span>ยังไม่อ่าน</span>
              {totalUnreadInList > 0 && (
                <span className="lc-unread-pill">{totalUnreadInList}</span>
              )}
            </button>
            <button
              type="button"
              className={`lc-filter-tab ${filter === 'linked' ? 'active' : ''}`}
              onClick={() => setFilter('linked')}
            >
              ผูก HN
            </button>
          </div>
        </div>

        <div className="lc-room-list">
          {roomsLoading && rooms.length === 0 ? (
            <div className="lc-empty-state">กำลังโหลดรายการแชท...</div>
          ) : rooms.length === 0 ? (
            <div className="lc-empty-state">
              <span>ยังไม่มีข้อความแชทในรายการนี้</span>
            </div>
          ) : (
            rooms.map((room) => {
              const isSelected = room.id === selectedRoomId;
              const unread = Number(room.unread_count || 0);
              return (
                <button
                  key={room.id}
                  type="button"
                  className={`lc-room-item ${isSelected ? 'active' : ''} ${unread > 0 ? 'has-unread' : ''}`}
                  onClick={() => handleSelectRoom(room.id)}
                >
                  <RoomAvatar src={room.picture_url} name={room.display_name} />
                  <div className="lc-room-meta">
                    <div className="lc-room-top">
                      <span className="lc-room-name">{room.display_name}</span>
                      <span className="lc-room-time">{formatRoomTime(room.last_message_at)}</span>
                    </div>
                    {(room.hn || room.patient_name) && (
                      <div className="lc-room-sub">
                        {room.hn && <span className="lc-hn-pill">HN {room.hn}</span>}
                        {room.patient_name && (
                          <span className="lc-room-patient">{room.patient_name}</span>
                        )}
                      </div>
                    )}
                    <div className="lc-room-bottom">
                      <span className="lc-room-preview">
                        {room.last_direction === 'outbound' ? 'คุณ: ' : ''}
                        {room.last_message_text || 'เริ่มต้นการสนทนา'}
                      </span>
                      {unread > 0 && <span className="lc-unread-pill">{unread}</span>}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ==================== Column 2: Chat Thread ==================== */}
      <section
        className={`lc-main ${isDragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (selectedRoomId) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {!selectedRoomId ? (
          <div className="lc-empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <h3 style={{ margin: 0, color: '#334155' }}>เลือกห้องสนทนาทางซ้ายเพื่อตอบแชทคนไข้</h3>
            <p style={{ margin: 0, fontSize: '0.88rem' }}>
              ข้อความและรูปภาพที่คนไข้ส่งใน LINE OA จะเข้ามาแสดงที่นี่แบบ Real-time
            </p>
          </div>
        ) : (
          <>
            {/* Top Chat Header */}
            <header className="lc-chat-header">
              <div className="lc-chat-header-left">
                <button
                  type="button"
                  className="lc-icon-btn lc-mobile-back-btn"
                  onClick={() => setSelectedRoomId(null)}
                  aria-label="กลับไปรายการแชท"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <RoomAvatar
                  src={activeRoom?.picture_url}
                  name={activeRoom?.display_name}
                  size="sm"
                />
                <div style={{ minWidth: 0 }}>
                  <div className="lc-chat-header-title">{activeRoom?.display_name || 'ผู้ใช้งาน LINE'}</div>
                  <div className="lc-chat-header-sub">
                    {activeRoom?.hn ? (
                      <span className="lc-hn-pill">HN {activeRoom.hn}</span>
                    ) : (
                      <span className="lc-hn-pill unlinked">ยังไม่ผูก HN</span>
                    )}
                    {activeRoom?.patient_name && <span>{activeRoom.patient_name}</span>}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className={`lc-toggle-info-btn ${showPatientPanel ? 'active' : ''}`}
                onClick={() => setShowPatientPanel((v) => !v)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span>ข้อมูลคนไข้</span>
              </button>
            </header>

            {/* Messages Scroll Viewport */}
            <div className="lc-messages-scroll" ref={messagesScrollRef}>
              {hasMore && (
                <div className="lc-load-more-wrap">
                  <button
                    type="button"
                    className="lc-load-more-btn"
                    onClick={handleLoadOlder}
                    disabled={loadingOlder}
                  >
                    {loadingOlder ? 'กำลังโหลด...' : 'โหลดข้อความเก่ากว่า'}
                  </button>
                </div>
              )}

              {messagesLoading ? (
                <div className="lc-empty-state">กำลังโหลดประวัติการสนทนา...</div>
              ) : messages.length === 0 ? (
                <div className="lc-empty-state">ยังไม่มีข้อความในห้องสนทนานี้</div>
              ) : (
                messages.map((msg, idx) => {
                  const prevMsg = idx > 0 ? messages[idx - 1] : null;
                  const currDateLabel = formatThaiDateLabel(msg.created_at);
                  const prevDateLabel = prevMsg ? formatThaiDateLabel(prevMsg.created_at) : null;
                  const showDateDivider = currDateLabel && currDateLabel !== prevDateLabel;

                  const mediaUrl = `/api/line-chat/media/${msg.id}`;

                  return (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {showDateDivider && (
                        <div className="lc-date-divider">{currDateLabel}</div>
                      )}

                      {msg.message_type === 'system' ? (
                        <div className="lc-system-msg">
                          {msg.content} · {formatMsgTime(msg.created_at)}
                        </div>
                      ) : (
                        <div className={`lc-msg-row ${msg.direction}`}>
                          {msg.message_type === 'image' && msg.media_key ? (
                            <button
                              type="button"
                              className="lc-msg-image-btn"
                              onClick={() => setLightboxUrl(mediaUrl)}
                              title="คลิกเพื่อดูภาพขนาดเต็ม"
                            >
                              <img src={mediaUrl} alt="ภาพแชท" className="lc-msg-image" loading="lazy" />
                            </button>
                          ) : msg.message_type === 'sticker' ? (
                            <StickerImage stickerId={msg.sticker_id} />
                          ) : msg.message_type === 'file' && msg.media_key ? (
                            <div className="lc-msg-bubble">
                              <a
                                href={mediaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="lc-msg-file-link"
                              >
                                <span>📎</span>
                                <span>{msg.media_filename || msg.content || 'ดาวน์โหลดไฟล์'}</span>
                                {msg.media_size != null && (
                                  <span style={{ color: '#64748b', fontWeight: 400 }}>
                                    ({formatBytes(msg.media_size)})
                                  </span>
                                )}
                              </a>
                            </div>
                          ) : msg.message_type === 'video' && msg.media_key ? (
                            <video src={mediaUrl} controls className="lc-msg-media-player" />
                          ) : msg.message_type === 'audio' && msg.media_key ? (
                            <audio src={mediaUrl} controls className="lc-msg-media-player" />
                          ) : (
                            <div className="lc-msg-bubble">
                              {msg.content ? (
                                renderTextWithLinks(msg.content)
                              ) : (
                                <span style={{ color: '#64748b' }}>
                                  [{msg.message_type}] {msg.error_message || 'ไม่สามารถโหลดไฟล์แนบได้'}
                                </span>
                              )}
                            </div>
                          )}

                          <div className="lc-msg-footer">
                            <span>{formatMsgTime(msg.created_at)}</span>
                            {msg.direction === 'outbound' && (
                              <>
                                {msg.sent_by_name && <span>โดย {msg.sent_by_name}</span>}
                                {msg.delivery_status === 'failed' ? (
                                  <span
                                    className="lc-method-badge failed"
                                    title={msg.error_message || 'ส่งไม่สำเร็จ'}
                                  >
                                    ส่งไม่สำเร็จ
                                  </span>
                                ) : msg.delivery_method === 'reply' ? (
                                  <span className="lc-method-badge reply" title="ตอบกลับผ่าน Reply API ฟรีโควตา">
                                    Reply ฟรี
                                  </span>
                                ) : (
                                  <span className="lc-method-badge push" title="ส่งผ่าน Push API">
                                    Push
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {sendError && (
              <div className="lc-error-banner">
                <span>{sendError}</span>
                <button
                  type="button"
                  className="lc-mini-btn"
                  onClick={() => setSendError('')}
                >
                  ปิด
                </button>
              </div>
            )}

            {/* Quick Reply Chips */}
            <div className="lc-quick-replies">
              {QUICK_REPLIES.map((qr) => (
                <button
                  key={qr.label}
                  type="button"
                  className="lc-quick-chip"
                  onClick={() => setTextInput((prev) => (prev ? `${prev}\n${qr.text}` : qr.text))}
                >
                  + {qr.label}
                </button>
              ))}
            </div>

            {/* Staged Image Preview Bar */}
            {(stagedImage || compressingImage) && (
              <div className="lc-staged-bar">
                <div className="lc-staged-left">
                  {stagedImage?.previewUrl && (
                    <img
                      src={stagedImage.previewUrl}
                      alt="ตัวอย่างรูปก่อนส่ง"
                      className="lc-staged-thumb"
                    />
                  )}
                  <div className="lc-staged-info">
                    <div style={{ fontWeight: 700 }}>
                      {compressingImage ? 'กำลังปรับขนาดรูปภาพ...' : stagedImage?.file?.name}
                    </div>
                    {stagedImage?.file && (
                      <div>ขนาดหลังบีบอัด: {formatBytes(stagedImage.file.size)}</div>
                    )}
                  </div>
                </div>
                <div className="lc-staged-actions">
                  <button
                    type="button"
                    className="lc-mini-btn"
                    onClick={clearStagedImage}
                    disabled={sending}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    className="lc-mini-btn primary"
                    onClick={handleSendStagedImage}
                    disabled={sending || compressingImage || !stagedImage?.file}
                  >
                    {sending ? 'กำลังส่งรูป...' : 'ส่งรูปภาพ'}
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Composer */}
            <div className="lc-composer">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) stageImageFile(f);
                }}
              />
              <button
                type="button"
                className="lc-upload-btn"
                title="ส่งรูปภาพ (หรือวางด้วย Ctrl+V)"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </button>

              <textarea
                className="lc-composer-textarea"
                rows={1}
                placeholder="พิมพ์ข้อความตอบกลับคนไข้... (Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่, Ctrl+V วางรูป)"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                disabled={sending}
              />

              <button
                type="button"
                className="lc-send-btn"
                onClick={handleSendText}
                disabled={sending || !textInput.trim()}
              >
                <span>{sending ? 'กำลังส่ง...' : 'ส่ง'}</span>
              </button>
            </div>
          </>
        )}
      </section>

      {/* ==================== Column 3: Patient Context ==================== */}
      {selectedRoomId && showPatientPanel && (
        <aside className="lc-patient-panel">
          {patientLoading && !patientInfo ? (
            <div className="lc-empty-state">กำลังโหลดข้อมูลคนไข้...</div>
          ) : (
            <>
              {/* Linked Profile & Manual HN Binding */}
              <div className="lc-info-card">
                <div className="lc-info-card-title">
                  <span>ข้อมูลผู้ป่วย / LINE</span>
                  <button
                    type="button"
                    className="lc-mini-btn"
                    onClick={() => setEditingHn((v) => !v)}
                  >
                    {editingHn ? 'ปิด' : 'ผูก/แก้ไข HN'}
                  </button>
                </div>

                <div className="lc-info-row">
                  <span className="lc-info-label">ชื่อ LINE</span>
                  <span className="lc-info-val">{activeRoom?.display_name || '-'}</span>
                </div>
                <div className="lc-info-row">
                  <span className="lc-info-label">HN</span>
                  <span className="lc-info-val">{patientInfo?.room?.hn || '-'}</span>
                </div>

                {editingHn && (
                  <form className="lc-hn-link-form" onSubmit={handleSaveHn}>
                    <input
                      type="text"
                      className="lc-hn-link-input"
                      placeholder="ระบุ HN (เว้นว่าง=ยกเลิกผูก)"
                      value={hnInput}
                      onChange={(e) => setHnInput(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="lc-mini-btn primary"
                      disabled={savingHn}
                    >
                      {savingHn ? '...' : 'บันทึก'}
                    </button>
                  </form>
                )}

                {patientInfo?.hosPatient && (
                  <>
                    <div className="lc-info-row">
                      <span className="lc-info-label">ชื่อ-สกุล (HOSxP)</span>
                      <span className="lc-info-val">
                        {`${patientInfo.hosPatient.pname || ''}${patientInfo.hosPatient.fname || ''} ${patientInfo.hosPatient.lname || ''}`.trim()}
                      </span>
                    </div>
                    <div className="lc-info-row">
                      <span className="lc-info-label">วันเกิด</span>
                      <span className="lc-info-val">{formatThaiDate(patientInfo.hosPatient.birthday)}</span>
                    </div>
                    <div className="lc-info-row">
                      <span className="lc-info-label">เบอร์โทร</span>
                      <span className="lc-info-val">
                        {patientInfo.hosPatient.informtel || patientInfo.hosPatient.hometel || '-'}
                      </span>
                    </div>
                    <div className="lc-info-row">
                      <span className="lc-info-label">สิทธิ์การรักษา</span>
                      <span className="lc-info-val">{patientInfo.hosPatient.pttype_name || '-'}</span>
                    </div>
                  </>
                )}

                {patientInfo?.lineProfiles?.length > 0 && (
                  <>
                    <div className="lc-info-row">
                      <span className="lc-info-label">เลข ปชช.</span>
                      <span className="lc-info-val">{maskCid(patientInfo.lineProfiles[0].cid)}</span>
                    </div>
                    <div className="lc-info-row">
                      <span className="lc-info-label">เบอร์ลงทะเบียน LINE</span>
                      <span className="lc-info-val">{patientInfo.lineProfiles[0].mobile_no || '-'}</span>
                    </div>
                    <div className="lc-info-row">
                      <span className="lc-info-label">ระดับยืนยัน (IAL)</span>
                      <span className="lc-info-val">{patientInfo.lineProfiles[0].ial || '-'}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Caregiver Dependents */}
              {patientInfo?.caregivers?.length > 0 && (
                <div className="lc-info-card">
                  <div className="lc-info-card-title">ผู้ป่วยในความดูแล (Caregiver)</div>
                  {patientInfo.caregivers.map((cg) => (
                    <div key={cg.id} className="lc-sublist-item">
                      <div style={{ fontWeight: 700 }}>
                        HN {cg.hn} · {cg.patient_name}
                      </div>
                      <div style={{ color: '#64748b' }}>ความสัมพันธ์: {cg.relationship || '-'}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Upcoming HOSxP Appointments */}
              <div className="lc-info-card">
                <div className="lc-info-card-title">นัดหมาย HOSxP ถัดไป</div>
                {!patientInfo?.appointments?.length ? (
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>ไม่พบรายการนัดหมายล่วงหน้า</div>
                ) : (
                  patientInfo.appointments.map((appt) => (
                    <div key={appt.oapp_id} className="lc-sublist-item">
                      <div style={{ fontWeight: 700, color: '#1d4ed8' }}>
                        {formatThaiDate(appt.nextdate)} {appt.nexttime ? String(appt.nexttime).slice(0, 5) : ''}
                      </div>
                      <div>{appt.clinic_name || 'ไม่ระบุคลินิก'}</div>
                      {appt.doctor_name && (
                        <div style={{ color: '#64748b' }}>แพทย์: {appt.doctor_name}</div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Recent Telemed Requests */}
              <div className="lc-info-card">
                <div className="lc-info-card-title">คำร้อง Telemed ล่าสุด</div>
                {!patientInfo?.telemedRequests?.length ? (
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>ยังไม่มีประวัติคำร้อง Telemed</div>
                ) : (
                  patientInfo.telemedRequests.map((reqItem) => (
                    <div key={reqItem.id} className="lc-sublist-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                        <span>นัด {formatThaiDate(reqItem.nextdate)}</span>
                        <span style={{ color: '#0369a1' }}>{reqItem.status}</span>
                      </div>
                      <div>{reqItem.clinic_name || '-'}</div>
                      {reqItem.vn_today && (
                        <div style={{ color: '#15803d' }}>VN: {reqItem.vn_today}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </aside>
      )}

      {/* ==================== Lightbox Modal ==================== */}
      {lightboxUrl && (
        <div className="lc-lightbox-backdrop" onClick={() => setLightboxUrl(null)}>
          <button
            type="button"
            className="lc-lightbox-close"
            onClick={() => setLightboxUrl(null)}
            aria-label="ปิดภาพขยาย"
          >
            ×
          </button>
          <img
            src={lightboxUrl}
            alt="ภาพขนาดเต็ม"
            className="lc-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

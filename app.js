// ===== استيراد Firebase =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, Timestamp, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ===== إعدادات Firebase =====
const firebaseConfig = {
  apiKey: "AIzaSyDeNKi4mjxT8ADaDRSwa8Hriyl_ocC315A",
  authDomain: "v2-million-selfies.firebaseapp.com",
  projectId: "v2-million-selfies",
  storageBucket: "v2-million-selfies.firebasestorage.app",
  messagingSenderId: "853762238562",
  appId: "1:853762238562:web:b613fe254d79b4afb6c93b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ===== الإعدادات =====
const GRID_SIZE = 1000;
const TOTAL_CELLS = 1000000;
const CELL_PRICE = 1;
const BUSINESS_CELL_PRICE = 5;
const MAX_SQUARES = 400;
const REFERRAL_TARGET = 10;

let CELL_PIXEL_SIZE = 50;
let ZOOM_STEP = 3;
let ZOOM_STEP_TOUCH = 3;

let selectedBookingType = 'personal';
let currentCellPrice = CELL_PRICE;

// ===== Canvas =====
const canvas = document.getElementById('gridCanvas');
const ctx = canvas.getContext('2d', { alpha: false });

let offsetX = 0;
let offsetY = 0;

let allBookings = [];
let approvedBookings = [];
let hoveredCell = null;
let selectedQuantity = 1;
let imageCache = {};

let selectionStart = null;
let selectionEnd = null;
let isSelecting = false;
let selectionMode = false;

let previewImage = null;
let previewImageUrl = null;

// ===== 🆕 Cache للحجوزات (للبحث السريع) =====
let bookingsIndexCache = new Map();
let cacheVersion = 0;
// ===== 🆕 دالة رسم القلب =====
function drawHeartPath(ctx, centerX, centerY, size) {
  const topCurveHeight = size * 0.3;
  
  ctx.beginPath();
  ctx.moveTo(centerX, centerY + topCurveHeight);
  
  ctx.bezierCurveTo(
    centerX - size * 0.5, centerY - size * 0.3,
    centerX - size * 0.5, centerY + size * 0.1,
    centerX, centerY + size * 0.4
  );
  
  ctx.bezierCurveTo(
    centerX + size * 0.5, centerY + size * 0.1,
    centerX + size * 0.5, centerY - size * 0.3,
    centerX, centerY + topCurveHeight
  );
  
  ctx.closePath();
}

// ===== 🆕 متغيرات منع الرسم المكرر =====
let drawGridPending = false;
const pendingImageLoads = new Set();

// ===== إدارة الإعجابات =====
function getMyLikes() {
  const likes = localStorage.getItem('my_likes');
  return likes ? JSON.parse(likes) : [];
}

function saveLike(bookingId) {
  const likes = getMyLikes();
  if (!likes.includes(bookingId)) {
    likes.push(bookingId);
    localStorage.setItem('my_likes', JSON.stringify(likes));
  }
}

function hasLiked(bookingId) {
  return getMyLikes().includes(bookingId);
}

// ===== إظهار إشعار (Toast) =====
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 100);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// ===== إشعار الإعجاب =====
function showLikeNotification(booking, count) {
  const currentLang = localStorage.getItem('lang') || 'ar';
  const message = currentLang === 'ar' 
    ? `أعجبك صورة ${booking.userName || 'زائر'}! (${count} إعجاب)` 
    : `You liked ${booking.userName || 'Guest'}'s photo! (${count} likes)`;
  
  const toast = document.createElement('div');
  toast.className = 'like-notification';
  toast.innerHTML = `
    <div class="like-notification-content">
      <img src="${booking.selfieUrl || ''}" alt="صورة" onerror="this.style.display='none'">
      <div class="like-text">
        <span class="like-heart">❤️</span>
        <span>${message}</span>
      </div>
    </div>
  `;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 100);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ===== نظام الإحالة =====
function generateReferralCode() {
  return 'USER' + Math.random().toString(36).substr(2, 8).toUpperCase();
}

function getMyReferralCode() {
  let code = localStorage.getItem('my_referral_code');
  if (!code) {
    code = generateReferralCode();
    localStorage.setItem('my_referral_code', code);
  }
  return code;
}

function getReferredBy() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (ref) {
    localStorage.setItem('referred_by', ref);
  }
  return ref || localStorage.getItem('referred_by') || null;
}

// ===== نسخ رابط الإحالة =====
window.copyReferralLink = function() {
  const code = getMyReferralCode();
  const url = window.location.origin + window.location.pathname + '?ref=' + code;
  
  navigator.clipboard.writeText(url).then(() => {
    const currentLang = localStorage.getItem('lang') || 'ar';
    showToast(currentLang === 'ar' 
      ? `✅ تم نسخ رابط الإحالة! شاركه مع ${REFERRAL_TARGET} من أصدقائك.` 
      : `✅ Referral link copied! Share it with ${REFERRAL_TARGET} friends.`);
  }).catch(() => {
    showToast('❌ فشل نسخ الرابط');
  });
};

// ===== تحويل الصورة إلى JPG =====
function convertToJPG(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 1200;
        let width = img.width;
        let height = img.height;

        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctxTemp = canvas.getContext('2d');
        ctxTemp.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) {
            const newFile = new File([blob], 'image.jpg', { type: 'image/jpeg' });
            resolve(newFile);
          } else {
            reject(new Error('فشل تحويل الصورة'));
          }
        }, 'image/jpeg', 0.85);
      };
      img.onerror = () => reject(new Error('فشل تحميل الصورة'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('فشل قراءة الملف'));
    reader.readAsDataURL(file);
  });
}

// ===== إعداد Canvas (محسّن) =====
function resizeCanvas() {
  const container = canvas.parentElement;
  const newWidth = container.clientWidth;
  const newHeight = container.clientHeight;
  
  if (canvas.width === newWidth && canvas.height === newHeight) return;
  
  canvas.width = newWidth;
  canvas.height = newHeight;
  drawGrid();
}

// ===== 🆕 بناء Cache الحجوزات (للبحث السريع) =====
function buildBookingsIndex() {
  bookingsIndexCache.clear();
  allBookings.forEach(b => {
    if (b.status !== 'approved' && b.status !== 'pending') return;
    const startX = b.startCell % GRID_SIZE;
    const startY = Math.floor(b.startCell / GRID_SIZE);
    const endX = startX + b.gridShape.cols - 1;
    const endY = startY + b.gridShape.rows - 1;
    
    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        bookingsIndexCache.set(`${x},${y}`, b);
      }
    }
  });
  cacheVersion++;
}

// ===== رسم التهشير الذهبي المتقاطع =====
function drawBusinessHatch(x, y, width, height) {
  ctx.save();
  
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  
  const step = 12;
  ctx.strokeStyle = 'rgba(212, 160, 23, 0.85)';
  ctx.lineWidth = 1.5;
  
  for (let i = -height; i < width; i += step) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + height);
    ctx.lineTo(x + i + height, y);
    ctx.stroke();
  }
  
  for (let i = -height; i < width; i += step) {
    ctx.beginPath();
    ctx.moveTo(x + i, y);
    ctx.lineTo(x + i + height, y + height);
    ctx.stroke();
  }
  
  ctx.restore();
}

// ===== رسم إطار ذهبي نابض =====
function drawGlowingBorder(x, y, width, height, intensity = 1) {
  const now = Date.now();
  const pulse = (Math.sin(now / 500) + 1) / 2;
  const blurAmount = 8 + (pulse * 12) * intensity;
  
  ctx.save();
  ctx.shadowColor = '#f5b301';
  ctx.shadowBlur = blurAmount;
  ctx.strokeStyle = `rgba(245, 179, 1, ${0.7 + pulse * 0.3})`;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
  
  ctx.shadowBlur = blurAmount * 1.5;
  ctx.strokeStyle = `rgba(212, 160, 23, ${0.4 + pulse * 0.4})`;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 2, y + 2, width - 4, height - 4);
  
  ctx.restore();
}

// ===== 🆕 رسم الشبكة (مع requestAnimationFrame) =====
function drawGrid() {
  if (drawGridPending) return;
  drawGridPending = true;
  
  requestAnimationFrame(() => {
    drawGridPending = false;
    drawGridNow();
  });
}

function drawGridNow() {
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ✅ رسم الخطوط المحيطة فقط (Batch Drawing)
  const startX = Math.max(0, Math.floor(offsetX / CELL_PIXEL_SIZE) - 1);
  const startY = Math.max(0, Math.floor(offsetY / CELL_PIXEL_SIZE) - 1);
  const endX = Math.min(GRID_SIZE, startX + Math.ceil(canvas.width / CELL_PIXEL_SIZE) + 3);
  const endY = Math.min(GRID_SIZE, startY + Math.ceil(canvas.height / CELL_PIXEL_SIZE) + 3);

  ctx.strokeStyle = '#2a2a35';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const px = x * CELL_PIXEL_SIZE - offsetX;
      const py = y * CELL_PIXEL_SIZE - offsetY;
      ctx.rect(px, py, CELL_PIXEL_SIZE, CELL_PIXEL_SIZE);
    }
  }
  ctx.stroke();

  drawBookings();

  if (isSelecting && selectionStart && selectionEnd) {
    const x1 = Math.min(selectionStart.x, selectionEnd.x);
    const y1 = Math.min(selectionStart.y, selectionEnd.y);
    const x2 = Math.max(selectionStart.x, selectionEnd.x);
    const y2 = Math.max(selectionStart.y, selectionEnd.y);

    const px = x1 * CELL_PIXEL_SIZE - offsetX;
    const py = y1 * CELL_PIXEL_SIZE - offsetY;
    const width = (x2 - x1 + 1) * CELL_PIXEL_SIZE;
    const height = (y2 - y1 + 1) * CELL_PIXEL_SIZE;

    const validSelection = isSelectionValid(x1, y1, x2, y2);

    if (validSelection) {
      ctx.fillStyle = 'rgba(212, 160, 23, 0.2)';
      ctx.strokeStyle = '#f5b301';
      ctx.shadowColor = '#f5b301';
    } else {
      ctx.fillStyle = 'rgba(154, 58, 58, 0.3)';
      ctx.strokeStyle = '#ff3333';
      ctx.shadowColor = '#ff3333';
    }

    ctx.fillRect(px, py, width, height);
    ctx.lineWidth = 3;
    ctx.shadowBlur = 15;
    ctx.strokeRect(px + 1, py + 1, width - 2, height - 2);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    const count = (x2 - x1 + 1) * (y2 - y1 + 1);
    ctx.fillStyle = validSelection ? '#f5b301' : '#ff3333';
    ctx.font = 'bold 16px Cairo, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${count}`, px + width / 2, py - 10);
  }

  if (previewImage && selectionStart && selectionEnd) {
    const x1 = Math.min(selectionStart.x, selectionEnd.x);
    const y1 = Math.min(selectionStart.y, selectionEnd.y);
    const x2 = Math.max(selectionStart.x, selectionEnd.x);
    const y2 = Math.max(selectionStart.y, selectionEnd.y);

    const px = x1 * CELL_PIXEL_SIZE - offsetX;
    const py = y1 * CELL_PIXEL_SIZE - offsetY;
    const width = (x2 - x1 + 1) * CELL_PIXEL_SIZE;
    const height = (y2 - y1 + 1) * CELL_PIXEL_SIZE;

    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, width, height);
    ctx.clip();
    ctx.globalAlpha = 0.85;
    ctx.drawImage(previewImage, px, py, width, height);
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.strokeStyle = '#f5b301';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.strokeRect(px + 1, py + 1, width - 2, height - 2);
    ctx.setLineDash([]);
  }

  if (hoveredCell && !isDragging && !inertiaFrame && !isSelecting && !selectionMode) {
    const px = hoveredCell.x * CELL_PIXEL_SIZE - offsetX;
    const py = hoveredCell.y * CELL_PIXEL_SIZE - offsetY;
    ctx.fillStyle = 'rgba(212, 160, 23, 0.15)';
    ctx.fillRect(px, py, CELL_PIXEL_SIZE, CELL_PIXEL_SIZE);
    ctx.strokeStyle = '#f5b301';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#f5b301';
    ctx.shadowBlur = 12;
    ctx.strokeRect(px + 1, py + 1, CELL_PIXEL_SIZE - 2, CELL_PIXEL_SIZE - 2);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  drawScrollbars();
}

// ===== رسم أشرطة التمرير =====
function drawScrollbars() {
  const totalWidth = GRID_SIZE * CELL_PIXEL_SIZE;
  const totalHeight = GRID_SIZE * CELL_PIXEL_SIZE;

  const scrollbarThickness = 5;
  const scrollbarMargin = 8;
  const scrollbarColor = '#d4a017';
  const scrollbarBgColor = 'rgba(42, 42, 53, 0.5)';

  const vTrackX = canvas.width - scrollbarThickness - scrollbarMargin;
  const vTrackY = scrollbarMargin;
  const vTrackHeight = canvas.height - (scrollbarMargin * 2);

  ctx.fillStyle = scrollbarBgColor;
  ctx.fillRect(vTrackX, vTrackY, scrollbarThickness, vTrackHeight);

  const vHandleHeight = Math.max(50, (canvas.height / totalHeight) * vTrackHeight);
  const vScrollableHeight = vTrackHeight - vHandleHeight;
  const vMaxOffset = Math.max(1, totalHeight - canvas.height);
  const vHandleY = vTrackY + (offsetY / vMaxOffset) * vScrollableHeight;

  ctx.fillStyle = scrollbarColor;
  ctx.fillRect(vTrackX, vHandleY, scrollbarThickness, vHandleHeight);

  const hTrackX = scrollbarMargin;
  const hTrackY = canvas.height - scrollbarThickness - scrollbarMargin;
  const hTrackWidth = canvas.width - (scrollbarMargin * 2);

  ctx.fillStyle = scrollbarBgColor;
  ctx.fillRect(hTrackX, hTrackY, hTrackWidth, scrollbarThickness);

  const hHandleWidth = Math.max(50, (canvas.width / totalWidth) * hTrackWidth);
  const hScrollableWidth = hTrackWidth - hHandleWidth;
  const hMaxOffset = Math.max(1, totalWidth - canvas.width);
  const hHandleX = hTrackX + (offsetX / hMaxOffset) * hScrollableWidth;

  ctx.fillStyle = scrollbarColor;
  ctx.fillRect(hHandleX, hTrackY, hHandleWidth, scrollbarThickness);
}

// ===== 🆕 رسم الحجوزات (Viewport Culling) =====
function drawBookings() {
  approvedBookings.forEach(booking => {
    const startX = (booking.startCell % GRID_SIZE) * CELL_PIXEL_SIZE - offsetX;
    const startY = Math.floor(booking.startCell / GRID_SIZE) * CELL_PIXEL_SIZE - offsetY;
    const width = booking.gridShape.cols * CELL_PIXEL_SIZE;
    const height = booking.gridShape.rows * CELL_PIXEL_SIZE;

    // ✅ Viewport Culling
    if (startX + width < -50 || startX > canvas.width + 50 || 
        startY + height < -50 || startY > canvas.height + 50) return;

    const isBusiness = booking.isBusiness === true;
    const isPending = booking.status === 'pending';
    const isApproved = booking.status === 'approved';

    if (isPending) {
      if (isBusiness) {
        ctx.fillStyle = 'rgba(212, 160, 23, 0.35)';
        ctx.fillRect(startX, startY, width, height);
        drawBusinessHatch(startX, startY, width, height);
      } else {
        ctx.fillStyle = 'rgba(74, 158, 255, 0.5)';
        ctx.fillRect(startX, startY, width, height);
      }
    }

    if (isApproved && booking.selfieUrl) {
      if (imageCache[booking.id] && imageCache[booking.id].complete) {
        ctx.drawImage(imageCache[booking.id], startX, startY, width, height);
      } else if (!imageCache[booking.id]) {
        loadBookingImage(booking);
      }
    }

    if (isPending) {
      if (isBusiness) {
        drawGlowingBorder(startX, startY, width, height);
        ctx.strokeStyle = 'rgba(245, 179, 1, 0.9)';
        ctx.lineWidth = 3;
        ctx.strokeRect(startX + 2, startY + 2, width - 4, height - 4);
      } else {
        ctx.save();
        ctx.shadowColor = 'rgba(74, 158, 255, 0.8)';
        ctx.shadowBlur = 12;
        ctx.strokeStyle = 'rgba(74, 158, 255, 0.95)';
        ctx.lineWidth = 3;
        ctx.strokeRect(startX + 1, startY + 1, width - 2, height - 2);
        ctx.restore();
      }
    } else if (isApproved) {
      if (isBusiness) {
        ctx.save();
        ctx.shadowColor = 'rgba(212, 160, 23, 0.5)';
        ctx.shadowBlur = 6;
        ctx.strokeStyle = 'rgba(212, 160, 23, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(startX + 0.5, startY + 0.5, width - 1, height - 1);
        ctx.restore();
      } else {
        ctx.strokeStyle = 'rgba(74, 158, 255, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(startX + 0.5, startY + 0.5, width - 1, height - 1);
      }
    }

    if (isPending && width > 40 && height > 40) {
      const badgeSize = Math.min(24, Math.max(16, width / 8));
      const badgeX = startX + 6;
      const badgeY = startY + 6;
      
      ctx.save();
      if (isBusiness) {
        ctx.shadowColor = '#f5b301';
        ctx.shadowBlur = 8;
        ctx.fillStyle = 'rgba(212, 160, 23, 0.95)';
      } else {
        ctx.shadowColor = 'rgba(74, 158, 255, 0.8)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = 'rgba(74, 158, 255, 0.9)';
      }
      ctx.beginPath();
      ctx.arc(badgeX + badgeSize / 2, badgeY + badgeSize / 2, badgeSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      
      ctx.fillStyle = isBusiness ? '#0a0a0f' : '#ffffff';
      ctx.font = `bold ${Math.round(badgeSize * 0.6)}px Cairo, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⏳', badgeX + badgeSize / 2, badgeY + badgeSize / 2 + 1);
      ctx.textBaseline = 'alphabetic';
    }

    // ===== 5. شارة الإعجابات (قلب) =====
if (isApproved && width > 50 && height > 50) {
  const liked = hasLiked(booking.id);
  const likesCount = booking.likes || 0;
  
  // حجم القلب يتناسب مع حجم المربع
  const heartSize = Math.min(36, Math.max(22, width / 5));
  const heartX = startX + width - heartSize / 2 - 10;
  const heartY = startY + height - heartSize / 2 - 10;
  
  ctx.save();
  
  if (liked) {
    // ✅ الحالة 1: مع إعجاب → قلب وردي ممتلئ + رقم بداخله
    ctx.shadowColor = 'rgba(255, 51, 102, 0.8)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    
    const gradient = ctx.createRadialGradient(
      heartX, heartY - heartSize * 0.1, 0,
      heartX, heartY, heartSize
    );
    gradient.addColorStop(0, '#ff6699');
    gradient.addColorStop(1, '#ff3366');
    ctx.fillStyle = gradient;
    
    drawHeartPath(ctx, heartX, heartY, heartSize);
    ctx.fill();
    
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    
    // كتابة الرقم داخل القلب
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(heartSize * 0.42)}px Cairo, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(likesCount, heartX, heartY + heartSize * 0.05);
    ctx.textBaseline = 'alphabetic';
    
  } else {
    // ✅ الحالة 2: بدون إعجاب → قلب مفرغ بإطار أبيض فقط (بدون رقم)
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 6;
    
    // خلفية داكنة خفيفة داخل القلب
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    drawHeartPath(ctx, heartX, heartY, heartSize);
    ctx.fill();
    
    ctx.shadowBlur = 0;
    
    // إطار أبيض
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = Math.max(1.5, heartSize * 0.06);
    drawHeartPath(ctx, heartX, heartY, heartSize);
    ctx.stroke();
  }
  
  ctx.restore();
}

// ===== 🆕 تحميل صور الحجوزات بشكل ذكي =====
function loadBookingImage(booking) {
  if (pendingImageLoads.has(booking.id)) return;
  pendingImageLoads.add(booking.id);
  
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    imageCache[booking.id] = img;
    pendingImageLoads.delete(booking.id);
    
    const keys = Object.keys(imageCache);
    if (keys.length > 100) {
      delete imageCache[keys[0]];
    }
    
    drawGrid();
  };
  img.onerror = () => {
    pendingImageLoads.delete(booking.id);
  };
  img.src = booking.selfieUrl;
}

// ===== التحقق من حجز المربع (فوري) =====
function isCellBooked(cellX, cellY) {
  return bookingsIndexCache.has(`${cellX},${cellY}`);
}

function isSelectionValid(x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      if (isCellBooked(x, y)) return false;
    }
  }
  return true;
}

// ===== تحميل الحجوزات (محسّن) =====
async function loadBookings() {
  try {
    const snapshot = await getDocs(collection(db, "bookings"));
    const allDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    allBookings = allDocs.filter(b => b.status === 'pending' || b.status === 'approved');
    approvedBookings = allDocs.filter(b => b.status === 'approved' || b.status === 'pending');
    allBookings.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    buildBookingsIndex();
    
    updateStats();
    drawGrid();
    updateLeaderboard();
  } catch (error) {
    console.error("خطأ في تحميل الحجوزات:", error);
  }
}

// ===== تحديث الإحصائيات =====
function updateStats() {
  const bookedCells = allBookings.filter(b => b.status === 'approved').reduce((sum, b) => sum + (b.quantity || 0), 0);
  const availableCells = TOTAL_CELLS - bookedCells;
  const selfiesCount = allBookings.filter(b => b.status === 'approved').length;
  const progress = ((bookedCells / TOTAL_CELLS) * 100).toFixed(2);

  document.getElementById('statBooked').textContent = bookedCells.toLocaleString('en-US');
  document.getElementById('statAvailable').textContent = availableCells.toLocaleString('en-US');
  document.getElementById('statSelfies').textContent = selfiesCount.toLocaleString('en-US');
  document.getElementById('progressFill').style.width = progress + '%';
  document.getElementById('progressText').textContent = progress + '%';
}

// ===== تحديث لوحة الصدارة =====
async function updateLeaderboard() {
  try {
    const currentLang = localStorage.getItem('lang') || 'ar';
    
    const approvedOnly = allBookings.filter(b => b.status === 'approved');
    const recent = approvedOnly.slice(0, 5);
    const recentHTML = recent.map(b => {
      const isBusiness = b.isBusiness === true;
      return `
        <div class="lb-item">
          <img src="${b.selfieUrl || ''}" alt="صورة" class="${isBusiness ? 'business-logo' : ''}" onerror="this.style.display='none'">
          <span class="name">
            ${b.userName || 'زائر'}
            ${isBusiness ? '<span class="business-badge">🏢</span>' : ''}
          </span>
          <span class="count">${b.quantity || 1} ${currentLang === 'ar' ? 'مربع' : 'sq'}</span>
        </div>
      `;
    }).join('');
    
    const recentEl = document.getElementById('recentBookings');
    if (recentEl) recentEl.innerHTML = recentHTML || `<p style="color:#666;font-size:13px;">${currentLang === 'ar' ? 'لا توجد حجوزات بعد' : 'No bookings yet'}</p>`;

    const totalBooked = approvedOnly.reduce((sum, b) => sum + (b.quantity || 0), 0);
    const businessCount = approvedOnly.filter(b => b.isBusiness === true).length;
    
    const statsEl = document.getElementById('liveStats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="lb-item">
          <span class="name">${currentLang === 'ar' ? 'المربعات المحجوزة' : 'Booked Squares'}</span>
          <span class="count">${totalBooked.toLocaleString('en-US')}</span>
        </div>
        <div class="lb-item">
          <span class="name">${currentLang === 'ar' ? 'الصور المعتمدة' : 'Approved Photos'}</span>
          <span class="count">${approvedOnly.length.toLocaleString('en-US')}</span>
        </div>
        <div class="lb-item">
          <span class="name">${currentLang === 'ar' ? 'حسابات تجارية' : 'Business Accounts'}</span>
          <span class="count">🏢 ${businessCount.toLocaleString('en-US')}</span>
        </div>
      `;
    }

    const topLiked = [...approvedOnly]
      .filter(b => b.likes && b.likes > 0)
      .sort((a, b) => (b.likes || 0) - (a.likes || 0))
      .slice(0, 5);
    
    const topLikedHTML = topLiked.map(b => {
      const isBusiness = b.isBusiness === true;
      return `
        <div class="lb-item">
          <img src="${b.selfieUrl || ''}" alt="صورة" class="${isBusiness ? 'business-logo' : ''}" onerror="this.style.display='none'">
          <span class="name">
            ${b.userName || 'زائر'}
            ${isBusiness ? '<span class="business-badge">🏢</span>' : ''}
          </span>
          <span class="count">❤️ ${b.likes || 0}</span>
        </div>
      `;
    }).join('');
    
    const topLikedEl = document.getElementById('topLiked');
    if (topLikedEl) topLikedEl.innerHTML = topLikedHTML || `<p style="color:#666;font-size:13px;">${currentLang === 'ar' ? 'لا توجد إعجابات بعد' : 'No likes yet'}</p>`;

  } catch (error) {
    console.error('خطأ في تحديث لوحة الصدارة:', error);
  }
}

// ===== متغيرات السحب =====
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let hasDragged = false;

let velocityX = 0;
let velocityY = 0;
let inertiaFrame = null;
let lastMoveTime = 0;

// ===== 🆕 القصور الذاتي (محسّن) =====
function startInertia() {
  if (inertiaFrame) cancelAnimationFrame(inertiaFrame);
  
  let lastFrameTime = performance.now();

  function animate(currentTime) {
    const deltaTime = Math.min((currentTime - lastFrameTime) / 16.67, 3);
    lastFrameTime = currentTime;
    
    offsetX += velocityX * deltaTime;
    offsetY += velocityY * deltaTime;
    velocityX *= Math.pow(0.95, deltaTime);
    velocityY *= Math.pow(0.95, deltaTime);

    if (Math.abs(velocityX) < 0.1 && Math.abs(velocityY) < 0.1) {
      velocityX = 0;
      velocityY = 0;
      inertiaFrame = null;
      return;
    }

    offsetX = Math.max(0, Math.min(offsetX, GRID_SIZE * CELL_PIXEL_SIZE - canvas.width));
    offsetY = Math.max(0, Math.min(offsetY, GRID_SIZE * CELL_PIXEL_SIZE - canvas.height));

    drawGrid();
    inertiaFrame = requestAnimationFrame(animate);
  }

  inertiaFrame = requestAnimationFrame(animate);
}

// ===== تبديل وضع التحديد =====
function toggleSelectionMode() {
  const btn = document.getElementById('selectModeBtn');
  const currentLang = localStorage.getItem('lang') || 'ar';

  if (selectionMode && selectionStart && selectionEnd) {
    const x1 = Math.min(selectionStart.x, selectionEnd.x);
    const y1 = Math.min(selectionStart.y, selectionEnd.y);
    const x2 = Math.max(selectionStart.x, selectionEnd.x);
    const y2 = Math.max(selectionStart.y, selectionEnd.y);

    if (!isSelectionValid(x1, y1, x2, y2)) {
      alert(currentLang === 'ar' 
        ? '⚠️ المنطقة المختارة تحتوي على مربعات محجوزة. اختر منطقة فارغة.'
        : '⚠️ Selected area contains booked squares. Choose an empty area.');
      return;
    }

    const startCell = y1 * GRID_SIZE + x1;
    const quantity = (x2 - x1 + 1) * (y2 - y1 + 1);

    if (quantity > MAX_SQUARES) {
      alert(currentLang === 'ar'
        ? `⚠️ الحد الأقصى ${MAX_SQUARES} مربع. اختر منطقة أصغر.`
        : `⚠️ Maximum is ${MAX_SQUARES} squares. Choose a smaller area.`);
      return;
    }

    selectionMode = false;
    if (btn) {
      btn.classList.remove('active');
      btn.textContent = currentLang === 'ar' ? '🖱️ تحديد المربعات' : '🖱️ Select Squares';
    }
    canvas.style.cursor = 'crosshair';

    openBookingModal(startCell);
    selectedQuantity = quantity;
    updatePriceDisplay();

    drawGrid();
    return;
  }

  selectionMode = !selectionMode;

  if (btn) {
    btn.classList.toggle('active', selectionMode);
    btn.textContent = selectionMode 
      ? (currentLang === 'ar' ? '✅ إنهاء التحديد' : '✅ Finish Selection')
      : (currentLang === 'ar' ? '🖱️ تحديد المربعات' : '🖱️ Select Squares');
  }

  selectionStart = null;
  selectionEnd = null;
  previewImage = null;
  previewImageUrl = null;
  isSelecting = false;

  canvas.style.cursor = selectionMode ? 'cell' : 'crosshair';
  drawGrid();
}

// ===== نافذة التوجيه =====
function closeOnboarding() {
  document.getElementById('onboardingModal').classList.add('hidden');
  localStorage.setItem('onboarding_seen', 'true');
  document.body.style.overflow = '';
}
window.closeOnboarding = closeOnboarding;

// ===== التفاعل مع الفأرة (محسّن) =====
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();

  if (selectionMode) {
    if (isSelecting) {
      const x = Math.floor((e.clientX - rect.left + offsetX) / CELL_PIXEL_SIZE);
      const y = Math.floor((e.clientY - rect.top + offsetY) / CELL_PIXEL_SIZE);
      if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
        if (!selectionEnd || selectionEnd.x !== x || selectionEnd.y !== y) {
          selectionEnd = { x, y };
          updateSelectedCount();
          drawGrid();
        }
      }
    }
    return;
  }

  if (isDragging) {
    const now = Date.now();
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasDragged = true;
    offsetX -= dx;
    offsetY -= dy;
    const dt = now - lastMoveTime || 16;
    velocityX = -(dx) / dt * 16;
    velocityY = -(dy) / dt * 16;
    lastMoveTime = now;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    offsetX = Math.max(0, Math.min(offsetX, GRID_SIZE * CELL_PIXEL_SIZE - canvas.width));
    offsetY = Math.max(0, Math.min(offsetY, GRID_SIZE * CELL_PIXEL_SIZE - canvas.height));
    drawGrid();
    return;
  }

  const x = Math.floor((e.clientX - rect.left + offsetX) / CELL_PIXEL_SIZE);
  const y = Math.floor((e.clientY - rect.top + offsetY) / CELL_PIXEL_SIZE);
  if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
    if (!hoveredCell || hoveredCell.x !== x || hoveredCell.y !== y) {
      hoveredCell = { x, y };
      drawGrid();
    }
  }
});

canvas.addEventListener('mousedown', (e) => {
  if (inertiaFrame) {
    cancelAnimationFrame(inertiaFrame);
    inertiaFrame = null;
  }

  if (selectionMode) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left + offsetX) / CELL_PIXEL_SIZE);
    const y = Math.floor((e.clientY - rect.top + offsetY) / CELL_PIXEL_SIZE);
    if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
      isSelecting = true;
      selectionStart = { x, y };
      selectionEnd = { x, y };
      updateSelectedCount();
      drawGrid();
    }
    return;
  }

  isDragging = true;
  hasDragged = false;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  lastMoveTime = Date.now();
  velocityX = 0;
  velocityY = 0;
  canvas.style.cursor = 'grabbing';
});

canvas.addEventListener('mouseup', () => {
  if (selectionMode && isSelecting) {
    isSelecting = false;
    return;
  }
  isDragging = false;
  canvas.style.cursor = selectionMode ? 'cell' : 'crosshair';
  if (Math.abs(velocityX) > 0.5 || Math.abs(velocityY) > 0.5) {
    startInertia();
  }
});

canvas.addEventListener('mouseleave', () => {
  isDragging = false;
  if (hoveredCell) {
    hoveredCell = null;
    drawGrid();
  }
  canvas.style.cursor = selectionMode ? 'cell' : 'crosshair';
});

// ===== 🆕 عجلة الفأرة (Debounced) =====
let wheelTimer = null;
let wheelAccum = 0;

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  
  wheelAccum += e.deltaY;
  
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => {
    const oldSize = CELL_PIXEL_SIZE;
    const direction = wheelAccum < 0 ? 1 : -1;
    const steps = Math.max(1, Math.floor(Math.abs(wheelAccum) / 100));
    
    CELL_PIXEL_SIZE = Math.max(10, Math.min(200, CELL_PIXEL_SIZE + direction * steps * ZOOM_STEP));
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    offsetX = (offsetX + mouseX) * (CELL_PIXEL_SIZE / oldSize) - mouseX;
    offsetY = (offsetY + mouseY) * (CELL_PIXEL_SIZE / oldSize) - mouseY;
    offsetX = Math.max(0, Math.min(offsetX, GRID_SIZE * CELL_PIXEL_SIZE - canvas.width));
    offsetY = Math.max(0, Math.min(offsetY, GRID_SIZE * CELL_PIXEL_SIZE - canvas.height));
    
    drawGrid();
    wheelAccum = 0;
  }, 16);
}, { passive: false });

// ===== إدارة النقرات =====
let clickTimer = null;
let clickCount = 0;

canvas.addEventListener('click', (e) => {
  if (selectionMode) return;
  if (hasDragged) {
    hasDragged = false;
    return;
  }

  clickCount++;

  if (clickCount === 1) {
    clickTimer = setTimeout(() => {
      handleSingleClick(e);
      clickCount = 0;
    }, 280);
  } else if (clickCount === 2) {
    clearTimeout(clickTimer);
    clickCount = 0;
    handleDoubleClick(e);
  }
});

// ===== معالجة النقرة المفردة =====
function handleSingleClick(e) {
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left + offsetX;
  const clickY = e.clientY - rect.top + offsetY;

  for (const booking of approvedBookings) {
    if (booking.status !== 'approved') continue;
    
    const startX = (booking.startCell % GRID_SIZE) * CELL_PIXEL_SIZE;
    const startY = Math.floor(booking.startCell / GRID_SIZE) * CELL_PIXEL_SIZE;
    const width = booking.gridShape.cols * CELL_PIXEL_SIZE;
    const height = booking.gridShape.rows * CELL_PIXEL_SIZE;

    if (clickX >= startX && clickX <= startX + width &&
        clickY >= startY && clickY <= startY + height) {
      
      if (booking.isBusiness === true && booking.ctaButton && booking.userLink) {
        let url = booking.userLink.trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        window.open(url, '_blank', 'noopener');
        return;
      }
      
      if (booking.userLink && booking.userLink.trim()) {
        let url = booking.userLink.trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        window.open(url, '_blank', 'noopener');
      } else {
        const currentLang = localStorage.getItem('lang') || 'ar';
        const isBusiness = booking.isBusiness === true;
        const name = isBusiness 
          ? (booking.brandName || booking.userName || 'شركة')
          : (booking.userName || 'زائر');
        showToast(currentLang === 'ar' 
          ? `📸 صاحب الصورة: ${name}` 
          : `📸 Photo owner: ${name}`);
      }
      return;
    }
  }

  for (const booking of approvedBookings) {
    if (booking.status !== 'pending') continue;
    
    const startX = (booking.startCell % GRID_SIZE) * CELL_PIXEL_SIZE;
    const startY = Math.floor(booking.startCell / GRID_SIZE) * CELL_PIXEL_SIZE;
    const width = booking.gridShape.cols * CELL_PIXEL_SIZE;
    const height = booking.gridShape.rows * CELL_PIXEL_SIZE;

    if (clickX >= startX && clickX <= startX + width &&
        clickY >= startY && clickY <= startY + height) {
      const currentLang = localStorage.getItem('lang') || 'ar';
      showToast(currentLang === 'ar' 
        ? '⏳ هذا المربع محجوز مؤقتاً - قيد المراجعة' 
        : '⏳ This square is temporarily booked - under review');
      return;
    }
  }

  if (!hoveredCell) return;
  const startCell = hoveredCell.y * GRID_SIZE + hoveredCell.x;
  
  if (isCellBooked(hoveredCell.x, hoveredCell.y)) {
    const currentLang = localStorage.getItem('lang') || 'ar';
    showToast(currentLang === 'ar' 
      ? '⚠️ هذا المربع محجوز بالفعل' 
      : '⚠️ This square is already booked');
    return;
  }
  
  openBookingModal(startCell);
}

// ===== معالجة النقرة المزدوجة =====
async function handleDoubleClick(e) {
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left + offsetX;
  const clickY = e.clientY - rect.top + offsetY;

  for (const booking of approvedBookings) {
    if (booking.status !== 'approved') continue;
    
    const startX = (booking.startCell % GRID_SIZE) * CELL_PIXEL_SIZE;
    const startY = Math.floor(booking.startCell / GRID_SIZE) * CELL_PIXEL_SIZE;
    const width = booking.gridShape.cols * CELL_PIXEL_SIZE;
    const height = booking.gridShape.rows * CELL_PIXEL_SIZE;

    if (clickX >= startX && clickX <= startX + width &&
        clickY >= startY && clickY <= startY + height) {
      
      const currentLang = localStorage.getItem('lang') || 'ar';
      
      if (hasLiked(booking.id)) {
        showToast(currentLang === 'ar' ? '❤️ لقد أعجبت بهذه الصورة مسبقاً' : '❤️ You already liked this photo');
        return;
      }

      try {
        const newLikes = (booking.likes || 0) + 1;
        await updateDoc(doc(db, "bookings", booking.id), {
          likes: newLikes
        });
        
        saveLike(booking.id);
        booking.likes = newLikes;
        
        drawGrid();
        updateLeaderboard();
        showLikeNotification(booking, newLikes);
        
      } catch (error) {
        console.error('خطأ في الإعجاب:', error);
      }
      
      return;
    }
  }
}

// ===== الضغط المطول =====
let longPressTimer = null;
let longPressActive = false;

canvas.addEventListener('touchstart', (e) => {
  if (inertiaFrame) {
    cancelAnimationFrame(inertiaFrame);
    inertiaFrame = null;
  }

  if (selectionMode) {
    if (e.touches.length === 1) {
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((e.touches[0].clientX - rect.left + offsetX) / CELL_PIXEL_SIZE);
      const y = Math.floor((e.touches[0].clientY - rect.top + offsetY) / CELL_PIXEL_SIZE);
      if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
        isSelecting = true;
        selectionStart = { x, y };
        selectionEnd = { x, y };
        updateSelectedCount();
        drawGrid();
      }
    }
    return;
  }

  if (e.touches.length === 1) {
    const touch = e.touches[0];
    longPressActive = false;
    
    longPressTimer = setTimeout(() => {
      longPressActive = true;
      handleLongPress(touch.clientX, touch.clientY);
    }, 600);

    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    lastMoveTime = Date.now();
    velocityX = 0;
    velocityY = 0;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((touch.clientX - rect.left + offsetX) / CELL_PIXEL_SIZE);
    const y = Math.floor((touch.clientY - rect.top + offsetY) / CELL_PIXEL_SIZE);
    if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
      hoveredCell = { x, y };
      drawGrid();
    }
  } else if (e.touches.length === 2) {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    lastTouchDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
  }
}, { passive: true });

// ===== معالجة الضغط المطول =====
function handleLongPress(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const clickX = clientX - rect.left + offsetX;
  const clickY = clientY - rect.top + offsetY;

  for (const booking of approvedBookings) {
    if (booking.status !== 'approved') continue;
    
    const startX = (booking.startCell % GRID_SIZE) * CELL_PIXEL_SIZE;
    const startY = Math.floor(booking.startCell / GRID_SIZE) * CELL_PIXEL_SIZE;
    const width = booking.gridShape.cols * CELL_PIXEL_SIZE;
    const height = booking.gridShape.rows * CELL_PIXEL_SIZE;

    if (clickX >= startX && clickX <= startX + width &&
        clickY >= startY && clickY <= startY + height) {
      showOwnerCard(booking);
      return;
    }
  }
}

// ===== عرض بطاقة صاحب الصورة =====
function showOwnerCard(booking) {
  const currentLang = localStorage.getItem('lang') || 'ar';
  const isBusiness = booking.isBusiness === true;
  
  const oldCard = document.getElementById('ownerCard');
  if (oldCard) oldCard.remove();
  
  const displayName = isBusiness 
    ? (booking.brandName || booking.userName || 'شركة')
    : (booking.userName || (currentLang === 'ar' ? 'زائر' : 'Guest'));
  
  const card = document.createElement('div');
  card.id = 'ownerCard';
  card.className = `owner-card ${isBusiness ? 'business-owner' : ''}`;
  
  const nameHTML = isBusiness 
    ? `${displayName} <span class="business-tag">🏢 شركة</span>`
    : displayName;
  
  let linkHTML = '';
  if (booking.userLink) {
    let url = booking.userLink.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    
    if (isBusiness && booking.ctaButton) {
      linkHTML = `
        <a href="${url}" target="_blank" class="owner-link business-cta">
          🚀 ${booking.ctaButton}
        </a>
      `;
    } else {
      linkHTML = `
        <a href="${url}" target="_blank" class="owner-link">
          🔗 ${currentLang === 'ar' ? 'زيارة الحساب' : 'Visit Profile'}
        </a>
      `;
    }
  } else if (isBusiness && booking.ctaButton) {
    linkHTML = `
      <span class="owner-link business-cta" style="opacity:0.6;cursor:default;">
        ${booking.ctaButton}
      </span>
    `;
  }
  
  card.innerHTML = `
    <div class="owner-card-content">
      <img src="${booking.selfieUrl || ''}" 
           alt="صورة" 
           class="owner-card-img ${isBusiness ? 'business-logo' : ''}" 
           onerror="this.style.display='none'">
      <div class="owner-card-info">
        <h3>${nameHTML}</h3>
        ${booking.userNote ? `<p class="owner-note">"${booking.userNote}"</p>` : ''}
        <div class="owner-stats">
          <span>📐 ${booking.quantity || 1} ${currentLang === 'ar' ? 'مربع' : 'squares'}</span>
          <span>❤️ ${booking.likes || 0}</span>
        </div>
        ${linkHTML}
      </div>
      <button class="owner-card-close" onclick="document.getElementById('ownerCard').remove()">✕</button>
    </div>
  `;
  document.body.appendChild(card);
  
  setTimeout(() => {
    if (card.parentNode) {
      card.classList.remove('show');
      setTimeout(() => card.remove(), 300);
    }
  }, 5000);
  
  setTimeout(() => card.classList.add('show'), 50);
}

window.showOwnerCard = showOwnerCard;

// ===== اللمس =====
let touchStartX = 0;
let touchStartY = 0;
let lastTouchDist = 0;

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();

  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  if (selectionMode && isSelecting && e.touches.length === 1) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.touches[0].clientX - rect.left + offsetX) / CELL_PIXEL_SIZE);
    const y = Math.floor((e.touches[0].clientY - rect.top + offsetY) / CELL_PIXEL_SIZE);
    if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
      if (!selectionEnd || selectionEnd.x !== x || selectionEnd.y !== y) {
        selectionEnd = { x, y };
        updateSelectedCount();
        drawGrid();
      }
    }
    return;
  }

  if (e.touches.length === 1) {
    const now = Date.now();
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    offsetX -= dx;
    offsetY -= dy;
    const dt = now - lastMoveTime || 16;
    velocityX = -(dx) / dt * 16;
    velocityY = -(dy) / dt * 16;
    lastMoveTime = now;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    offsetX = Math.max(0, Math.min(offsetX, GRID_SIZE * CELL_PIXEL_SIZE - canvas.width));
    offsetY = Math.max(0, Math.min(offsetY, GRID_SIZE * CELL_PIXEL_SIZE - canvas.height));
    drawGrid();
  } else if (e.touches.length === 2) {
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    if (lastTouchDist > 0) {
      const oldSize = CELL_PIXEL_SIZE;
      if (dist > lastTouchDist + 5) {
        CELL_PIXEL_SIZE = Math.min(CELL_PIXEL_SIZE + ZOOM_STEP_TOUCH, 200);
      } else if (dist < lastTouchDist - 5) {
        CELL_PIXEL_SIZE = Math.max(CELL_PIXEL_SIZE - ZOOM_STEP_TOUCH, 10);
      }
      if (CELL_PIXEL_SIZE !== oldSize) {
        offsetX = offsetX * (CELL_PIXEL_SIZE / oldSize);
        offsetY = offsetY * (CELL_PIXEL_SIZE / oldSize);
        drawGrid();
      }
    }
    lastTouchDist = dist;
  }
}, { passive: false });

canvas.addEventListener('touchend', () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  
  if (selectionMode && isSelecting) {
    isSelecting = false;
    return;
  }
  lastTouchDist = 0;
  if (Math.abs(velocityX) > 0.5 || Math.abs(velocityY) > 0.5) {
    startInertia();
  }
}, { passive: true });

// ===== تحديث عدد المربعات المختارة =====
function updateSelectedCount() {
  if (!selectionStart || !selectionEnd) return;
  const x1 = Math.min(selectionStart.x, selectionEnd.x);
  const y1 = Math.min(selectionStart.y, selectionEnd.y);
  const x2 = Math.max(selectionStart.x, selectionEnd.x);
  const y2 = Math.max(selectionStart.y, selectionEnd.y);
  const count = (x2 - x1 + 1) * (y2 - y1 + 1);

  const valid = isSelectionValid(x1, y1, x2, y2);
  const currentLang = localStorage.getItem('lang') || 'ar';

  const display = document.getElementById('selectedCountDisplay');
  if (display) {
    if (valid) {
      display.textContent = currentLang === 'ar' 
        ? `المربعات المختارة: ${count}` 
        : `Selected squares: ${count}`;
      display.style.color = '#f5b301';
    } else {
      display.textContent = currentLang === 'ar' 
        ? `⚠️ المنطقة تحتوي على مربعات محجوزة` 
        : `⚠️ Area contains booked squares`;
      display.style.color = '#ff3333';
    }
  }

  const qtyInput = document.getElementById('quantityInput');
  if (qtyInput) {
    const finalCount = Math.min(count, MAX_SQUARES);
    qtyInput.value = finalCount;
    selectedQuantity = finalCount;
    updatePriceDisplay();
  }
}

// ===== تحديث السعر الإجمالي =====
function updatePriceDisplay() {
  const total = selectedQuantity * currentCellPrice;
  const priceDisplay = document.getElementById('totalPrice');
  const priceWrapper = document.querySelector('.price-display');
  
  if (priceDisplay) {
    priceDisplay.textContent = total + ' $';
  }
  
  if (priceWrapper) {
    if (selectedBookingType === 'business') {
      priceWrapper.classList.add('business-price');
    } else {
      priceWrapper.classList.remove('business-price');
    }
  }
}

// ===== فتح نافذة الحجز =====
function openBookingModal(startCell) {
  document.getElementById('bookingModal').classList.remove('hidden');
  document.getElementById('bookingModal').dataset.startCell = startCell;
  
  document.body.style.overflow = 'hidden';
  
  const qtyInput = document.getElementById('quantityInput');
  if (qtyInput) {
    qtyInput.readOnly = true;
    qtyInput.style.background = '#1a1a22';
    qtyInput.style.cursor = 'not-allowed';
    qtyInput.style.color = '#f5b301';
    qtyInput.style.fontWeight = 'bold';
    qtyInput.title = 'يتم تحديد العدد تلقائياً من الشبكة';
  }
  
  updatePaymentInfo();
  updatePriceDisplay();
}

// ===== إغلاق النافذة =====
document.getElementById('closeModal').addEventListener('click', () => {
  document.getElementById('bookingModal').classList.add('hidden');
  document.getElementById('generateCardBtn').style.display = 'none';
  
  document.body.style.overflow = '';
  
  selectionStart = null;
  selectionEnd = null;
  previewImage = null;
  previewImageUrl = null;
  drawGrid();
});

// ===== معلومات الدفع =====
document.getElementById('paymentMethod').addEventListener('change', updatePaymentInfo);

function updatePaymentInfo() {
  const method = document.getElementById('paymentMethod').value;
  const info = document.getElementById('paymentInfo');

  if (method === 'chamacash') {
    info.innerHTML = `
      <p>💳 حوّل المبلغ إلى محفظة شام كاش:</p>
      <img src="chama-barcode.png.jpg" alt="شام كاش">
      <p>ثم ارفع صورة الإيصال</p>
    `;
  } else {
    info.innerHTML = `
      <p>💰 حوّل USDT (TRC20) إلى:</p>
      <code style="display:block;word-break:break-all;margin:10px 0;color:#f5b301">TGRAeYyz8off9iqPVcph5YkZJuVL6Cngy</code>
      <button onclick="navigator.clipboard.writeText('TGRAeYyz8off9iqPVcph5YkZJuVL6Cngy')" 
              style="padding:8px 16px;background:#d4a017;border:none;border-radius:6px;cursor:pointer">
        📋 نسخ العنوان
      </button>
      <p style="margin-top:10px">ثم ارفع صورة الإيصال</p>
    `;
  }
}

// ===== معالجة اختيار نوع الحجز =====
document.querySelectorAll('input[name="bookingType"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    selectedBookingType = e.target.value;
    
    if (selectedBookingType === 'business') {
      currentCellPrice = BUSINESS_CELL_PRICE;
    } else {
      currentCellPrice = CELL_PRICE;
    }
    
    document.querySelectorAll('.booking-type-option').forEach(opt => {
      opt.classList.remove('active');
    });
    e.target.closest('.booking-type-option').classList.add('active');
    
    const businessFields = document.getElementById('businessFields');
    if (businessFields) {
      if (selectedBookingType === 'business') {
        businessFields.classList.remove('hidden');
      } else {
        businessFields.classList.add('hidden');
      }
    }
    
    updatePriceDisplay();
  });
});

// ===== معاينة الصور =====
document.getElementById('selfieInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  const preview = document.getElementById('selfiePreview');
  if (file && preview) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      preview.src = ev.target.result;
      preview.style.display = 'block';
      const img = new Image();
      img.onload = () => {
        previewImage = img;
        previewImageUrl = ev.target.result;
        drawGrid();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }
});

document.getElementById('receiptInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  const preview = document.getElementById('receiptPreview');
  if (file && preview) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      preview.src = ev.target.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  }
});

// ===== إرسال الطلب =====
document.getElementById('submitBooking').addEventListener('click', async () => {
  const btn = document.getElementById('submitBooking');
  const msg = document.getElementById('formMessage');

  if (!document.getElementById('termsCheck').checked) {
    msg.textContent = 'يجب الموافقة على الشروط';
    msg.className = 'form-message error';
    return;
  }

  const selfieFile = document.getElementById('selfieInput').files[0];
  const receiptFile = document.getElementById('receiptInput').files[0];

  if (!selfieFile || !receiptFile) {
    msg.textContent = 'يجب رفع صورة السيلفي والإيصال';
    msg.className = 'form-message error';
    return;
  }

  const isBusiness = selectedBookingType === 'business';
  let brandName = '';
  let ctaButton = '';
  
  if (isBusiness) {
    brandName = document.getElementById('brandNameInput').value.trim();
    ctaButton = document.getElementById('ctaButtonInput').value.trim();
    
    if (!brandName) {
      msg.textContent = 'يجب إدخال اسم العلامة التجارية';
      msg.className = 'form-message error';
      return;
    }
  }

  let startCell, quantity, cols, rows;

  if (selectionStart && selectionEnd) {
    const x1 = Math.min(selectionStart.x, selectionEnd.x);
    const y1 = Math.min(selectionStart.y, selectionEnd.y);
    const x2 = Math.max(selectionStart.x, selectionEnd.x);
    const y2 = Math.max(selectionStart.y, selectionEnd.y);

    if (!isSelectionValid(x1, y1, x2, y2)) {
      msg.textContent = '❌ المنطقة المختارة تحتوي على مربعات محجوزة. اختر منطقة فارغة.';
      msg.className = 'form-message error';
      return;
    }

    startCell = y1 * GRID_SIZE + x1;
    cols = x2 - x1 + 1;
    rows = y2 - y1 + 1;
    quantity = cols * rows;
  } else {
    startCell = parseInt(document.getElementById('bookingModal').dataset.startCell) || 0;
    quantity = 1;
    cols = 1;
    rows = 1;

    const cx = startCell % GRID_SIZE;
    const cy = Math.floor(startCell / GRID_SIZE);
    if (isCellBooked(cx, cy)) {
      msg.textContent = '❌ هذا المربع محجوز بالفعل.';
      msg.className = 'form-message error';
      return;
    }
  }

  if (quantity > MAX_SQUARES) {
    msg.textContent = `الحد الأقصى ${MAX_SQUARES} مربع`;
    msg.className = 'form-message error';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'جاري الإرسال...';
  msg.textContent = 'جاري رفع الصور...';
  msg.className = 'form-message';

  try {
    const selfieUrl = await uploadToImgBB(selfieFile);
    const receiptUrl = await uploadToImgBB(receiptFile);

    const cellIndices = [];
    for (let i = 0; i < quantity; i++) cellIndices.push(startCell + i);

    const unitPrice = isBusiness ? BUSINESS_CELL_PRICE : CELL_PRICE;
    const totalPrice = quantity * unitPrice;

    const bookingData = {
      startCell,
      cellIndices,
      gridShape: { rows, cols },
      quantity,
      totalPrice,
      unitPrice,
      bookingType: isBusiness ? 'business' : 'personal',
      isBusiness: isBusiness,
      brandName: isBusiness ? brandName : '',
      ctaButton: isBusiness ? ctaButton : '',
      paymentMethod: document.getElementById('paymentMethod').value,
      uid: 'guest_' + Date.now(),
      userName: document.getElementById('nameInput').value || (isBusiness ? brandName : 'زائر'),
      userPhone: document.getElementById('phoneInput').value || '',
      userLink: document.getElementById('linkInput').value || '',
      userNote: document.getElementById('noteInput').value || '',
      selfieUrl,
      receiptUrl,
      status: 'pending',
      termsAccepted: true,
      termsAcceptedAt: Timestamp.now(),
      termsVersion: '1.0',
      createdAt: Timestamp.now(),
      timestamp: Date.now(),
      referralCode: getMyReferralCode(),
      referredBy: getReferredBy() || null,
      likes: 0
    };

    await addDoc(collection(db, "bookings"), bookingData);

    msg.textContent = '✅ تم إرسال طلبك بنجاح! سيتم مراجعته قريباً.';
    msg.className = 'form-message success';
    btn.textContent = 'تم الإرسال';
    btn.disabled = true;

    document.getElementById('generateCardBtn').style.display = 'flex';

    const cardData = {
      userName: bookingData.userName,
      startCell: startCell,
      quantity: quantity,
      selfieUrl: selfieUrl,
      referralCode: getMyReferralCode(),
      isBusiness: isBusiness,
      brandName: isBusiness ? brandName : '',
      ctaButton: isBusiness ? ctaButton : ''
    };
    
    setTimeout(() => {
      showShareCard(cardData);
    }, 1500);

    selectionStart = null;
    selectionEnd = null;
    previewImage = null;
    previewImageUrl = null;

    await loadBookings();

    setTimeout(() => {
      document.getElementById('bookingModal').classList.add('hidden');
      document.getElementById('generateCardBtn').style.display = 'none';
      btn.disabled = false;
      btn.textContent = 'إرسال الطلب';
      msg.textContent = '';
      drawGrid();
    }, 3000);

  } catch (error) {
    console.error(error);
    msg.textContent = '❌ حدث خطأ. حاول مرة أخرى.';
    msg.className = 'form-message error';
    btn.disabled = false;
    btn.textContent = 'إرسال الطلب';
  }
});

// ===== زر توليد البطاقة =====
document.getElementById('generateCardBtn').addEventListener('click', async () => {
  const selfiePreview = document.getElementById('selfiePreview');
  const startCell = parseInt(document.getElementById('bookingModal').dataset.startCell) || 0;
  const quantity = parseInt(document.getElementById('quantityInput').value) || 1;
  const userName = document.getElementById('nameInput').value || 'زائر';
  const isBusiness = selectedBookingType === 'business';
  
  if (!selfiePreview.src || selfiePreview.src.startsWith('data:image/svg')) {
    alert('يجب رفع صورة أولاً');
    return;
  }
  
  await showShareCard({
    userName,
    startCell,
    quantity,
    selfieUrl: selfiePreview.src,
    referralCode: getMyReferralCode(),
    isBusiness,
    brandName: isBusiness ? document.getElementById('brandNameInput').value : '',
    ctaButton: isBusiness ? document.getElementById('ctaButtonInput').value : ''
  });
});

// ===== رفع الصور على ImgBB =====
async function uploadToImgBB(file) {
  let processedFile;
  try {
    processedFile = await convertToJPG(file);
  } catch (error) {
    console.error('فشل تحويل الصورة:', error);
    processedFile = file;
  }

  const formData = new FormData();
  formData.append('image', processedFile);

  const response = await fetch('https://api.imgbb.com/1/upload?key=b2d98272187f15bc84d99356a2936fc6', {
    method: 'POST',
    body: formData
  });

  const data = await response.json();
  if (!data.success) throw new Error('فشل رفع الصورة');
  return data.data.url;
}

// ===== أزرار التحكم =====
document.getElementById('zoomIn').addEventListener('click', () => {
  CELL_PIXEL_SIZE = Math.min(CELL_PIXEL_SIZE + ZOOM_STEP, 200);
  drawGrid();
});

document.getElementById('zoomOut').addEventListener('click', () => {
  CELL_PIXEL_SIZE = Math.max(CELL_PIXEL_SIZE - ZOOM_STEP, 10);
  drawGrid();
});

document.getElementById('selectModeBtn').addEventListener('click', function() {
  const seen = localStorage.getItem('onboarding_seen');
  if (!seen && !selectionMode) {
    document.getElementById('onboardingModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  toggleSelectionMode();
});

// ============================================
// ===== نظام بطاقة المشاركة الرقمية =====
// ============================================

let generatedCardBlob = null;
let generatedCardDataURL = null;

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function drawCornerDecorations(ctx, WIDTH, HEIGHT) {
  const size = 80;
  const margin = 30;

  ctx.strokeStyle = '#f5b301';
  ctx.lineWidth = 6;

  ctx.beginPath();
  ctx.moveTo(margin + size, margin + 10);
  ctx.lineTo(margin + 10, margin + 10);
  ctx.lineTo(margin + 10, margin + size);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(WIDTH - margin - size, margin + 10);
  ctx.lineTo(WIDTH - margin - 10, margin + 10);
  ctx.lineTo(WIDTH - margin - 10, margin + size);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(margin + size, HEIGHT - margin - 10);
  ctx.lineTo(margin + 10, HEIGHT - margin - 10);
  ctx.lineTo(margin + 10, HEIGHT - margin - size);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(WIDTH - margin - size, HEIGHT - margin - 10);
  ctx.lineTo(WIDTH - margin - 10, HEIGHT - margin - 10);
  ctx.lineTo(WIDTH - margin - 10, HEIGHT - margin - size);
  ctx.stroke();
}

async function generateQRCode(ctx, text, x, y, size) {
  return new Promise((resolve) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&bgcolor=ffffff&color=0a0a0f&margin=0`;

    const qrImg = new Image();
    qrImg.crossOrigin = 'anonymous';
    
    qrImg.onload = () => {
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, x - 10, y - 10, size + 20, size + 20, 15);
      ctx.fill();
      
      ctx.drawImage(qrImg, x, y, size, size);
      resolve();
    };
    
    qrImg.onerror = () => {
      ctx.fillStyle = '#2a2a35';
      roundRect(ctx, x, y, size, size, 10);
      ctx.fill();
      resolve();
    };
    
    qrImg.src = qrUrl;
  });
}

async function generateShareCard(bookingData) {
  return new Promise(async (resolve, reject) => {
    try {
      const WIDTH = 1080;
      const HEIGHT = 1920;
      const isBusiness = bookingData.isBusiness === true;

      const cardCanvas = document.createElement('canvas');
      cardCanvas.width = WIDTH;
      cardCanvas.height = HEIGHT;
      const ctx2 = cardCanvas.getContext('2d');

      const bgGradient = ctx2.createLinearGradient(0, 0, 0, HEIGHT);
      bgGradient.addColorStop(0, '#0a0a0f');
      bgGradient.addColorStop(0.5, '#14141c');
      bgGradient.addColorStop(1, '#0a0a0f');
      ctx2.fillStyle = bgGradient;
      ctx2.fillRect(0, 0, WIDTH, HEIGHT);

      if (isBusiness) {
        ctx2.shadowColor = '#f5b301';
        ctx2.shadowBlur = 40;
        ctx2.strokeStyle = '#f5b301';
        ctx2.lineWidth = 10;
        ctx2.strokeRect(20, 20, WIDTH - 40, HEIGHT - 40);
        ctx2.shadowBlur = 0;
      }

      ctx2.strokeStyle = '#d4a017';
      ctx2.lineWidth = 8;
      ctx2.strokeRect(30, 30, WIDTH - 60, HEIGHT - 60);

      ctx2.strokeStyle = '#f5b301';
      ctx2.lineWidth = 2;
      ctx2.strokeRect(50, 50, WIDTH - 100, HEIGHT - 100);

      drawCornerDecorations(ctx2, WIDTH, HEIGHT);

      ctx2.textAlign = 'center';
      ctx2.direction = 'rtl';

      ctx2.font = 'bold 80px Cairo, sans-serif';
      ctx2.fillStyle = '#f5b301';
      ctx2.fillText(isBusiness ? '🏢' : '🎨', WIDTH / 2, 180);

      ctx2.font = 'bold 52px Cairo, sans-serif';
      ctx2.fillStyle = '#d4a017';
      ctx2.fillText('جدارية مليون صورة سيلفي', WIDTH / 2, 260);

      ctx2.font = 'bold 28px Cairo, sans-serif';
      ctx2.fillStyle = '#a0a0b0';
      ctx2.fillText('Million Selfies Wall', WIDTH / 2, 310);

      if (isBusiness) {
        ctx2.font = 'bold 24px Cairo, sans-serif';
        const badgeText = '🏢 حساب تجاري معتمد';
        const badgeWidth = ctx2.measureText(badgeText).width + 40;
        const badgeX = (WIDTH - badgeWidth) / 2;
        
        ctx2.fillStyle = '#f5b301';
        roundRect(ctx2, badgeX, 330, badgeWidth, 44, 22);
        ctx2.fill();
        
        ctx2.fillStyle = '#0a0a0f';
        ctx2.fillText(badgeText, WIDTH / 2, 362);
      }

      ctx2.strokeStyle = '#d4a017';
      ctx2.lineWidth = 2;
      ctx2.beginPath();
      ctx2.moveTo(200, isBusiness ? 400 : 350);
      ctx2.lineTo(WIDTH - 200, isBusiness ? 400 : 350);
      ctx2.stroke();

      const photoSize = 500;
      const photoX = (WIDTH - photoSize) / 2;
      const photoY = isBusiness ? 470 : 420;

      ctx2.fillStyle = '#d4a017';
      roundRect(ctx2, photoX - 15, photoY - 15, photoSize + 30, photoSize + 30, 30);
      ctx2.fill();

      ctx2.shadowColor = '#f5b301';
      ctx2.shadowBlur = 40;
      ctx2.fillStyle = '#f5b301';
      roundRect(ctx2, photoX - 10, photoY - 10, photoSize + 20, photoSize + 20, 25);
      ctx2.fill();
      ctx2.shadowBlur = 0;

      if (bookingData.selfieUrl) {
        try {
          const img = await loadImage(bookingData.selfieUrl);
          const size = Math.min(img.width, img.height);
          const sx = (img.width - size) / 2;
          const sy = (img.height - size) / 2;

          ctx2.save();
          roundRect(ctx2, photoX, photoY, photoSize, photoSize, 20);
          ctx2.clip();
          ctx2.drawImage(img, sx, sy, size, size, photoX, photoY, photoSize, photoSize);
          ctx2.restore();
        } catch (error) {
          console.error('فشل تحميل صورة السيلفي:', error);
          ctx2.fillStyle = '#2a2a35';
          roundRect(ctx2, photoX, photoY, photoSize, photoSize, 20);
          ctx2.fill();
        }
      }

      ctx2.font = 'bold 60px Cairo, sans-serif';
      ctx2.fillStyle = '#f5b301';
      
      const titleY = isBusiness ? 1100 : 1050;
      if (isBusiness) {
        ctx2.fillText('علامة تجارية على', WIDTH / 2, titleY);
        ctx2.fillText('الجدارية الأكبر! 🏢', WIDTH / 2, titleY + 80);
      } else {
        ctx2.fillText('أنا الآن جزء من', WIDTH / 2, titleY);
        ctx2.fillText('التاريخ الرقمي! 🚀', WIDTH / 2, titleY + 80);
      }

      const dataY = isBusiness ? 1300 : 1250;
      const dataBoxWidth = 700;
      const dataBoxX = (WIDTH - dataBoxWidth) / 2;

      ctx2.fillStyle = 'rgba(42, 42, 53, 0.8)';
      roundRect(ctx2, dataBoxX, dataY, dataBoxWidth, 260, 20);
      ctx2.fill();

      ctx2.strokeStyle = '#d4a017';
      ctx2.lineWidth = 2;
      roundRect(ctx2, dataBoxX, dataY, dataBoxWidth, 260, 20);
      ctx2.stroke();

      ctx2.font = 'bold 32px Cairo, sans-serif';
      ctx2.fillStyle = '#a0a0b0';
      ctx2.fillText(isBusiness ? 'اسم العلامة التجارية' : 'الاسم', WIDTH / 2, dataY + 55);

      ctx2.font = 'bold 42px Cairo, sans-serif';
      ctx2.fillStyle = '#ffffff';
      const displayName = isBusiness 
        ? (bookingData.brandName || bookingData.userName || 'شركة')
        : (bookingData.userName || 'زائر');
      ctx2.fillText(displayName, WIDTH / 2, dataY + 110);

      ctx2.font = 'bold 28px Cairo, sans-serif';
      ctx2.fillStyle = '#a0a0b0';
      ctx2.fillText(`📍 المربع رقم: ${bookingData.startCell}`, WIDTH / 2 - 150, dataY + 170);
      ctx2.fillText(`📐 ${bookingData.quantity} مربع`, WIDTH / 2 + 150, dataY + 170);

      if (bookingData.referralCode) {
        ctx2.font = 'bold 22px Cairo, sans-serif';
        ctx2.fillStyle = '#f5b301';
        ctx2.fillText(`🎁 رمز الإحالة: ${bookingData.referralCode}`, WIDTH / 2, dataY + 225);
      }

      const qrSize = 200;
      const qrX = (WIDTH - qrSize) / 2;
      const qrY = isBusiness ? 1610 : 1560;

      const userLink = window.location.origin + window.location.pathname + '?cell=' + bookingData.startCell;

      await generateQRCode(ctx2, userLink, qrX, qrY, qrSize);

      ctx2.font = 'bold 24px Cairo, sans-serif';
      ctx2.fillStyle = '#a0a0b0';
      ctx2.fillText('امسح الرمز لزيارة الصفحة', WIDTH / 2, qrY + qrSize + 40);

      const ctaY = HEIGHT - 100;

      ctx2.font = 'bold 36px Cairo, sans-serif';
      ctx2.fillStyle = '#d4a017';
      
      if (isBusiness) {
        ctx2.fillText('انضم كشركة بـ 5$ فقط!', WIDTH / 2, ctaY);
      } else {
        ctx2.fillText('احجز مربعك الآن بـ 1$ فقط!', WIDTH / 2, ctaY);
      }

      ctx2.font = 'bold 22px Cairo, sans-serif';
      ctx2.fillStyle = '#a0a0b0';
      ctx2.fillText('hossinmansourh-jpg.github.io/V2-million-selfies', WIDTH / 2, ctaY + 45);

      generatedCardDataURL = cardCanvas.toDataURL('image/png', 1.0);
      
      cardCanvas.toBlob((blob) => {
        generatedCardBlob = blob;
        resolve(generatedCardDataURL);
      }, 'image/png', 1.0);

    } catch (error) {
      console.error('فشل توليد البطاقة:', error);
      reject(error);
    }
  });
}

async function showShareCard(bookingData) {
  try {
    document.querySelectorAll('.modal').forEach(m => {
      if (!m.classList.contains('hidden')) {
        m.classList.add('hidden');
      }
    });
    
    const modal = document.getElementById('shareCardModal');
    const preview = document.getElementById('shareCardPreview');
    
    preview.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="533"><rect fill="%2314141c" width="300" height="533"/><text x="150" y="266" fill="%23f5b301" text-anchor="middle" font-size="20" font-family="Cairo">⏳ جاري توليد البطاقة...</text></svg>';
    modal.classList.add('active');
    
    document.body.style.overflow = 'hidden';

    const dataURL = await generateShareCard(bookingData);
    preview.src = dataURL;

  } catch (error) {
    console.error('فشل عرض البطاقة:', error);
    alert('حدث خطأ أثناء توليد البطاقة');
  }
}

function closeShareCard() {
  document.getElementById('shareCardModal').classList.remove('active');
  
  document.body.style.overflow = '';
  
  const onboardingModal = document.getElementById('onboardingModal');
  if (onboardingModal && !onboardingModal.classList.contains('hidden')) {
    onboardingModal.classList.add('hidden');
    localStorage.setItem('onboarding_seen', 'true');
  }
  
  const bookingModal = document.getElementById('bookingModal');
  if (bookingModal && !bookingModal.classList.contains('hidden')) {
    bookingModal.classList.add('hidden');
    document.getElementById('generateCardBtn').style.display = 'none';
  }
}
window.closeShareCard = closeShareCard;

function downloadShareCard() {
  if (!generatedCardDataURL) {
    alert('البطاقة غير جاهزة بعد');
    return;
  }

  const link = document.createElement('a');
  link.download = `million-selfies-card-${Date.now()}.png`;
  link.href = generatedCardDataURL;
  link.click();

  const currentLang = localStorage.getItem('lang') || 'ar';
  showToast(currentLang === 'ar' 
    ? '✅ تم تنزيل البطاقة!' 
    : '✅ Card downloaded!');
}
window.downloadShareCard = downloadShareCard;

async function shareCard() {
  if (!generatedCardBlob) {
    alert('البطاقة غير جاهزة بعد');
    return;
  }

  const currentLang = localStorage.getItem('lang') || 'ar';
  const shareText = currentLang === 'ar'
    ? '🎨 أنا الآن جزء من جدارية مليون صورة سيلفي! احجز مربعك الآن بـ 1$ فقط 🚀'
    : '🎨 I\'m now part of the Million Selfies Wall! Book your square now for $1 🚀';

  const shareUrl = window.location.origin + window.location.pathname;
  const shareFile = new File([generatedCardBlob], 'million-selfies-card.png', { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [shareFile] })) {
    try {
      await navigator.share({
        files: [shareFile],
        title: currentLang === 'ar' ? 'جدارية مليون صورة سيلفي' : 'Million Selfies Wall',
        text: shareText,
        url: shareUrl
      });
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('فشل المشاركة:', error);
        fallbackShare(shareUrl, shareText);
      }
    }
  } else {
    fallbackShare(shareUrl, shareText);
  }
}
window.shareCard = shareCard;

function fallbackShare(url, text) {
  const currentLang = localStorage.getItem('lang') || 'ar';
  
  if (navigator.share) {
    navigator.share({
      title: currentLang === 'ar' ? 'جدارية مليون صورة سيلفي' : 'Million Selfies Wall',
      text: text,
      url: url
    }).catch(() => {
      navigator.clipboard.writeText(`${text}\n${url}`);
      showToast(currentLang === 'ar' ? '✅ تم نسخ الرابط!' : '✅ Link copied!');
    });
  } else {
    navigator.clipboard.writeText(`${text}\n${url}`);
    showToast(currentLang === 'ar' ? '✅ تم نسخ الرابط!' : '✅ Link copied!');
  }
}

// ===== حماية حقل عدد المربعات =====
(function protectQuantityInput() {
  const protect = () => {
    const qtyInput = document.getElementById('quantityInput');
    if (!qtyInput) return;

    qtyInput.readOnly = true;
    qtyInput.style.background = '#1a1a22';
    qtyInput.style.cursor = 'not-allowed';
    qtyInput.style.color = '#f5b301';
    qtyInput.style.fontWeight = 'bold';
    qtyInput.title = 'يتم تحديد العدد تلقائياً من الشبكة';

    qtyInput.addEventListener('paste', e => e.preventDefault());
    qtyInput.addEventListener('drop', e => e.preventDefault());
    qtyInput.addEventListener('keydown', e => {
      const allowed = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
                       'Tab', 'Home', 'End', 'Escape', 'Enter'];
      if (!allowed.includes(e.key) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
      }
    });
  };

  protect();

  const observer = new MutationObserver(protect);
  const modal = document.getElementById('bookingModal');
  if (modal) {
    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }
})();

// ===== الترجمات =====
const translations = {
  ar: {
    badge: '🚀 تحدي رقمي تاريخي',
    heroTitle: 'جدارية مليون\nصورة سيلفي',
    heroSubtitle: 'كن جزءاً من أكبر لوحة رقمية تفاعلية في العالم. احجز مربعك واترك بصمتك للأبد.',
    priceNote: 'كل مربع 10×10 بكسل بـ دولار واحد فقط.',
    statBooked: 'مربعات محجوزة',
    statAvailable: 'مربعات متبقية',
    statSelfies: 'صورة سيلفي',
    progressLabel: 'نسبة الحجز',
    wallTitle: 'لوحة الجدارية التفاعلية',
    legendEmpty: 'مربع فارغ',
    legendBooked: 'محجوز',
    legendPersonal: 'شخصي',
    legendBusiness: 'تجاري',
    legendHint: 'انقر على أي مربع للحجز',
    hint: '💡 مرر داخل الشبكة لاستكشاف المليون مربع',
    hintLink: '🔗 انقر على أي صورة محجوزة للانتقال إلى حساب صاحبها',
    hintLike: '❤️ انقر مرتين على أي صورة لإعجابها',
    hintLongPress: '👇 اضغط ضغطة مطولة على أي صورة لعرض معلومات صاحبها',
    selectModeBtn: '🖱️ تحديد المربعات',
    selectedCount: 'المربعات المختارة: 0',
    bookingTitle: 'حجز المربعات',
    bookingTypeLabel: 'نوع الحجز',
    bookingTypePersonal: 'حجز شخصي',
    bookingTypeBusiness: 'حجز تجاري / شركات',
    brandNameLabel: 'اسم العلامة التجارية / الشركة',
    brandNamePlaceholder: 'مثال: مطعم الشام',
    ctaButtonLabel: 'نص زر الدعوة للاتخاذ إجراء',
    ctaButtonPlaceholder: 'اتصل بنا / تصفح المتجر',
    ctaButtonNote: '📌 سيظهر هذا النص كزر على مربعك في الجدارية',
    quantityLabel: 'عدد المربعات (1-400)',
    nameLabel: 'الاسم',
    phoneLabel: 'رقم الهاتف (اختياري)',
    linkLabel: 'رابط حسابك (اختياري)',
    linkNote: '📌 سيتمكن الزوار من النقر على صورتك للانتقال إلى حسابك',
    noteLabel: 'ملاحظة (اختياري)',
    selfieLabel: 'صورة السيلفي / شعار الشركة',
    receiptLabel: 'إيصال الدفع',
    paymentLabel: 'طريقة الدفع',
    termsTitle: '📋 الشروط والأحكام',
    term1: '• يجب أن تكون الصورة سيلفي شخصية وحقيقية (أو شعار رسمي للشركة).',
    term2: '• يُمنع رفع صور مخالفة للقوانين أو الآداب العامة.',
    term3: '• في حال رفض الصورة من قبل الإدارة، يمكنك التواصل معنا لاسترجاع المبلغ كاملاً.',
    term4: '• مدة معالجة الطلب: 24-48 ساعة.',
    termsLabel: 'أوافق على الشروط والأحكام',
    refundNotice: '💡 في حال رفض الصورة، يرجى التواصل معنا عبر واتساب أو تيليجرام لاسترجاع المال.',
    totalLabel: 'الإجمالي:',
    submitBtn: 'إرسال الطلب',
    contactUs: 'تواصل معنا',
    howTitle: '🎯 كيف يعمل الموقع؟',
    howStep1Title: 'اختر مربعك',
    howStep1Desc: 'اضغط على "تحديد المربعات" واسحب لتحديد منطقتك',
    howStep2Title: 'ارفع صورتك',
    howStep2Desc: 'ارفع صورة سيلفي واضحة وأضف رابط حسابك (اختياري)',
    howStep3Title: 'ادفع بـ 1$',
    howStep3Desc: 'ادفع عبر شام كاش أو USDT وارفع الإيصال',
    guideTitle: '🎮 كيف تتفاعل مع الصور؟',
    guideClickTitle: 'انقر مرة واحدة',
    guideClickDesc: 'انقر على أي صورة محجوزة للانتقال إلى حساب صاحبها (إذا كان الرابط موجوداً)',
    guideLikeTitle: 'انقر مرتين للإعجاب',
    guideLikeDesc: 'انقر مرتين (Double Click) على أي صورة لإعجابها. ستظهر عدد الإعجابات على الصورة',
    guideLongPressTitle: 'اضغط ضغطة مطولة',
    guideLongPressDesc: 'اضغط ضغطة مطولة (Long Press) على أي صورة لعرض معلومات صاحبها بشكل احترافي',
    referralText: '🎁 ادعُ 10 من أصدقائك واحصل على مربع مجاني!',
    referralBtn: '📋 نسخ رابط الإحالة',
    leaderboardTitle: '🏆 لوحة الصدارة',
    lbRecent: '📸 آخر الحجوزات',
    lbStats: '📊 إحصائيات حية',
    lbTopLiked: '❤️ الأكثر إعجاباً',
    onboardingTitle: '📌 كيف تحجز؟',
    onboardingStep1: 'اضغط واسحب لتحديد المربعات التي تريدها',
    onboardingStep2: 'اضغط على "✅ إنهاء التحديد" لفتح نموذج الحجز',
    onboardingStep3: 'ارفع صورتك، املأ البيانات، وادفع',
    onboardingBtn: 'فهمت، لنبدأ!',
    generateCard: 'توليد بطاقة الإنجاز',
    shareCardTitle: '🎉 مبروك! بطاقتك جاهزة',
    shareCardSubtitle: 'شاركها مع أصدقائك على إنستغرام وتيك توك',
    downloadCard: 'تنزيل بطاقة الإنجاز',
    shareNow: 'مشاركة مباشرة',
    closeBtn: 'إغلاق'
  },
  en: {
    badge: '🚀 Historic Digital Challenge',
    heroTitle: 'Million Selfies\nWall',
    heroSubtitle: 'Be part of the largest interactive digital wall in the world. Book your square and leave your mark forever.',
    priceNote: 'Each 10×10 pixel square for just $1.',
    statBooked: 'Booked Squares',
    statAvailable: 'Available Squares',
    statSelfies: 'Selfies',
    progressLabel: 'Booking Progress',
    wallTitle: 'Interactive Wall',
    legendEmpty: 'Empty',
    legendBooked: 'Booked',
    legendPersonal: 'Personal',
    legendBusiness: 'Business',
    legendHint: 'Click any square to book',
    hint: '💡 Scroll inside the grid to explore the million squares',
    hintLink: '🔗 Click any booked photo to visit the owner\'s account',
    hintLike: '❤️ Double-click any photo to like it',
    hintLongPress: '👇 Long-press any photo to see the owner\'s info',
    selectModeBtn: '🖱️ Select Squares',
    selectedCount: 'Selected squares: 0',
    bookingTitle: 'Book Squares',
    bookingTypeLabel: 'Booking Type',
    bookingTypePersonal: 'Personal Booking',
    bookingTypeBusiness: 'Business / Company',
    brandNameLabel: 'Brand / Company Name',
    brandNamePlaceholder: 'e.g., Al-Sham Restaurant',
    ctaButtonLabel: 'Call-to-Action Button Text',
    ctaButtonPlaceholder: 'Contact Us / Visit Store',
    ctaButtonNote: '📌 This text will appear as a button on your square',
    quantityLabel: 'Number of Squares (1-400)',
    nameLabel: 'Name',
    phoneLabel: 'Phone (optional)',
    linkLabel: 'Your Profile Link (optional)',
    linkNote: '📌 Visitors can click your photo to visit your account',
    noteLabel: 'Note (optional)',
    selfieLabel: 'Selfie / Company Logo',
    receiptLabel: 'Payment Receipt',
    paymentLabel: 'Payment Method',
    termsTitle: '📋 Terms & Conditions',
    term1: '• Image must be a real personal selfie (or official company logo).',
    term2: '• Images violating laws or public morals are prohibited.',
    term3: '• If your image is rejected, contact us for a full refund.',
    term4: '• Processing time: 24-48 hours.',
    termsLabel: 'I agree to the Terms & Conditions',
    refundNotice: '💡 If your image is rejected, please contact us via WhatsApp or Telegram for a refund.',
    totalLabel: 'Total:',
    submitBtn: 'Submit Request',
    contactUs: 'Contact Us',
    howTitle: '🎯 How It Works?',
    howStep1Title: 'Choose Your Square',
    howStep1Desc: 'Click "Select Squares" and drag to select your area',
    howStep2Title: 'Upload Your Photo',
    howStep2Desc: 'Upload a clear selfie and add your profile link (optional)',
    howStep3Title: 'Pay $1',
    howStep3Desc: 'Pay via Sham Cash or USDT and upload the receipt',
    guideTitle: '🎮 How to Interact with Photos?',
    guideClickTitle: 'Click Once',
    guideClickDesc: 'Click any booked photo to visit the owner\'s account (if link exists)',
    guideLikeTitle: 'Double-Click to Like',
    guideLikeDesc: 'Double-click any photo to like it. The like count will appear on the photo',
    guideLongPressTitle: 'Long Press',
    guideLongPressDesc: 'Long-press any photo to see the owner\'s info professionally',
    referralText: '🎁 Invite 10 friends and get a free square!',
    referralBtn: '📋 Copy Referral Link',
    leaderboardTitle: '🏆 Leaderboard',
    lbRecent: '📸 Recent Bookings',
    lbStats: '📊 Live Stats',
    lbTopLiked: '❤️ Most Liked',
    onboardingTitle: '📌 How to Book?',
    onboardingStep1: 'Click and drag to select the squares you want',
    onboardingStep2: 'Click "✅ Finish Selection" to open the booking form',
    onboardingStep3: 'Upload your photo, fill the form, and pay',
    onboardingBtn: 'Got it, let\'s start!',
    generateCard: 'Generate Achievement Card',
    shareCardTitle: '🎉 Congratulations! Your card is ready',
    shareCardSubtitle: 'Share it with your friends on Instagram and TikTok',
    downloadCard: 'Download Achievement Card',
    shareNow: 'Share Now',
    closeBtn: 'Close'
  }
};

function applyLanguage(lang) {
  const t = translations[lang];
  if (!t) return;
  
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key]) {
      if (t[key].includes('\n')) {
        el.innerHTML = t[key].replace(/\n/g, '<br>');
      } else {
        el.textContent = t[key];
      }
    }
  });
  
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (t[key]) {
      el.placeholder = t[key];
    }
  });
  
  if (selectionStart && selectionEnd) {
    updateSelectedCount();
  }
  
  const btn = document.getElementById('selectModeBtn');
  if (btn) {
    if (selectionMode) {
      btn.textContent = lang === 'ar' ? '✅ إنهاء التحديد' : '✅ Finish Selection';
    } else {
      btn.textContent = lang === 'ar' ? '🖱️ تحديد المربعات' : '🖱️ Select Squares';
    }
  }
  
  updateStats();
  updateLeaderboard();
}

function setLanguage(lang) {
  const html = document.documentElement;
  html.lang = lang;
  html.dir = lang === 'ar' ? 'rtl' : 'ltr';
  
  const arBtn = document.getElementById('langAr');
  const enBtn = document.getElementById('langEn');
  
  if (arBtn) arBtn.classList.toggle('active', lang === 'ar');
  if (enBtn) enBtn.classList.toggle('active', lang === 'en');
  
  applyLanguage(lang);
  localStorage.setItem('lang', lang);
  drawGrid();
}

document.getElementById('langAr').addEventListener('click', () => setLanguage('ar'));
document.getElementById('langEn').addEventListener('click', () => setLanguage('en'));

const savedLang = localStorage.getItem('lang') || 'ar';
setLanguage(savedLang);

async function trackVisit() {
  const lastVisit = localStorage.getItem('last_visit_time');
  const now = Date.now();
  const thirtyMinutes = 30 * 60 * 1000;

  if (!lastVisit || (now - parseInt(lastVisit)) > thirtyMinutes) {
    try {
      await addDoc(collection(db, "visits"), {
        timestamp: now,
        date: new Date().toISOString().split('T')[0],
        userAgent: navigator.userAgent,
        language: navigator.language,
        screen: `${screen.width}x${screen.height}`,
        referrer: document.referrer || 'direct'
      });
      localStorage.setItem('last_visit_time', now.toString());
    } catch (error) {
      console.error('خطأ في تسجيل الزيارة:', error);
    }
  }
}

function preloadImages() {
  allBookings.filter(b => b.status === 'approved').slice(0, 20).forEach(booking => {
    if (booking.selfieUrl && !imageCache[booking.id]) {
      loadBookingImage(booking);
    }
  });
}

// ===== التشغيل (محسّن) =====
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resizeCanvas, 200);
});

resizeCanvas();
loadBookings();
trackVisit();

// ✅ تحميل كل 60 ثانية
setInterval(loadBookings, 60000);

// ✅ تحميل الصور بعد 2 ثانية
setTimeout(preloadImages, 2000);

// ✅ حلقة الرسم النابض
let pulseInterval = null;
function startPulseAnimation() {
  if (pulseInterval) return;
  pulseInterval = setInterval(() => {
    const hasPending = approvedBookings.some(b => b.status === 'pending');
    if (hasPending && !isDragging && !inertiaFrame && !isSelecting) {
      drawGrid();
    } else if (!hasPending) {
      clearInterval(pulseInterval);
      pulseInterval = null;
    }
  }, 600);
}

setTimeout(startPulseAnimation, 3000);

// ✅ إيقاف الرسم عند مغادرة الصفحة
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (pulseInterval) {
      clearInterval(pulseInterval);
      pulseInterval = null;
    }
  } else {
    startPulseAnimation();
  }
});

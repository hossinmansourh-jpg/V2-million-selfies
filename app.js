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
let CELL_PIXEL_SIZE = 50;

// ===== Canvas =====
const canvas = document.getElementById('gridCanvas');
const ctx = canvas.getContext('2d');

let offsetX = 0;
let offsetY = 0;

let allBookings = [];
let approvedBookings = [];
let hoveredCell = null;
let selectedQuantity = 1;
let imageCache = {};

// متغيرات التحديد
let selectionStart = null;
let selectionEnd = null;
let isSelecting = false;
let selectionMode = false;

// متغيرات المعاينة
let previewImage = null;
let previewImageUrl = null;

// متغيرات حفظ التحديد
let savedSelectionStart = null;
let savedSelectionEnd = null;
let savedStartCell = 0;
let savedQuantity = 1;
let savedCols = 1;
let savedRows = 1;

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
      ? '✅ تم نسخ رابط الإحالة! شاركه مع 5 من أصدقائك.' 
      : '✅ Referral link copied! Share it with 5 friends.');
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

// ===== إعداد Canvas =====
function resizeCanvas() {
  const container = canvas.parentElement;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  drawGrid();
}

// ===== رسم الشبكة =====
function drawGrid() {
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const startX = Math.floor(offsetX / CELL_PIXEL_SIZE);
  const startY = Math.floor(offsetY / CELL_PIXEL_SIZE);
  const endX = startX + Math.ceil(canvas.width / CELL_PIXEL_SIZE) + 1;
  const endY = startY + Math.ceil(canvas.height / CELL_PIXEL_SIZE) + 1;

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) continue;
      const px = x * CELL_PIXEL_SIZE - offsetX;
      const py = y * CELL_PIXEL_SIZE - offsetY;
      ctx.strokeStyle = '#2a2a35';
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, CELL_PIXEL_SIZE, CELL_PIXEL_SIZE);
    }
  }

  drawBookings();

  // رسم منطقة التحديد
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

  // معاينة الصورة
  if (previewImage && hoveredCell && selectionStart && selectionEnd) {
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
    ctx.globalAlpha = 0.7;
    ctx.drawImage(previewImage, px, py, width, height);
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.strokeStyle = '#f5b301';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.strokeRect(px + 1, py + 1, width - 2, height - 2);
    ctx.setLineDash([]);
  }

  // مؤشر الخلية
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

// ===== رسم الحجوزات =====
function drawBookings() {
  approvedBookings.forEach(booking => {
    const startX = (booking.startCell % GRID_SIZE) * CELL_PIXEL_SIZE - offsetX;
    const startY = Math.floor(booking.startCell / GRID_SIZE) * CELL_PIXEL_SIZE - offsetY;
    const width = booking.gridShape.cols * CELL_PIXEL_SIZE;
    const height = booking.gridShape.rows * CELL_PIXEL_SIZE;

    if (startX + width < 0 || startX > canvas.width || startY + height < 0 || startY > canvas.height) return;

    ctx.fillStyle = 'rgba(212, 160, 23, 0.3)';
    ctx.fillRect(startX, startY, width, height);
    ctx.strokeStyle = '#d4a017';
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, startY, width, height);

    if (booking.selfieUrl) {
      if (imageCache[booking.id] && imageCache[booking.id].complete) {
        ctx.drawImage(imageCache[booking.id], startX, startY, width, height);
      } else if (!imageCache[booking.id]) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          imageCache[booking.id] = img;
          drawGrid();
        };
        img.onerror = () => {
          console.error('فشل تحميل الصورة:', booking.selfieUrl);
        };
        imageCache[booking.id] = img;
        img.src = booking.selfieUrl;
      }
    }

    if (booking.likes && booking.likes > 0 && width > 60 && height > 60) {
      const liked = hasLiked(booking.id);
      const badgeX = startX + width - 40;
      const badgeY = startY + height - 26;
      
      ctx.fillStyle = liked ? 'rgba(255, 51, 102, 0.9)' : 'rgba(0, 0, 0, 0.75)';
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, 36, 22, 11);
      ctx.fill();
      
      ctx.fillStyle = liked ? '#fff' : '#f5b301';
      ctx.font = 'bold 12px Cairo, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`❤️${booking.likes}`, badgeX + 18, badgeY + 11);
      ctx.textBaseline = 'alphabetic';
    }
  });
}

// ===== التحقق من حجز المربع =====
function isCellBooked(cellX, cellY) {
  return allBookings.some(b => {
    if (b.status !== 'approved' && b.status !== 'pending') return false;
    const startX = b.startCell % GRID_SIZE;
    const startY = Math.floor(b.startCell / GRID_SIZE);
    const endX = startX + b.gridShape.cols - 1;
    const endY = startY + b.gridShape.rows - 1;
    return cellX >= startX && cellX <= endX && cellY >= startY && cellY <= endY;
  });
}

// ===== التحقق من صحة التحديد =====
function isSelectionValid(x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      if (isCellBooked(x, y)) return false;
    }
  }
  return true;
}

// ===== تحميل الحجوزات =====
async function loadBookings() {
  try {
    const snapshot = await getDocs(collection(db, "bookings"));
    const allDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    allBookings = allDocs.filter(b => b.status === 'pending' || b.status === 'approved');
    approvedBookings = allBookings.filter(b => b.status === 'approved');
    allBookings.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    updateStats();
    drawGrid();
    await updateLeaderboard();
  } catch (error) {
    console.error("خطأ في تحميل الحجوزات:", error);
  }
}

// ===== تحديث الإحصائيات =====
function updateStats() {
  const bookedCells = approvedBookings.reduce((sum, b) => sum + (b.quantity || 0), 0);
  const availableCells = TOTAL_CELLS - bookedCells;
  const selfiesCount = approvedBookings.length;
  const progress = ((bookedCells / TOTAL_CELLS) * 100).toFixed(2);

  document.getElementById('statBooked').textContent = bookedCells.toLocaleString('en-US');
  document.getElementById('statAvailable').textContent = availableCells.toLocaleString('en-US');
  document.getElementById('statSelfies').textContent = selfiesCount.toLocaleString('en-US');
  document.getElementById('progressFill').style.width = progress + '%';
  document.getElementById('progressText').textContent = progress + '%';
}

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

    // حفظ التحديد
    savedSelectionStart = { ...selectionStart };
    savedSelectionEnd = { ...selectionEnd };
    savedStartCell = startCell;
    savedCols = x2 - x1 + 1;
    savedRows = y2 - y1 + 1;
    savedQuantity = quantity;

    selectionMode = false;
    if (btn) {
      btn.classList.remove('active');
      btn.textContent = currentLang === 'ar' ? '🖱️ تحديد المربعات' : '🖱️ Select Squares';
    }
    canvas.style.cursor = 'crosshair';

    openBookingModal(startCell);
    document.getElementById('quantityInput').value = quantity;
    document.getElementById('totalPrice').textContent = (quantity * CELL_PRICE) + ' $';
    selectedQuantity = quantity;

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
  isSelecting = false;

  canvas.style.cursor = selectionMode ? 'cell' : 'crosshair';
  drawGrid();
}

// ===== نافذة التوجيه =====
function closeOnboarding() {
  document.getElementById('onboardingModal').classList.add('hidden');
  localStorage.setItem('onboarding_seen', 'true');
}
window.closeOnboarding = closeOnboarding;

// ===== زر وضع التحديد =====
document.getElementById('selectModeBtn').addEventListener('click', function() {
  const seen = localStorage.getItem('onboarding_seen');
  if (!seen && !selectionMode) {
    document.getElementById('onboardingModal').classList.remove('hidden');
  }
  toggleSelectionMode();
});

// ===== فتح نافذة الحجز =====
function openBookingModal(startCell) {
  document.getElementById('bookingModal').classList.remove('hidden');
  document.getElementById('bookingModal').dataset.startCell = startCell;
  
  // إذا لم يتم تحديد منطقة، نضع القيم الافتراضية
  if (!savedSelectionStart || !savedSelectionEnd) {
    savedStartCell = startCell;
    savedQuantity = 1;
    savedCols = 1;
    savedRows = 1;
    document.getElementById('quantityInput').value = 1;
    document.getElementById('totalPrice').textContent = '1 $';
    selectedQuantity = 1;
  } else {
    document.getElementById('quantityInput').value = savedQuantity;
    document.getElementById('totalPrice').textContent = (savedQuantity * CELL_PRICE) + ' $';
    selectedQuantity = savedQuantity;
  }
  
  updatePaymentInfo();
}

// ===== إغلاق النافذة =====
document.getElementById('closeModal').addEventListener('click', () => {
  document.getElementById('bookingModal').classList.add('hidden');
  document.getElementById('generateCardBtn').style.display = 'none';
  previewImage = null;
  previewImageUrl = null;
  selectionStart = null;
  selectionEnd = null;
  savedSelectionStart = null;
  savedSelectionEnd = null;
  savedStartCell = 0;
  savedQuantity = 1;
  savedCols = 1;
  savedRows = 1;
  drawGrid();
});

// ===== متغيرات السحب =====
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let hasDragged = false;

let velocityX = 0;
let velocityY = 0;
let inertiaFrame = null;
let lastMoveTime = 0;

function startInertia() {
  if (inertiaFrame) cancelAnimationFrame(inertiaFrame);

  function animate() {
    offsetX += velocityX;
    offsetY += velocityY;
    velocityX *= 0.95;
    velocityY *= 0.95;

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

// ===== التفاعل مع الفأرة =====
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();

  if (selectionMode) {
    if (isSelecting) {
      const x = Math.floor((e.clientX - rect.left + offsetX) / CELL_PIXEL_SIZE);
      const y = Math.floor((e.clientY - rect.top + offsetY) / CELL_PIXEL_SIZE);
      if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
        selectionEnd = { x, y };
        updateSelectedCount();
        drawGrid();
      }
    }
    return;
  }

  if (isDragging) {
    const now = Date.now();
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasDragged = true;
    offsetX -= dx * 1;
    offsetY -= dy * 1;
    const dt = now - lastMoveTime || 16;
    velocityX = -(dx * 1) / dt * 16;
    velocityY = -(dy * 1) / dt * 16;
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
    hoveredCell = { x, y };
    drawGrid();
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
  hoveredCell = null;
  canvas.style.cursor = selectionMode ? 'cell' : 'crosshair';
  drawGrid();
});

// ===== عجلة الفأرة =====
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const oldSize = CELL_PIXEL_SIZE;
  if (e.deltaY < 0) {
    CELL_PIXEL_SIZE = Math.min(CELL_PIXEL_SIZE + 5, 200);
  } else {
    CELL_PIXEL_SIZE = Math.max(CELL_PIXEL_SIZE - 5, 10);
  }
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  offsetX = (offsetX + mouseX) * (CELL_PIXEL_SIZE / oldSize) - mouseX;
  offsetY = (offsetY + mouseY) * (CELL_PIXEL_SIZE / oldSize) - mouseY;
  offsetX = Math.max(0, Math.min(offsetX, GRID_SIZE * CELL_PIXEL_SIZE - canvas.width));
  offsetY = Math.max(0, Math.min(offsetY, GRID_SIZE * CELL_PIXEL_SIZE - canvas.height));
  drawGrid();
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

  // البحث عن صورة محجوزة
  for (const booking of approvedBookings) {
    const startX = (booking.startCell % GRID_SIZE) * CELL_PIXEL_SIZE;
    const startY = Math.floor(booking.startCell / GRID_SIZE) * CELL_PIXEL_SIZE;
    const width = booking.gridShape.cols * CELL_PIXEL_SIZE;
    const height = booking.gridShape.rows * CELL_PIXEL_SIZE;

    if (clickX >= startX && clickX <= startX + width &&
        clickY >= startY && clickY <= startY + height) {
      if (booking.userLink && booking.userLink.trim()) {
        let url = booking.userLink.trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        window.open(url, '_blank', 'noopener');
      } else {
        const currentLang = localStorage.getItem('lang') || 'ar';
        showToast(currentLang === 'ar' 
          ? `📸 صاحب الصورة: ${booking.userName || 'زائر'}` 
          : `📸 Photo owner: ${booking.userName || 'Guest'}`);
      }
      return;
    }
  }

  // فتح نافذة الحجز
  if (selectionMode) return;
  
  if (!hoveredCell) return;
  const startCell = hoveredCell.y * GRID_SIZE + hoveredCell.x;
  
  if (isCellBooked(hoveredCell.x, hoveredCell.y)) {
    const currentLang = localStorage.getItem('lang') || 'ar';
    showToast(currentLang === 'ar' 
      ? '⚠️ هذا المربع محجوز بالفعل' 
      : '⚠️ This square is already booked');
    return;
  }
  
  // فتح النموذج لمربع واحد
  savedSelectionStart = null;
  savedSelectionEnd = null;
  savedStartCell = startCell;
  savedQuantity = 1;
  savedCols = 1;
  savedRows = 1;
  
  openBookingModal(startCell);
}

// ===== معالجة النقرة المزدوجة =====
async function handleDoubleClick(e) {
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left + offsetX;
  const clickY = e.clientY - rect.top + offsetY;

  for (const booking of approvedBookings) {
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

// ===== اللمس =====
let touchStartX = 0;
let touchStartY = 0;
let lastTouchDist = 0;
let longPressTimer = null;

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
    
    longPressTimer = setTimeout(() => {
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
  
  const oldCard = document.getElementById('ownerCard');
  if (oldCard) oldCard.remove();
  
  const card = document.createElement('div');
  card.id = 'ownerCard';
  card.className = 'owner-card';
  card.innerHTML = `
    <div class="owner-card-content">
      <img src="${booking.selfieUrl || ''}" alt="صورة" class="owner-card-img" onerror="this.style.display='none'">
      <div class="owner-card-info">
        <h3>${booking.userName || (currentLang === 'ar' ? 'زائر' : 'Guest')}</h3>
        ${booking.userNote ? `<p class="owner-note">"${booking.userNote}"</p>` : ''}
        <div class="owner-stats">
          <span>📐 ${booking.quantity || 1} ${currentLang === 'ar' ? 'مربع' : 'squares'}</span>
          <span>❤️ ${booking.likes || 0}</span>
        </div>
        ${booking.userLink ? `
          <a href="${booking.userLink.startsWith('http') ? booking.userLink : 'https://' + booking.userLink}" 
             target="_blank" 
             class="owner-link">
            🔗 ${currentLang === 'ar' ? 'زيارة الحساب' : 'Visit Profile'}
          </a>
        ` : ''}
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
      selectionEnd = { x, y };
      updateSelectedCount();
      drawGrid();
    }
    return;
  }

  if (e.touches.length === 1) {
    const now = Date.now();
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    offsetX -= dx * 1;
    offsetY -= dy * 1;
    const dt = now - lastMoveTime || 16;
    velocityX = -(dx * 1) / dt * 16;
    velocityY = -(dy * 1) / dt * 16;
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
      if (dist > lastTouchDist) {
        CELL_PIXEL_SIZE = Math.min(CELL_PIXEL_SIZE + 5, 200);
      } else {
        CELL_PIXEL_SIZE = Math.max(CELL_PIXEL_SIZE - 5, 10);
      }
      offsetX = offsetX * (CELL_PIXEL_SIZE / oldSize);
      offsetY = offsetY * (CELL_PIXEL_SIZE / oldSize);
      drawGrid();
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
      <code style="display:block;word-break:break-all;margin:10px 0;color:#f5b301">TGRAeYyz8off9oiqPVcph5YkZJuVL6Cngy</code>
      <button onclick="navigator.clipboard.writeText('TGRAeYyz8off9oiqPVcph5YkZJuVL6Cngy')" 
              style="padding:8px 16px;background:#d4a017;border:none;border-radius:6px;cursor:pointer">
        📋 نسخ العنوان
      </button>
      <p style="margin-top:10px">ثم ارفع صورة الإيصال</p>
    `;
  }
}

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

  let startCell, quantity, cols, rows;

  if (savedSelectionStart && savedSelectionEnd) {
    // حالة التحديد
    const x1 = Math.min(savedSelectionStart.x, savedSelectionEnd.x);
    const y1 = Math.min(savedSelectionStart.y, savedSelectionEnd.y);
    const x2 = Math.max(savedSelectionStart.x, savedSelectionEnd.x);
    const y2 = Math.max(savedSelectionStart.y, savedSelectionEnd.y);

    if (!isSelectionValid(x1, y1, x2, y2)) {
      msg.textContent = '❌ المنطقة المختارة تحتوي على مربعات محجوزة.';
      msg.className = 'form-message error';
      return;
    }

    startCell = y1 * GRID_SIZE + x1;
    cols = x2 - x1 + 1;
    rows = y2 - y1 + 1;
    quantity = cols * rows;
  } else {
    // حالة المربع الواحد
    startCell = savedStartCell || parseInt(document.getElementById('bookingModal').dataset.startCell) || 0;
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

  if (quantity > 400) {
    msg.textContent = 'الحد الأقصى 400 مربع';
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

    const bookingData = {
      startCell,
      cellIndices,
      gridShape: { rows, cols },
      quantity,
      totalPrice: quantity * CELL_PRICE,
      paymentMethod: document.getElementById('paymentMethod').value,
      uid: 'guest_' + Date.now(),
      userName: document.getElementById('nameInput').value || 'زائر',
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

    // إظهار زر توليد البطاقة
    document.getElementById('generateCardBtn').style.display = 'flex';

    // توليد بطاقة المشاركة تلقائياً
    const cardData = {
      userName: document.getElementById('nameInput').value || 'زائر',
      startCell: startCell,
      quantity: quantity,
      selfieUrl: selfieUrl,
      referralCode: getMyReferralCode()
    };
    
    setTimeout(() => {
      showShareCard(cardData);
    }, 1500);

    previewImage = null;
    previewImageUrl = null;

    await loadBookings();

    setTimeout(() => {
      document.getElementById('bookingModal').classList.add('hidden');
      document.getElementById('generateCardBtn').style.display = 'none';
      btn.disabled = false;
      btn.textContent = 'إرسال الطلب';
      msg.textContent = '';
      savedSelectionStart = null;
      savedSelectionEnd = null;
      savedStartCell = 0;
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
  const startCell = savedStartCell || parseInt(document.getElementById('bookingModal').dataset.startCell) || 0;
  const quantity = savedQuantity || 1;
  const userName = document.getElementById('nameInput').value || 'زائر';
  
  if (!selfiePreview.src || selfiePreview.src.startsWith('data:image/svg')) {
    alert('يجب رفع صورة أولاً');
    return;
  }
  
  await showShareCard({
    userName,
    startCell,
    quantity,
    selfieUrl: selfiePreview.src,
    referralCode: getMyReferralCode()
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
  CELL_PIXEL_SIZE = Math.min(CELL_PIXEL_SIZE + 10, 200);
  drawGrid();
});

document.getElementById('zoomOut').addEventListener('click', () => {
  CELL_PIXEL_SIZE = Math.max(CELL_PIXEL_SIZE - 10, 10);
  drawGrid();
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
      ctx2.fillText('🎨', WIDTH / 2, 180);

      ctx2.font = 'bold 52px Cairo, sans-serif';
      ctx2.fillStyle = '#d4a017';
      ctx2.fillText('جدارية مليون صورة سيلفي', WIDTH / 2, 260);

      ctx2.font = 'bold 28px Cairo, sans-serif';
      ctx2.fillStyle = '#a0a0b0';
      ctx2.fillText('Million Selfies Wall', WIDTH / 2, 310);

      ctx2.strokeStyle = '#d4a017';
      ctx2.lineWidth = 2;
      ctx2.beginPath();
      ctx2.moveTo(200, 350);
      ctx2.lineTo(WIDTH - 200, 350);
      ctx2.stroke();

      const photoSize = 500;
      const photoX = (WIDTH - photoSize) / 2;
      const photoY = 420;

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
      ctx2.fillText('أنا الآن جزء من', WIDTH / 2, 1050);
      ctx2.fillText('التاريخ الرقمي! 🚀', WIDTH / 2, 1130);

      const dataY = 1250;
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
      ctx2.fillText('الاسم', WIDTH / 2, dataY + 55);

      ctx2.font = 'bold 42px Cairo, sans-serif';
      ctx2.fillStyle = '#ffffff';
      ctx2.fillText(bookingData.userName || 'زائر', WIDTH / 2, dataY + 110);

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
      const qrY = 1560;

      const userLink = window.location.origin + window.location.pathname + '?cell=' + bookingData.startCell;

      await generateQRCode(ctx2, userLink, qrX, qrY, qrSize);

      ctx2.font = 'bold 24px Cairo, sans-serif';
      ctx2.fillStyle = '#a0a0b0';
      ctx2.fillText('امسح الرمز لزيارة صورتي', WIDTH / 2, qrY + qrSize + 40);

      const ctaY = HEIGHT - 100;

      ctx2.font = 'bold 36px Cairo, sans-serif';
      ctx2.fillStyle = '#d4a017';
      ctx2.fillText('احجز مربعك الآن بـ 1$ فقط!', WIDTH / 2, ctaY);

      ctx2.font = 'bold 22px Cairo, sans-serif';
      ctx2.fillStyle = '#a0a0b0';
      ctx2.fillText('hossinmansourh-jpg.github.io/million-selfies-v2', WIDTH / 2, ctaY + 45);

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
    const modal = document.getElementById('shareCardModal');
    const preview = document.getElementById('shareCardPreview');
    
    preview.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="533"><rect fill="%2314141c" width="300" height="533"/><text x="150" y="266" fill="%23f5b301" text-anchor="middle" font-size="20" font-family="Cairo">⏳ جاري توليد البطاقة...</text></svg>';
    modal.classList.add('active');

    const dataURL = await generateShareCard(bookingData);
    preview.src = dataURL;

  } catch (error) {
    console.error('فشل عرض البطاقة:', error);
    alert('حدث خطأ أثناء توليد البطاقة');
  }
}

function closeShareCard() {
  document.getElementById('shareCardModal').classList.remove('active');
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
    legendHint: 'انقر على أي مربع للحجز',
    hint: '💡 مرر داخل الشبكة لاستكشاف المليون مربع',
    hintLink: '🔗 انقر على أي صورة محجوزة للانتقال إلى حساب صاحبها',
    hintLike: '❤️ انقر مرتين على أي صورة لإعجابها',
    hintLongPress: '👇 اضغط ضغطة مطولة على أي صورة لعرض معلومات صاحبها',
    selectModeBtn: '🖱️ تحديد المربعات',
    selectedCount: 'المربعات المختارة: 0',
    bookingTitle: 'حجز المربعات',
    quantityLabel: 'عدد المربعات',
    quantityNote: '📌 يتم تحديد العدد تلقائياً من الشبكة',
    nameLabel: 'الاسم',
    phoneLabel: 'رقم الهاتف (اختياري)',
    linkLabel: 'رابط حسابك (اختياري)',
    linkNote: '📌 سيتمكن الزوار من النقر على صورتك للانتقال إلى حسابك',
    noteLabel: 'ملاحظة (اختياري)',
    selfieLabel: 'صورة السيلفي',
    receiptLabel: 'إيصال الدفع',
    paymentLabel: 'طريقة الدفع',
    termsTitle: '📋 الشروط والأحكام',
    term1: '• يجب أن تكون الصورة سيلفي شخصية وحقيقية.',
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
    referralText: '🎁 ادعُ 5 من أصدقائك واحصل على مربع مجاني!',
    referralBtn: '📋 نسخ رابط الإحالة',
    leaderboardTitle: '🏆 لوحة الصدارة',
    lbRecent: '📸 آخر الحجوزات',
    lbStats: '📊 إحصائيات حية',
    lbTopLiked: '❤️ الأكثر إعجاباً',
    onboardingTitle: '📌 كيف تحجز؟',
    onboardingStep1: 'اضغط على "تحديد المربعات" واسحب لتحديد منطقتك',
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
    legendHint: 'Click any square to book',
    hint: '💡 Scroll inside the grid to explore the million squares',
    hintLink: '🔗 Click any booked photo to visit the owner\'s account',
    hintLike: '❤️ Double-click any photo to like it',
    hintLongPress: '👇 Long-press any photo to see the owner\'s info',
    selectModeBtn: '🖱️ Select Squares',
    selectedCount: 'Selected squares: 0',
    bookingTitle: 'Book Squares',
    quantityLabel: 'Number of Squares',
    quantityNote: '📌 The number is set automatically from the grid',
    nameLabel: 'Name',
    phoneLabel: 'Phone (optional)',
    linkLabel: 'Your Profile Link (optional)',
    linkNote: '📌 Visitors can click your photo to visit your account',
    noteLabel: 'Note (optional)',
    selfieLabel: 'Selfie Image',
    receiptLabel: 'Payment Receipt',
    paymentLabel: 'Payment Method',
    termsTitle: '📋 Terms & Conditions',
    term1: '• Image must be a real personal selfie.',
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
    referralText: '🎁 Invite 5 friends and get a free square!',
    referralBtn: '📋 Copy Referral Link',
    leaderboardTitle: '🏆 Leaderboard',
    lbRecent: '📸 Recent Bookings',
    lbStats: '📊 Live Stats',
    lbTopLiked: '❤️ Most Liked',
    onboardingTitle: '📌 How to Book?',
    onboardingStep1: 'Click "Select Squares" and drag to select your area',
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

// ===== تطبيق اللغة =====
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

// ===== تبديل اللغة =====
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

// ===== تتبع الزيارات =====
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

// ===== التشغيل =====
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
loadBookings();
trackVisit();
setInterval(loadBookings, 30000);

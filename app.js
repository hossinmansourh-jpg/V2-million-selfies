// ===== استيراد Firebase =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

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

// ===== إحداثيات العرض =====
let offsetX = 0;
let offsetY = 0;

// ===== الحالة =====
let bookings = [];
let hoveredCell = null;
let selectedQuantity = 1;

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

  if (hoveredCell) {
    const px = hoveredCell.x * CELL_PIXEL_SIZE - offsetX;
    const py = hoveredCell.y * CELL_PIXEL_SIZE - offsetY;
    ctx.fillStyle = 'rgba(212, 160, 23, 0.3)';
    ctx.fillRect(px, py, CELL_PIXEL_SIZE * selectedQuantity, CELL_PIXEL_SIZE);
  }
}

// ===== رسم الحجوزات =====
function drawBookings() {
  bookings.forEach(booking => {
    if (booking.status !== 'approved') return;

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
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, startX, startY, width, height);
      };
      img.src = booking.selfieUrl;
    }
  });
}

// ===== تحميل الحجوزات =====
async function loadBookings() {
  try {
    const q = query(collection(db, "bookings"), where("status", "==", "approved"));
    const snapshot = await getDocs(q);
    bookings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateStats();
    drawGrid();
  } catch (error) {
    console.error("خطأ في تحميل الحجوزات:", error);
  }
}

// ===== تحديث الإحصائيات (أرقام إنجليزية) =====
function updateStats() {
  const bookedCells = bookings.reduce((sum, b) => sum + (b.quantity || 0), 0);
  const availableCells = TOTAL_CELLS - bookedCells;
  const selfiesCount = bookings.length;
  const progress = ((bookedCells / TOTAL_CELLS) * 100).toFixed(2);

  document.getElementById('statBooked').textContent = bookedCells.toLocaleString('en-US');
  document.getElementById('statAvailable').textContent = availableCells.toLocaleString('en-US');
  document.getElementById('statSelfies').textContent = selfiesCount.toLocaleString('en-US');
  document.getElementById('progressFill').style.width = progress + '%';
  document.getElementById('progressText').textContent = progress + '%';
}

// ===== التفاعل مع الفأرة =====
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let hasDragged = false;

canvas.addEventListener('mousemove', (e) => {
  if (isDragging) {
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasDragged = true;
    offsetX -= dx;
    offsetY -= dy;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    offsetX = Math.max(0, Math.min(offsetX, GRID_SIZE * CELL_PIXEL_SIZE - canvas.width));
    offsetY = Math.max(0, Math.min(offsetY, GRID_SIZE * CELL_PIXEL_SIZE - canvas.height));
    drawGrid();
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left + offsetX) / CELL_PIXEL_SIZE);
  const y = Math.floor((e.clientY - rect.top + offsetY) / CELL_PIXEL_SIZE);
  if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
    hoveredCell = { x, y };
    drawGrid();
  }
});

canvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  hasDragged = false;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  canvas.style.cursor = 'grabbing';
});

canvas.addEventListener('mouseup', () => {
  isDragging = false;
  canvas.style.cursor = 'crosshair';
});

canvas.addEventListener('mouseleave', () => {
  isDragging = false;
  hoveredCell = null;
  canvas.style.cursor = 'crosshair';
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

// ===== اللمس على الهاتف =====
let touchStartX = 0;
let touchStartY = 0;
let lastTouchDist = 0;

canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  } else if (e.touches.length === 2) {
    lastTouchDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
  }
});

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (e.touches.length === 1) {
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    offsetX -= dx;
    offsetY -= dy;
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
  lastTouchDist = 0;
});

// ===== النقر على الشبكة =====
canvas.addEventListener('click', () => {
  if (hasDragged) {
    hasDragged = false;
    return;
  }
  if (!hoveredCell) return;
  const startCell = hoveredCell.y * GRID_SIZE + hoveredCell.x;
  openBookingModal(startCell);
});

// ===== فتح نافذة الحجز =====
function openBookingModal(startCell) {
  document.getElementById('bookingModal').classList.remove('hidden');
  document.getElementById('bookingModal').dataset.startCell = startCell;
  updatePaymentInfo();
}

// ===== إغلاق النافذة =====
document.getElementById('closeModal').addEventListener('click', () => {
  document.getElementById('bookingModal').classList.add('hidden');
});

// ===== تحديث السعر =====
document.getElementById('quantityInput').addEventListener('input', (e) => {
  selectedQuantity = parseInt(e.target.value) || 1;
  const total = selectedQuantity * CELL_PRICE;
  document.getElementById('totalPrice').textContent = total + ' $';
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
      <code style="display:block;word-break:break-all;margin:10px 0;color:#f5b301">TGRAeYyz8off9oiqPVcph5YkZJuVL6Cngy</code>
      <button onclick="navigator.clipboard.writeText('TGRAeYyz8off9oiqPVcph5YkZJuVL6Cngy')" 
              style="padding:8px 16px;background:#d4a017;border:none;border-radius:6px;cursor:pointer">
        📋 نسخ العنوان
      </button>
      <p style="margin-top:10px">ثم ارفع صورة الإيصال</p>
    `;
  }
}

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

  btn.disabled = true;
  btn.textContent = 'جاري الإرسال...';
  msg.textContent = 'جاري رفع الصور...';
  msg.className = 'form-message';

  try {
    const selfieUrl = await uploadToImgBB(selfieFile);
    const receiptUrl = await uploadToImgBB(receiptFile);

    const startCell = parseInt(document.getElementById('bookingModal').dataset.startCell);
    const quantity = parseInt(document.getElementById('quantityInput').value);
    const cols = Math.min(quantity, 20);
    const rows = Math.ceil(quantity / cols);

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
      timestamp: Date.now()
    };

    await addDoc(collection(db, "bookings"), bookingData);

    msg.textContent = '✅ تم إرسال طلبك بنجاح! سيتم مراجعته قريباً.';
    msg.className = 'form-message success';
    btn.textContent = 'تم الإرسال';

    setTimeout(() => {
      document.getElementById('bookingModal').classList.add('hidden');
      btn.disabled = false;
      btn.textContent = 'إرسال الطلب';
      msg.textContent = '';
    }, 3000);

  } catch (error) {
    console.error(error);
    msg.textContent = '❌ حدث خطأ. حاول مرة أخرى.';
    msg.className = 'form-message error';
    btn.disabled = false;
    btn.textContent = 'إرسال الطلب';
  }
});

// ===== رفع الصور على ImgBB =====
async function uploadToImgBB(file) {
  const formData = new FormData();
  formData.append('image', file);

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
    bookingTitle: 'حجز المربعات',
    quantityLabel: 'عدد المربعات (1-400)',
    nameLabel: 'الاسم',
    phoneLabel: 'رقم الهاتف (اختياري)',
    linkLabel: 'رابط حسابك (اختياري)',
    noteLabel: 'ملاحظة (اختياري)',
    selfieLabel: 'صورة السيلفي',
    receiptLabel: 'إيصال الدفع',

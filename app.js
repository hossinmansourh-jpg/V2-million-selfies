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

// Initialize Firebase
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
  const cols = Math.ceil(canvas.width / CELL_PIXEL_SIZE);
  const rows = Math.ceil(canvas.height / CELL_PIXEL_SIZE);

  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * CELL_PIXEL_SIZE;
      const py = y * CELL_PIXEL_SIZE;
      ctx.strokeStyle = '#2a2a35';
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, CELL_PIXEL_SIZE, CELL_PIXEL_SIZE);
    }
  }

  drawBookings();

  if (hoveredCell) {
    ctx.fillStyle = 'rgba(212, 160, 23, 0.3)';
    ctx.fillRect(
      hoveredCell.x * CELL_PIXEL_SIZE,
      hoveredCell.y * CELL_PIXEL_SIZE,
      CELL_PIXEL_SIZE * selectedQuantity,
      CELL_PIXEL_SIZE
    );
  }
}

// ===== رسم الحجوزات =====
function drawBookings() {
  bookings.forEach(booking => {
    if (booking.status !== 'approved') return;

    const startX = (booking.startCell % GRID_SIZE) * CELL_PIXEL_SIZE;
    const startY = Math.floor(booking.startCell / GRID_SIZE) * CELL_PIXEL_SIZE;
    const width = booking.gridShape.cols * CELL_PIXEL_SIZE;
    const height = booking.gridShape.rows * CELL_PIXEL_SIZE;

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

// ===== تحديث الإحصائيات =====
function updateStats() {
  const bookedCells = bookings.reduce((sum, b) => sum + (b.quantity || 0), 0);
  const availableCells = TOTAL_CELLS - bookedCells;
  const selfiesCount = bookings.length;
  const progress = ((bookedCells / TOTAL_CELLS) * 100).toFixed(2);

  document.getElementById('statBooked').textContent = bookedCells.toLocaleString('ar-EG');
  document.getElementById('statAvailable').textContent = availableCells.toLocaleString('ar-EG');
  document.getElementById('statSelfies').textContent = selfiesCount.toLocaleString('ar-EG');
  document.getElementById('progressFill').style.width = progress + '%';
  document.getElementById('progressText').textContent = progress + '% مكتمل';
}

// ===== التفاعل مع الفأرة =====
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / CELL_PIXEL_SIZE);
  const y = Math.floor((e.clientY - rect.top) / CELL_PIXEL_SIZE);
  if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
    hoveredCell = { x, y };
    drawGrid();
  }
});

canvas.addEventListener('mouseleave', () => {
  hoveredCell = null;
  drawGrid();
});

// ===== النقر على الشبكة =====
canvas.addEventListener('click', () => {
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

document.getElementById('resetView').addEventListener('click', () => {
  CELL_PIXEL_SIZE = 50;
  drawGrid();
});

// ===== الترجمات =====
const translations = {
  ar: {
    heroTitle: 'جدارية مليون صورة سيلفي',
    heroSubtitle: 'احجز مربعك الآن وكن جزءاً من التاريخ',
    statBooked: 'مربع محجوز',
    statAvailable: 'مربع متبقٍ',
    statSelfies: 'صورة سيلفي',
    bookingTitle: 'حجز المربعات',
    quantityLabel: 'عدد المربعات (1-400)',
    nameLabel: 'الاسم',
    phoneLabel: 'رقم الهاتف (اختياري)',
    linkLabel: 'رابط حسابك (اختياري)',
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
    submitBtn: 'إرسال الطلب'
  },
  en: {
    heroTitle: 'Million Selfies Wall',
    heroSubtitle: 'Book your square now and be part of history',
    statBooked: 'Booked Squares',
    statAvailable: 'Available Squares',
    statSelfies: 'Selfies',
    bookingTitle: 'Book Squares',
    quantityLabel: 'Number of Squares (1-400)',
    nameLabel: 'Name',
    phoneLabel: 'Phone (optional)',
    linkLabel: 'Your Profile Link (optional)',
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
    submitBtn: 'Submit Request'
  }
};

// ===== تطبيق اللغة =====
function applyLanguage(lang) {
  const t = translations[lang];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key]) el.textContent = t[key];
  });
}

// ===== تبديل اللغة =====
document.getElementById('langToggle').addEventListener('click', () => {
  const html = document.documentElement;
  const isAr = html.lang === 'ar';
  const newLang = isAr ? 'en' : 'ar';
  html.lang = newLang;
  html.dir = isAr ? 'ltr' : 'rtl';
  document.getElementById('langToggle').textContent = isAr ? 'AR' : 'EN';
  applyLanguage(newLang);
  localStorage.setItem('lang', newLang);
});

const savedLang = localStorage.getItem('lang') || 'ar';
if (savedLang === 'en') {
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
  document.getElementById('langToggle').textContent = 'AR';
}
applyLanguage(savedLang);

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

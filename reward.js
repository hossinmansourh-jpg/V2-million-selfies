// ===== استيراد Firebase =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

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

const REWARD_TARGET = 10;

let myReferralCode = null;
let referralCount = 0;

// ===== تحميل البيانات =====
async function loadRewardData() {
  myReferralCode = localStorage.getItem('my_referral_code');
  
  if (!myReferralCode) {
    // إنشاء رمز جديد
    myReferralCode = 'USER' + Math.random().toString(36).substr(2, 8).toUpperCase();
    localStorage.setItem('my_referral_code', myReferralCode);
  }
  
  document.getElementById('myReferralCode').textContent = myReferralCode;
  
  try {
    const snapshot = await getDocs(collection(db, "bookings"));
    const allBookings = snapshot.docs.map(d => d.data());
    
    // عدّ الإحالات
    referralCount = allBookings.filter(b => b.referredBy === myReferralCode).length;
    
    // التحقق من استلام المكافأة سابقاً
    const rewardClaimed = localStorage.getItem('reward_claimed') === 'true';
    
    updateUI(referralCount, rewardClaimed);
    
  } catch (error) {
    console.error('خطأ في تحميل البيانات:', error);
  }
}

// ===== تحديث واجهة المستخدم =====
function updateUI(count, claimed) {
  document.getElementById('referralCount').textContent = count;
  document.getElementById('totalReferrals').textContent = count;
  
  const remaining = Math.max(0, REWARD_TARGET - count);
  document.getElementById('remainingReferrals').textContent = remaining;
  
  // تحديث الدائرة
  const circle = document.getElementById('progressCircleFill');
  const circumference = 490;
  const progress = Math.min(count / REWARD_TARGET, 1);
  const offset = circumference - (progress * circumference);
  circle.style.strokeDashoffset = offset;
  
  // تحديث الزر
  const claimBtn = document.getElementById('claimRewardBtn');
  
  if (claimed) {
    claimBtn.textContent = '✅ لقد استلمت مكافأتك';
    claimBtn.disabled = true;
  } else if (count >= REWARD_TARGET) {
    claimBtn.textContent = '🎉 استلم مكافأتك الآن!';
    claimBtn.disabled = false;
  } else {
    claimBtn.textContent = `🔒 استلم مكافأتك (${count}/${REWARD_TARGET})`;
    claimBtn.disabled = true;
  }
}

// ===== استلام المكافأة =====
document.getElementById('claimRewardBtn').addEventListener('click', () => {
  if (referralCount < REWARD_TARGET) return;
  
  // حفظ حالة الاستلام
  localStorage.setItem('reward_claimed', 'true');
  localStorage.setItem('reward_claimed_at', Date.now().toString());
  
  // فتح نموذج الحجز بسعر 0
  localStorage.setItem('free_booking_mode', 'true');
  localStorage.setItem('free_booking_reason', `${REWARD_TARGET} إحالات`);
  
  // الانتقال إلى الموقع الرئيسي مع تفعيل وضع المربع المجاني
  window.location.href = 'index.html?free_reward=true';
});

// ===== نسخ رابط الإحالة =====
document.getElementById('shareReferralBtn').addEventListener('click', () => {
  const url = window.location.origin + window.location.pathname.replace('reward.html', '') + '?ref=' + myReferralCode;
  
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('shareReferralBtn');
    const originalText = btn.textContent;
    btn.textContent = '✅ تم النسخ!';
    btn.style.background = '#3a9a3a';
    btn.style.color = '#fff';
    btn.style.borderColor = '#3a9a3a';
    
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '';
      btn.style.color = '';
      btn.style.borderColor = '';
    }, 2000);
  }).catch(() => {
    alert('❌ فشل النسخ');
  });
});

// ===== التشغيل =====
loadRewardData();

// تحديث كل 30 ثانية
setInterval(loadRewardData, 30000);

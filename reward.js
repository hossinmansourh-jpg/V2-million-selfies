// ===== استيراد Firebase =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

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

// ===== الحصول على رمز الإحالة الخاص بالمستخدم =====
function getMyReferralCode() {
  let code = localStorage.getItem('my_referral_code');
  if (!code) {
    code = 'USER' + Math.random().toString(36).substr(2, 8).toUpperCase();
    localStorage.setItem('my_referral_code', code);
  }
  return code;
}

// ===== إنشاء وثيقة المُحيل إذا لم تكن موجودة =====
async function ensureReferrerDoc(code) {
  try {
    const referrerRef = doc(db, 'referrers', code);
    const referrerSnap = await getDoc(referrerRef);

    if (!referrerSnap.exists()) {
      await setDoc(referrerRef, {
        code: code,
        userId: 'user_' + Date.now(),
        name: '',
        email: '',
        telegramChatId: '',
        totalReferrals: 0,
        approvedReferrals: 0,
        pendingReferrals: 0,
        rewardThreshold: REWARD_TARGET,
        rewardReceived: false,
        rewardDate: null,
        rewardBookingId: null,
        createdAt: Timestamp.now(),
        lastReferralAt: null
      });
      return null;
    }

    return referrerSnap.data();
  } catch (error) {
    console.error('خطأ:', error);
    return null;
  }
}

// ===== تحميل البيانات =====
async function loadRewardData() {
  myReferralCode = getMyReferralCode();
  document.getElementById('myReferralCode').textContent = myReferralCode;
  
  try {
    const data = await ensureReferrerDoc(myReferralCode);
    
    const referrerData = data || {
      approvedReferrals: 0,
      pendingReferrals: 0,
      rewardReceived: false,
      rewardThreshold: REWARD_TARGET
    };
    
    updateUI(referrerData);
    
    // إخفاء شاشة التحميل
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('contentState').style.display = 'block';
    
  } catch (error) {
    console.error('خطأ في تحميل البيانات:', error);
    document.getElementById('loadingState').innerHTML = `
      <p style="color: #ff5555;">❌ حدث خطأ في تحميل البيانات</p>
      <p style="font-size: 13px; margin-top: 10px;">حاول تحديث الصفحة</p>
    `;
  }
}

// ===== تحديث واجهة المستخدم =====
function updateUI(data) {
  const approved = data.approvedReferrals || 0;
  const pending = data.pendingReferrals || 0;
  const received = data.rewardReceived || false;
  const threshold = data.rewardThreshold || REWARD_TARGET;

  // تحديث الأرقام
  document.getElementById('referralCount').textContent = approved;
  document.getElementById('approvedCount').textContent = approved;
  document.getElementById('pendingCount').textContent = pending;

  // تحديث الدائرة التقدمية
  const circle = document.getElementById('progressCircleFill');
  const circumference = 490;
  const progress = Math.min(approved / threshold, 1);
  const offset = circumference - (progress * circumference);
  circle.style.strokeDashoffset = offset;

  // تحديث حالة المكافأة + الرسالة
  const statusValue = document.getElementById('rewardStatusValue');
  const messageBox = document.getElementById('rewardMessage');
  const claimBtn = document.getElementById('claimRewardBtn');

  if (received) {
    statusValue.textContent = '✅';
    messageBox.className = 'reward-message success';
    messageBox.innerHTML = '🎉 <strong>مبروك!</strong> لقد استلمت مكافأتك — مربع مجاني على الجدارية!';
    messageBox.style.display = 'block';
    
    claimBtn.textContent = '✅ لقد استلمت مكافأتك';
    claimBtn.disabled = true;
  } else if (approved >= threshold) {
    statusValue.textContent = '🎁';
    messageBox.className = 'reward-message eligible';
    messageBox.innerHTML = '✅ <strong>أنت مستحق للمكافأة!</strong><br>اضغط على الزر أدناه لاستلام مربعك المجاني.';
    messageBox.style.display = 'block';
    
    claimBtn.textContent = '🎉 استلم مكافأتك الآن!';
    claimBtn.disabled = false;
  } else {
    statusValue.textContent = '⏳';
    const remaining = threshold - approved;
    messageBox.className = 'reward-message info';
    messageBox.innerHTML = `🎯 <strong>باقي ${remaining} ${remaining === 1 ? 'إحالة' : 'إحالات'}</strong> للحصول على مربع مجاني!`;
    messageBox.style.display = 'block';
    
    claimBtn.textContent = `🔒 استلم مكافأتك (${approved}/${threshold})`;
    claimBtn.disabled = true;
  }
}

// ===== استلام المكافأة =====
document.getElementById('claimRewardBtn').addEventListener('click', () => {
  // التحقق من الأهلية (سيتم إعادة التحقق في app.js)
  localStorage.setItem('free_booking_mode', 'true');
  localStorage.setItem('free_booking_reason', `${REWARD_TARGET} إحالات`);
  
  // الانتقال إلى الموقع الرئيسي مع تفعيل وضع المربع المجاني
  window.location.href = 'index.html?free_reward=true';
});

// ===== نسخ رابط الإحالة =====
document.getElementById('shareReferralBtn').addEventListener('click', () => {
  const url = window.location.origin + window.location.pathname.replace('reward.html', '') + '?ref=' + myReferralCode;
  
  const shareText = `🖐️ انضم إليّ في مليون بصمة رقمية!\nاحجز مربعك بـ 1$ فقط وكن جزءاً من التاريخ الرقمي.\n👇 سجّل الآن من رابطي:\n\n${url}`;
  
  if (navigator.share) {
    navigator.share({
      title: 'مليون بصمة رقمية',
      text: shareText,
      url: url
    }).catch(() => {
      copyToClipboard(shareText);
    });
  } else {
    copyToClipboard(shareText);
  }
});

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('shareReferralBtn');
    const originalText = btn.textContent;
    btn.textContent = '✅ تم النسخ!';
    btn.style.background = 'var(--green)';
    btn.style.color = '#fff';
    btn.style.borderColor = 'var(--green)';
    
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '';
      btn.style.color = '';
      btn.style.borderColor = '';
    }, 2000);
  }).catch(() => {
    alert('❌ فشل النسخ');
  });
}

// ===== التشغيل =====
loadRewardData();

// تحديث كل 30 ثانية
setInterval(loadRewardData, 30000);

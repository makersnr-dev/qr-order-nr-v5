// /src/admin/assets/js/modules/code.js
import { showToast } from '../admin.js'; // ✅ 표준 토스트 불러오기

let dayWatcherTimer = null;

/**
 * 🌙 자정 감지 및 자동 새로고침 (비용 0원)
 */
function watchMidnight() {
  // 현재 브라우저 기준 날짜 저장 (예: "2026. 2. 4.")
  let lastDate = new Date().toLocaleDateString();

  if (dayWatcherTimer) clearInterval(dayWatcherTimer);

  dayWatcherTimer = setInterval(async () => {
    const nowDate = new Date().toLocaleDateString();
    
    // 날짜가 바뀌었는지 체크
    if (nowDate !== lastDate) {
      lastDate = nowDate;
      console.log('[CODE] 날짜 변경 감지: 결제코드를 자동 갱신합니다.');
      
      // ✅ 서버에서 새 날짜의 코드를 받아오도록 renderCode 재실행
      await renderCode(); 
      
      showToast("🌙 자정이 되어 오늘의 결제코드로 갱신되었습니다.", "info");
    }
  }, 10000); // 10초마다 체크 (서버 호출 없이 브라우저 시계만 확인하므로 비용 없음)
}

export async function renderCode() {
  const storeId = window.qrnrStoreId;
  if (!storeId) return;

  try {
    const r = await fetch(`/api/payment-code?storeId=${storeId}`);
    const data = await r.json();

    if (data.ok) {
      document.getElementById('code-date').textContent = data.date;
      document.getElementById('code-input').value = data.code;

      watchMidnight();
    }
  } catch (e) {
    showToast("코드 데이터를 불러오지 못했습니다.", "error");
  }
}

export function bindCode() {
  const storeId = window.qrnrStoreId;

  // 📋 복사 버튼
  document.getElementById('code-copy')?.addEventListener('click', () => {
    const v = document.getElementById('code-input')?.value;
    if (v) {
      navigator.clipboard.writeText(v).then(() => {
        showToast("✅ 코드가 복사되었습니다!", "success"); // ✅ alert 대신 토스트
      });
    }
  });

  // 🔁 새 코드 발급
  document.getElementById('code-new')?.addEventListener('click', async () => {
    if (!confirm("코드를 새로 발급할까요?")) return;
    
    try {
      const r = await fetch(`/api/payment-code?storeId=${storeId}`, { method: 'POST' });
      const data = await r.json();
      if (data.ok) {
        document.getElementById('code-input').value = data.code;
        showToast("🚀 새 코드가 발급되었습니다.", "success"); // ✅ 토스트 사용
      }
    } catch (e) {
      showToast("코드 발급 중 오류가 발생했습니다.", "error");
    }
  });
}

// /src/admin/assets/js/modules/code.js
import { showToast } from '../admin.js'; // ✅ 표준 토스트 불러오기

let dayWatcherTimer = null;

/**
 * 🌙 자정 감지 및 자동 새로고침 (비용 0원)
 */
function watchMidnight(storeId) {
  // [중요] 이미 타이머가 돌아가고 있다면 중복 생성을 막아 무한 루프를 방지합니다.
  if (dayWatcherTimer) return; 

  let lastDate = new Date().toLocaleDateString();

  dayWatcherTimer = setInterval(async () => {
    const nowDate = new Date().toLocaleDateString();
    
    if (nowDate !== lastDate) {
      lastDate = nowDate;
      console.log('[CODE] 날짜 변경 감지: 결제코드를 자동 갱신합니다.');
      
      // ✅ 무한 루프 방지를 위해 renderCode가 아닌 내부 fetch 로직만 실행하거나 
      // renderCode 호출 시 watchMidnight의 중복 실행 방지 로직이 작동하므로 안전합니다.
      await renderCode(storeId); 
      
      showToast("🌙 자정이 되어 오늘의 결제코드로 갱신되었습니다.", "info");
    }
  }, 30000); // 30초마다 체크 (서버 부하 감소)

  // 화면이 다시 보일 때 즉시 체크
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const checkDate = new Date().toLocaleDateString();
      if (checkDate !== lastDate) {
        lastDate = checkDate;
        renderCode(storeId);
      }
    }
  });
}

export async function renderCode(storeId) {
  // storeId 유효성 검사 (오염된 데이터가 서버로 가는 것 방지)
  if (!storeId || storeId === "null" || storeId === "undefined" || storeId === "[object Object]") return;

  try {
    // Vercel/브라우저 캐시 방지를 위해 타임스탬프 추가
    const r = await fetch(`/api/payment-code?storeId=${storeId}&t=${Date.now()}`);
    const data = await r.json();

    if (data.ok) {
      document.getElementById('code-date').textContent = data.date;
      document.getElementById('code-input').value = data.code;

      // 타이머 시작 (내부에서 중복 실행을 막아줌)
      watchMidnight(storeId);
    }
  } catch (e) {
    showToast("코드 데이터를 불러오지 못했습니다.", "error");
  }
}

export function bindCode(storeId) {
  // 📋 복사 버튼 (기존 로직 동일)
  document.getElementById('code-copy')?.addEventListener('click', () => {
    const v = document.getElementById('code-input')?.value;
    if (v) {
      navigator.clipboard.writeText(v).then(() => {
        showToast("✅ 코드가 복사되었습니다!", "success");
      });
    }
  });
  
  // 🔁 새 코드 발급
  const newBtn = document.getElementById('code-new');
  if (newBtn) {
    newBtn.onclick = async () => {
      if (!confirm("코드를 새로 발급할까요?\n기존 코드는 즉시 무효화됩니다.")) return;
      
      // 🚀 [추가] 중복 클릭 방지 및 로딩 표시
      newBtn.disabled = true;
      newBtn.classList.add('btn-loading');

      try {
        const r = await fetch(`/api/payment-code?storeId=${storeId}`, { method: 'POST' });
        const data = await r.json();
        
        if (data.ok) {
          document.getElementById('code-input').value = data.code;
          showToast("🚀 새 코드가 발급되었습니다.", "success");
        } else {
          showToast(data.message || "코드 발급 실패", "error");
        }
      } catch (e) {
        showToast("코드 발급 중 오류가 발생했습니다.", "error");
      } finally {
        // 🚀 [추가] 어떤 경우에도 잠금 해제
        newBtn.disabled = false;
        newBtn.classList.remove('btn-loading');
      }
    };
  }
}

// /src/admin/assets/js/modules/code.js
import { showToast } from '../admin.js'; // ✅ 표준 토스트 불러오기

export async function renderCode() {
  const storeId = window.qrnrStoreId;
  if (!storeId) return;

  try {
    const r = await fetch(`/api/payment-code?storeId=${storeId}`);
    const data = await r.json();

    if (data.ok) {
      document.getElementById('code-date').textContent = data.date;
      document.getElementById('code-input').value = data.code;
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

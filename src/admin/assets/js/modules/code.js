// /src/admin/assets/js/modules/code.js

// 1. 서버에서 코드 받아와서 화면에 그리기
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
    console.error("코드 로딩 실패", e);
  }
}

// 2. 버튼들 연결하기
export function bindCode() {
  const storeId = window.qrnrStoreId;

  // 복사 버튼
  document.getElementById('code-copy')?.addEventListener('click', () => {
    const v = document.getElementById('code-input')?.value;
    if (v) {
      navigator.clipboard.writeText(v);
      alert("복사되었습니다!");
    }
  });

  // 새 코드 발급 버튼
  document.getElementById('code-new')?.addEventListener('click', async () => {
    if (!confirm("코드를 새로 발급할까요? 기존 코드는 즉시 무효화됩니다.")) return;
    
    const r = await fetch(`/api/payment-code?storeId=${storeId}`, { method: 'POST' });
    const data = await r.json();
    if (data.ok) {
      document.getElementById('code-input').value = data.code;
      alert("새 코드가 발급되었습니다.");
    }
  });

  // 기본 코드(초기화) 버튼 - 필요시 추가 기능
  document.getElementById('code-reset')?.addEventListener('click', () => {
    alert("보안을 위해 랜덤 발급을 권장합니다.");
  });
}

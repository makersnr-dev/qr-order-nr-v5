// /src/admin/assets/js/modules/notify-logs.js
import { showToast } from '../admin.js';

// 시간 포맷팅 도구
function fmtDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('ko-KR', { 
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
  });
}

// 1. DB에서 호출 로그 불러오기
export async function renderNotifyLogs() {
  const tbody = document.getElementById('tbody-notify-logs');
  if (!tbody) return;

  const sid = window.qrnrStoreId;
  if (!sid) return;

  try {
    const res = await fetch(`/api/call?storeId=${sid}`);
    const data = await res.json();
    const list = data.logs || [];

    tbody.innerHTML = '';

    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="small">호출 기록이 없습니다.</td></tr>';
      return;
    }

    list.forEach((n) => {
      const tr = document.createElement('tr');
      const status = n.status || '대기';
      
      tr.innerHTML = `
        <td>${fmtDateTime(n.ts)}</td>
        <td><b>${n.table_no}번</b></td>
        <td>${n.message}</td>
        <td>
          <select class="input" data-id="${n.id}" style="width:90px; border-color:${status === '완료' ? '#2ea043' : '#ffda6a'}">
            <option value="대기" ${status === '대기' ? 'selected' : ''}>대기</option>
            <option value="완료" ${status === '완료' ? 'selected' : ''}>완료</option>
          </select>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    showToast("호출 로그를 불러오지 못했습니다.", "error");
  }
}

// 2. 이벤트 연결 (상태 변경 및 새로고침)
export function bindNotifyLogs() {
  const tbody = document.getElementById('tbody-notify-logs');
  if (!tbody) return;

  // 상태 드롭다운 변경 시 DB 업데이트
  tbody.addEventListener('change', async (e) => {
    const sel = e.target;
    if (sel.tagName !== 'SELECT' || !sel.dataset.id) return;

    const id = sel.dataset.id;
    const nextStatus = sel.value;

    try {
      const res = await fetch('/api/call', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: nextStatus })
      });

      if (res.ok) {
        showToast(`✅ ${nextStatus} 처리되었습니다.`, "success");
        renderNotifyLogs(); // 화면 갱신
      }
    } catch (err) {
      showToast("상태 변경 실패", "error");
    }
  });

  // 새로고침 버튼
  document.getElementById('notify-log-refresh')?.addEventListener('click', () => {
    renderNotifyLogs();
  });
}

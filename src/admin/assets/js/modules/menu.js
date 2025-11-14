// /src/admin/assets/js/modules/menu.js
// 관리자 메뉴 관리: 전역 admin.menu 배열만 직접 수정 (매장 공용)

import { get, patch } from './store.js';

// 샘플 기본 메뉴
const SAMPLE_MENU = [
  { id: 'A1', name: '아메리카노', price: 3000, active: true },
  { id: 'A2', name: '라떼',       price: 4000, active: true },
  { id: 'B1', name: '크로와상',   price: 3500, active: true },
];

// 전역 메뉴 경로
const MENU_PATH = ['admin', 'menu'];

// 전역 메뉴 로딩
function loadMenu() {
  const exist = get(MENU_PATH);

  // 이미 배열이면 그대로 사용 (빈 배열도 허용 = 메뉴 없음)
  if (Array.isArray(exist)) return exist;

  // 처음이면 샘플 메뉴로 초기화
  const cloned = SAMPLE_MENU.map(m => ({ ...m }));
  patch(MENU_PATH, () => cloned);
  return cloned;
}

// ──────────────────────────────────────────────
// 렌더링
// ──────────────────────────────────────────────
export function renderMenu() {
  const menu = loadMenu();
  const body = document.getElementById('m-body');
  if (!body) return;

  body.innerHTML = '';

  if (!menu.length) {
    body.innerHTML = '<tr><td colspan="5" class="small">메뉴 없음</td></tr>';
    return;
  }

  menu.forEach((m, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.id}</td>
      <td><input class="input" value="${m.name || ''}" data-k="name"></td>
      <td><input class="input" type="number" value="${m.price || 0}" data-k="price"></td>
      <td style="width:90px">
        <input type="checkbox" ${m.active ? 'checked' : ''} data-k="active">
      </td>
      <td class="right">
        <button class="btn" data-act="save">저장</button>
        <button class="btn" data-act="del">삭제</button>
      </td>
    `;
    body.appendChild(tr);

    const saveBtn = tr.querySelector('[data-act="save"]');
    const delBtn  = tr.querySelector('[data-act="del"]');

    // 💾 저장
    if (saveBtn) {
      saveBtn.onclick = () => {
        const arr = loadMenu().slice();
        const target = arr[idx] || { id: m.id };

        tr.querySelectorAll('input[data-k]').forEach((input) => {
          const k = input.getAttribute('data-k');
          if (k === 'active') {
            target.active = input.checked;
          } else if (k === 'price') {
            target.price = Number(input.value || 0);
          } else if (k === 'name') {
            target.name = input.value || '';
          }
        });

        arr[idx] = target;
        patch(MENU_PATH, () => arr);
        renderMenu();
      };
    }

    // 🗑 삭제
    if (delBtn) {
      delBtn.onclick = () => {
        if (!confirm('삭제할까요?')) return;

        const arr = loadMenu().slice();
        arr.splice(idx, 1);            // 해당 행 삭제
        patch(MENU_PATH, () => arr);   // 전역 메뉴에 그대로 저장
        renderMenu();                  // 화면 다시 그리기
      };
    }
  });
}

// ──────────────────────────────────────────────
// 상단 "추가" 버튼
// ──────────────────────────────────────────────
export function bindMenu() {
  const addBtn = document.getElementById('m-add');
  if (!addBtn) return;

  addBtn.onclick = () => {
    const idEl    = document.getElementById('m-id');
    const nameEl  = document.getElementById('m-name');
    const priceEl = document.getElementById('m-price');

    const id    = (idEl?.value || '').trim();
    const name  = (nameEl?.value || '').trim();
    const price = Number((priceEl?.value || '').trim() || 0);

    if (!id || !name || !price) {
      alert('ID, 이름, 가격을 모두 입력하세요.');
      return;
    }

    const arr = loadMenu().slice();
    const existingIdx = arr.findIndex((it) => it.id === id);

    if (existingIdx >= 0) {
      if (!confirm('이미 존재하는 ID입니다. 덮어쓸까요?')) return;
      arr[existingIdx] = { ...arr[existingIdx], id, name, price, active: true };
    } else {
      arr.push({ id, name, price, active: true });
    }

    patch(MENU_PATH, () => arr);

    if (idEl) idEl.value = '';
    if (nameEl) nameEl.value = '';
    if (priceEl) priceEl.value = '';

    renderMenu();
  };
}

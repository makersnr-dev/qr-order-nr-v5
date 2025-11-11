import { get, patch } from './store.js';

function currentStoreId() {
  return window.qrnrStoreId || 'store1';
}

// 매장별 메뉴 저장 위치: ['admin', 'menu', storeId]
const PATH = () => ['admin', 'menu', currentStoreId()];

export function renderMenu() {
  const menu = get(PATH()) || [];
  const body = document.getElementById('m-body');
  if (!body) return;

  body.innerHTML = '';

  menu.forEach((m, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.id}</td>
      <td><input class="input" value="${m.name}" data-k="name"></td>
      <td style="width:160px">
        <input class="input" type="number" value="${m.price}" data-k="price">
      </td>
      <td style="width:90px">
        <input type="checkbox" ${m.active ? 'checked' : ''} data-k="active">
      </td>
      <td class="right">
        <button class="btn" data-act="save">저장</button>
        <button class="btn" data-act="del">삭제</button>
      </td>
    `;
    body.appendChild(tr);

    // 저장 버튼
    tr.querySelector('[data-act="save"]').onclick = () => {
      const name = tr.querySelector('[data-k="name"]').value.trim();
      const price = Number(tr.querySelector('[data-k="price"]').value || 0);
      const active = tr.querySelector('[data-k="active"]').checked;

      if (!name) {
        alert('메뉴 이름을 입력하세요.');
        return;
      }

      // 항상 최신 배열 기준으로 수정
      const arr = (get(PATH()) || []).slice();
      arr[idx] = { ...arr[idx], name, price, active };
      patch(PATH(), () => arr);
      renderMenu();
    };

    // 삭제 버튼
    tr.querySelector('[data-act="del"]').onclick = () => {
      if (!confirm('삭제할까요?')) return;
      const arr = (get(PATH()) || []).slice();
      arr.splice(idx, 1);
      patch(PATH(), () => arr);
      renderMenu();
    };
  });
}

export function bindMenu() {
  const addBtn = document.getElementById('m-add');
  if (!addBtn) return;

  addBtn.onclick = () => {
    const id = document.getElementById('m-id').value.trim();
    const name = document.getElementById('m-name').value.trim();
    const price = Number(document.getElementById('m-price').value || 0);

    if (!id || !name) {
      alert('ID와 이름을 입력하세요.');
      return;
    }

    const arr = (get(PATH()) || []).slice();
    const idx = arr.findIndex(x => x.id === id);

    if (idx >= 0) {
      // 기존 ID 업데이트
      arr[idx] = { ...arr[idx], name, price, active: true };
    } else {
      // 새 메뉴 추가
      arr.push({ id, name, price, active: true });
    }

    patch(PATH(), () => arr);

    ['m-id', 'm-name', 'm-price'].forEach(i => {
      const el = document.getElementById(i);
      if (el) el.value = '';
    });

    renderMenu();
  };
}

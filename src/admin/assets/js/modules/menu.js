import { get, patch, fmt } from './store.js';

// 현재 storeId: 전역 → URL → 기본값 순
function currentStoreId() {
  if (window.qrnrStoreId) return window.qrnrStoreId;
  try {
    const u = new URL(location.href);
    return u.searchParams.get('store') || 'store1';
  } catch (e) {
    return 'store1';
  }
}

// 매장별 메뉴 저장 경로: ['admin', 'menu', storeId]
const PER_STORE_PATH = () => ['admin', 'menu', currentStoreId()];

/**
 * 관리자에서 사용할 "현재 매장의 메뉴" 로딩 규칙
 * 1) ['admin','menu', storeId]  (매장별 메뉴)
 * 2) ['admin','menu']           (전역 메뉴)
 * 3) 기본 샘플 3종
 */
function loadMenuForAdmin() {
  const storeId = currentStoreId();

  // (A) 매장별 메뉴 우선
  let perStore = get(['admin', 'menu', storeId]);
  if (Array.isArray(perStore) && perStore.length) return perStore;

  // (B) 전역 메뉴 fallback
  const base = get(['admin', 'menu']) || [];
  if (Array.isArray(base) && base.length) return base;

  // (C) 아무 것도 없으면 샘플 메뉴
  return [
    { id: 'A1', name: '아메리카노', price: 3000, active: true },
    { id: 'A2', name: '라떼',       price: 4000, active: true },
    { id: 'B1', name: '크로와상',   price: 3500, active: true },
  ];
}

/**
 * 메뉴 관리 테이블 렌더링
 */
export function renderMenu() {
  const menu = loadMenuForAdmin();
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

    // 저장 버튼: 현재 행만 수정해서 storeId 전용 메뉴로 저장
    if (saveBtn) {
      saveBtn.onclick = () => {
        const arr = loadMenuForAdmin().slice();
        const rowInputs = tr.querySelectorAll('input[data-k]');
        const target = arr[idx] || { id: m.id };

        rowInputs.forEach((input) => {
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
        // 항상 매장별 경로에 저장 → 이 시점부터는 해당 매장 전용 메뉴
        patch(PER_STORE_PATH(), () => arr);
        renderMenu();
      };
    }

    // 삭제 버튼
    if (delBtn) {
      delBtn.onclick = () => {
        if (!confirm('삭제할까요?')) return;
        const arr = loadMenuForAdmin().slice();
        arr.splice(idx, 1);
        patch(PER_STORE_PATH(), () => arr);
        renderMenu();
      };
    }
  });
}

/**
 * 상단 "추가" 버튼 바인딩
 */
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

    const arr = loadMenuForAdmin().slice();
    const existingIdx = arr.findIndex((it) => it.id === id);

    if (existingIdx >= 0) {
      if (!confirm('이미 존재하는 ID입니다. 덮어쓸까요?')) return;
      arr[existingIdx] = {
        ...arr[existingIdx],
        id,
        name,
        price,
        active: true,
      };
    } else {
      arr.push({ id, name, price, active: true });
    }

    // 매장별 메뉴로 저장
    patch(PER_STORE_PATH(), () => arr);

    ['m-id', 'm-name', 'm-price'].forEach((fieldId) => {
      const el = document.getElementById(fieldId);
      if (el) el.value = '';
    });

    renderMenu();
  };
}

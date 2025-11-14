import { get, patch } from './store.js';

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

// 매장별 메뉴 저장 경로
const PER_STORE_PATH = () => ['admin', 'menu', currentStoreId()];

// 샘플 기본 메뉴
const SAMPLE_MENU = [
  { id: 'A1', name: '아메리카노', price: 3000, active: true },
  { id: 'A2', name: '라떼',       price: 4000, active: true },
  { id: 'B1', name: '크로와상',   price: 3500, active: true },
];

/**
 * 관리자에서 사용할 "현재 매장의 메뉴" 로딩 규칙
 *
 * 1) ['admin','menu', storeId] 가:
 *    - 배열이면 그대로 사용 (빈 배열도 허용 = 메뉴 없음)
 * 2) 아니면(= undefined 등) 한 번만 초기화:
 *    - 전역 메뉴 ['admin','menu'] 가 있으면 그걸 복사
 *    - 없으면 SAMPLE_MENU 복사
 *    그리고 그 복사본을 ['admin','menu', storeId]에 저장
 */
function loadMenuForAdmin() {
  const storeId = currentStoreId();
  const perStorePath = ['admin', 'menu', storeId];
  const existing = get(perStorePath);

  // A) 이미 매장별 메뉴가 있으면 (빈 배열 포함) 그대로 사용
  if (Array.isArray(existing)) {
    return existing;
  }

  // B) 처음 접근한 매장: 전역 or 샘플을 매장별로 복사
  const globalMenu = get(['admin', 'menu']);
  let base = [];

  if (Array.isArray(globalMenu) && globalMenu.length) {
    base = globalMenu;
  } else {
    base = SAMPLE_MENU;
  }

  const cloned = base.map((m) => ({ ...m }));
  patch(perStorePath, () => cloned);

  return cloned;
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

    // 💾 저장: 해당 인덱스만 수정해서 매장별 메뉴에 저장
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
        patch(PER_STORE_PATH(), () => arr);
        renderMenu();
      };
    }

    // 🗑 삭제: 매장별 메뉴 배열에서 제거 후 저장
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

    patch(PER_STORE_PATH(), () => arr);

    ['m-id', 'm-name', 'm-price'].forEach((fieldId) => {
      const el = document.getElementById(fieldId);
      if (el) el.value = '';
    });

    renderMenu();
  };
}

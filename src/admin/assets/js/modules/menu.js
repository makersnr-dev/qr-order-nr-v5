// /src/admin/assets/js/modules/menu.js
// 다점포용 메뉴 관리: admin.menuByStore[storeId] 를 매장별 메뉴로 사용
// 없으면 admin.menu(공용 템플릿) 또는 샘플에서 복사해서 초기화
// 필드: id, name, price, active, soldOut, img, desc

import { get, patch } from './store.js';

// 샘플 기본 메뉴 (공용 템플릿이 아예 없을 때만 사용)
const SAMPLE_MENU = [
  { id: 'A1', name: '아메리카노', price: 3000, active: true },
  { id: 'A2', name: '라떼',       price: 4000, active: true },
  { id: 'B1', name: '크로와상',   price: 3500, active: true },
];

// 현재 storeId 가져오기 (URL은 신뢰하지 않음)
function currentStoreId() {
  if (window.qrnrStoreId) return window.qrnrStoreId;
  return 'store1';
}

// 매장별 메뉴 경로
const PER_STORE_PATH = () => ['admin', 'menuByStore', currentStoreId()];

/**
 * 관리자에서 사용할 "현재 매장의 메뉴" 로딩 규칙
 *
 * 1) admin.menuByStore[storeId] 가 배열이면 그대로 사용 (빈 배열도 허용)
 * 2) 아니면 한 번만 초기화:
 *    - admin.menu (공용 템플릿)이 있으면 그걸 복사
 *    - 없으면 SAMPLE_MENU 복사
 *    그리고 복사본을 admin.menuByStore[storeId]에 저장
 */
function loadMenuForAdmin() {
  const storeId = currentStoreId();

  const perStore = get(['admin', 'menuByStore', storeId]);
  if (Array.isArray(perStore)) return perStore;

  const common = get(['admin', 'menu']);
  const base = Array.isArray(common) && common.length ? common : SAMPLE_MENU;

  const cloned = base.map((m) => ({ ...m }));
  patch(['admin', 'menuByStore', storeId], () => cloned);
  return cloned;
}

// 리스트 렌더링
export function renderMenu() {
  const menu = loadMenuForAdmin();
  const body = document.getElementById('menu-body');
  if (!body) return;

  body.innerHTML = '';

  if (!menu.length) {
    body.innerHTML = '<tr><td colspan="5" class="small">메뉴 없음</td></tr>';
    return;
  }

  menu.forEach((m, idx) => {
    const tr = document.createElement('tr');
    const active = m.active !== false;
    const soldOut = !!m.soldOut;

    tr.innerHTML = `
      <td>${m.id}</td>
      <td><input class="input" value="${m.name || ''}" data-k="name"></td>
      <td><input class="input" type="number" value="${m.price || 0}" data-k="price"></td>
      <td style="min-width:160px">
        <label class="small" style="display:block;margin-bottom:4px">
          <input type="checkbox" ${active ? 'checked' : ''} data-k="active">
          판매중(표시)
        </label>
        <label class="small" style="display:block">
          <input type="checkbox" ${soldOut ? 'checked' : ''} data-k="soldOut">
          일시품절
        </label>
      </td>
      <td class="right">
        <button class="btn small" data-act="detail">상세</button>
        <button class="btn small danger" data-act="del">삭제</button>
      </td>
    `;

    const inputs = tr.querySelectorAll('input[data-k]');
    inputs.forEach((input) => {
      input.addEventListener('change', () => {
        const arr = loadMenuForAdmin().slice();
        const target = arr[idx] || {};
        const k = input.dataset.k;
        let v = input.type === 'checkbox' ? input.checked : input.value;

        if (k === 'price') {
          v = Number(v || 0);
        }

        target[k] = v;
        arr[idx] = target;

        patch(PER_STORE_PATH(), () => arr);
        renderMenu();
      });
    });

    const detailBtn = tr.querySelector('button[data-act="detail"]');
    const delBtn    = tr.querySelector('button[data-act="del"]');

    if (detailBtn) {
      detailBtn.onclick = () => {
        const arr = loadMenuForAdmin().slice();
        const target = arr[idx] || { id: m.id };

        const currentImg  = target.img || '';
        const currentDesc = target.desc || '';

        const newImg = window.prompt('이미지 URL (선택)', currentImg);
        if (newImg !== null) {
          target.img = newImg.trim();
        }

        const newDesc = window.prompt('메뉴 설명 (선택, 여러 줄 가능)', currentDesc);
        if (newDesc !== null) {
          target.desc = newDesc.trim();
        }

        arr[idx] = target;
        patch(PER_STORE_PATH(), () => arr);
        renderMenu();
      };
    }

    if (delBtn) {
      delBtn.onclick = () => {
        const ok = confirm('이 메뉴를 삭제할까요?');
        if (!ok) return;

        const arr = loadMenuForAdmin().slice();
        arr.splice(idx, 1);
        patch(PER_STORE_PATH(), () => arr);
        renderMenu();
      };
    }

    body.appendChild(tr);
  });
}

// 버튼 바인딩
export function bindMenu() {
  const addBtn = document.getElementById('menu-add');
  if (!addBtn) return;

  addBtn.onclick = () => {
    const idInput    = document.getElementById('m-id');
    const nameInput  = document.getElementById('m-name');
    const priceInput = document.getElementById('m-price');

    const id    = idInput?.value.trim();
    const name  = nameInput?.value.trim();
    const price = Number(priceInput?.value || 0);

    if (!id || !name) {
      alert('메뉴 ID와 이름은 필수입니다.');
      return;
    }

    const arr = loadMenuForAdmin().slice();
    const exists = arr.some((m) => m.id === id);
    if (exists) {
      alert('이미 존재하는 ID입니다.');
      return;
    }

    arr.push({
      id,
      name,
      price,
      active: true,
      soldOut: false,
    });

    patch(PER_STORE_PATH(), () => arr);

    ['m-id', 'm-name', 'm-price'].forEach((fieldId) => {
      const el = document.getElementById(fieldId);
      if (el) el.value = '';
    });

    renderMenu();
  };
}

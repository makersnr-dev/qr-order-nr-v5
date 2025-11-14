import { get, patch } from '/src/admin/assets/js/modules/store.js';

// 현재 storeId
function currentStoreId() {
  if (window.qrnrStoreId) return window.qrnrStoreId;
  try {
    const u = new URL(location.href);
    return u.searchParams.get('store') || 'store1';
  } catch (e) {
    return 'store1';
  }
}

// 저장 경로
const PER_STORE_PATH = () => ['admin', 'menu', currentStoreId()];

// 샘플 기본 메뉴
const SAMPLE_MENU = [
  { id: 'A1', name: '아메리카노', price: 3000, active: true },
  { id: 'A2', name: '라떼',       price: 4000, active: true },
  { id: 'B1', name: '크로와상',   price: 3500, active: true },
];

// 매장 메뉴 로딩
function loadMenuForAdmin() {
  const storeId = currentStoreId();
  const path = ['admin', 'menu', storeId];
  const exist = get(path);

  // 이미 있음(빈 배열 포함)
  if (Array.isArray(exist)) return exist;

  // 첫 로딩: 전역 메뉴 or 샘플 복사
  const globalMenu = get(['admin','menu']);
  let base = [];

  if (Array.isArray(globalMenu) && globalMenu.length) base = globalMenu;
  else base = SAMPLE_MENU;

  const cloned = base.map(m => ({ ...m }));
  patch(path, () => cloned);
  return cloned;
}

// 렌더링
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
      <td><input class="input" value="${m.name}" data-k="name"></td>
      <td><input class="input" type="number" value="${m.price}" data-k="price"></td>
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

    // 저장
    saveBtn.onclick = () => {
      const arr = loadMenuForAdmin().slice();
      const target = arr[idx];

      tr.querySelectorAll('input[data-k]').forEach(input => {
        const k = input.dataset.k;
        if (k === 'active') target[k] = input.checked;
        else if (k === 'price') target[k] = Number(input.value);
        else target[k] = input.value;
      });

      patch(PER_STORE_PATH(), () => arr);
      renderMenu();
    };

    // 삭제
    delBtn.onclick = () => {
      if (!confirm('삭제할까요?')) return;

      const arr = loadMenuForAdmin().slice();
      arr.splice(idx, 1);
      patch(PER_STORE_PATH(), () => arr);
      renderMenu();
    };
  });
}

// 신규 메뉴 추가
export function bindMenu() {
  const addBtn = document.getElementById('m-add');
  if (!addBtn) return;

  addBtn.onclick = () => {
    const id    = (document.getElementById('m-id')?.value || '').trim();
    const name  = (document.getElementById('m-name')?.value || '').trim();
    const price = Number((document.getElementById('m-price')?.value || '').trim());

    if (!id || !name || !price) {
      alert('ID, 이름, 가격을 모두 입력하세요.');
      return;
    }

    const arr = loadMenuForAdmin().slice();
    const idx = arr.findIndex(x => x.id === id);

    if (idx >= 0) {
      if (!confirm('이미 존재합니다. 덮어쓸까요?')) return;
      arr[idx] = { id, name, price, active: true };
    } else {
      arr.push({ id, name, price, active: true });
    }

    patch(PER_STORE_PATH(), () => arr);
    renderMenu();

    document.getElementById('m-id').value = '';
    document.getElementById('m-name').value = '';
    document.getElementById('m-price').value = '';
  };
}

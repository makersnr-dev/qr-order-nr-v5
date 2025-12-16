// /src/admin/assets/js/modules/menu.js
import { get, patch } from './store.js';

/* ===============================
   기본 설정 / 로딩
================================ */
const SAMPLE_MENU = [
  { id: 'A1', name: '아메리카노', price: 3000, active: true },
  { id: 'A2', name: '라떼', price: 4000, active: true },
  { id: 'B1', name: '크로와상', price: 3500, active: true },
];

function currentStoreId() {
  if (window.qrnrStoreId) return window.qrnrStoreId;
  try {
    return new URL(location.href).searchParams.get('store') || 'store1';
  } catch {
    return 'store1';
  }
}

const PER_STORE_PATH = () => ['admin', 'menuByStore', currentStoreId()];

function loadMenuForAdmin() {
  const storeId = currentStoreId();
  const perStore = get(['admin', 'menuByStore', storeId]);
  if (Array.isArray(perStore)) return perStore;

  const global = get(['admin', 'menu']);
  const base = Array.isArray(global) && global.length ? global : SAMPLE_MENU;
  const cloned = base.map(m => ({ ...m }));
  patch(['admin', 'menuByStore', storeId], () => cloned);
  return cloned;
}

/* ===============================
   메뉴 테이블
================================ */
export function renderMenu() {
  const menu = loadMenuForAdmin();
  const body = document.getElementById('m-body');
  if (!body) return;

  body.innerHTML = '';

  menu.forEach((m, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.id}</td>
      <td><input class="input" value="${m.name || ''}" data-k="name"></td>
      <td><input class="input" type="number" value="${m.price || 0}" data-k="price"></td>
      <td><input class="input" value="${m.category || ''}" data-k="category"></td>
      <td>
        <label class="small">
          <input type="checkbox" data-k="active" ${m.active !== false ? 'checked' : ''}> 판매중
        </label><br>
        <label class="small">
          <input type="checkbox" data-k="soldOut" ${m.soldOut ? 'checked' : ''}> 품절
        </label>
      </td>
      <td class="right">
        <button class="btn small" data-act="detail">상세</button>
        <button class="btn small" data-act="save">저장</button>
        <button class="btn small" data-act="del">삭제</button>
      </td>
    `;
    body.appendChild(tr);

    tr.querySelector('[data-act="save"]').onclick = () => {
      const arr = loadMenuForAdmin().slice();
      const target = arr[idx];
      tr.querySelectorAll('[data-k]').forEach(i => {
        const k = i.dataset.k;
        if (k === 'active' || k === 'soldOut') target[k] = i.checked;
        else if (k === 'price') target[k] = Number(i.value || 0);
        else target[k] = i.value;
      });
      patch(PER_STORE_PATH(), () => arr);
      renderMenu();
    };

    tr.querySelector('[data-act="detail"]').onclick = () => {
      const arr = loadMenuForAdmin().slice();
      openMenuDetailModal(arr[idx], () => {
        patch(PER_STORE_PATH(), () => arr);
        renderMenu();
      });
    };

    tr.querySelector('[data-act="del"]').onclick = () => {
      if (!confirm('삭제할까요?')) return;
      const arr = loadMenuForAdmin().slice();
      arr.splice(idx, 1);
      patch(PER_STORE_PATH(), () => arr);
      renderMenu();
    };
  });
}

/* ===============================
   상세 모달
================================ */
function ensureMenuDetailModal() {
  if (document.getElementById('menu-detail-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'menu-detail-modal';
  modal.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,.55);
    display:none; align-items:center; justify-content:center; z-index:9999;
  `;

  modal.innerHTML = `
    <div style="
      width:860px; max-width:100%; max-height:90vh; overflow:auto;
      background:#fff; border-radius:14px; padding:20px;
    ">
      <h3>메뉴 상세 설정</h3>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
        <div>
          <div class="small">이미지 URL</div>
          <input id="md-img" class="input">
        </div>
        <div>
          <div class="small">카테고리</div>
          <input id="md-category" class="input">
        </div>
      </div>

      <div style="margin-top:12px">
        <div class="small">메뉴 설명</div>
        <textarea id="md-desc" class="input" style="min-height:90px"></textarea>
      </div>

      <section style="
        margin-top:20px;
        padding:16px;
        background:#f9fafb;
        border-radius:12px;
      ">
        <h4 style="margin-bottom:12px">옵션 관리</h4>
        <div id="md-opt-groups"></div>
        <button id="md-opt-add-group" class="btn small">옵션 그룹 추가</button>
      </section>

      <div class="hstack" style="justify-content:flex-end; gap:8px; margin-top:16px">
        <button id="md-cancel" class="btn">취소</button>
        <button id="md-save" class="btn primary">저장</button>
      </div>
    </div>
  `;

  modal.onclick = e => e.target === modal && (modal.style.display = 'none');
  document.body.appendChild(modal);
}

/* ===============================
   옵션 그룹 렌더 (가독성 개선 핵심)
================================ */
function renderOptionGroups(groups, mount) {
  mount.innerHTML = '';
  groups.forEach((g, gi) => {
    const card = document.createElement('div');
    card.style.cssText = `
      background:#fff;
      border:1px solid #e5e7eb;
      border-radius:12px;
      padding:14px;
      margin-bottom:12px;
    `;

    card.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px">
        <strong>${g.name || '옵션 그룹'}</strong>
        <div style="margin-left:auto">
          <button data-act="up">↑</button>
          <button data-act="down">↓</button>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-top:10px">
        <input class="input" data-k="name" placeholder="옵션명" value="${g.name || ''}">
        <select class="input" data-k="type">
          <option value="single" ${g.type==='single'?'selected':''}>단일</option>
          <option value="multi" ${g.type==='multi'?'selected':''}>복수</option>
        </select>
        <label class="small"><input type="checkbox" data-k="required" ${g.required?'checked':''}> 필수</label>
        <input class="input" data-k="min" type="number" placeholder="min" value="${g.min ?? ''}">
        <input class="input" data-k="max" type="number" placeholder="max" value="${g.max ?? ''}">
      </div>

      <div class="opt-items" style="
        margin-top:12px;
        padding:10px;
        border:1px dashed #ddd;
        border-radius:8px;
      "></div>

      <div style="margin-top:8px">
        <button data-act="add-item" class="btn small">항목 추가</button>
        <button data-act="del-group" class="btn small">그룹 삭제</button>
      </div>
    `;

    card.querySelectorAll('[data-k]').forEach(el => {
      const k = el.dataset.k;
      el.oninput = () => {
        if (k === 'required') g.required = el.checked;
        else if (k === 'min' || k === 'max') g[k] = el.value === '' ? undefined : Number(el.value);
        else g[k] = el.value;
      };
    });

    card.querySelector('[data-act="del-group"]').onclick = () => {
      groups.splice(gi, 1);
      renderOptionGroups(groups, mount);
    };

    const itemsBox = card.querySelector('.opt-items');
    g.items.forEach((it, ii) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; gap:8px; margin-bottom:6px';
      row.innerHTML = `
        <input class="input" value="${it.label || ''}" placeholder="라벨">
        <input class="input" type="number" value="${it.price || 0}" style="width:100px">
        <button>삭제</button>
      `;
      row.querySelector('button').onclick = () => {
        g.items.splice(ii, 1);
        renderOptionGroups(groups, mount);
      };
      row.querySelectorAll('input')[0].oninput = e => it.label = e.target.value;
      row.querySelectorAll('input')[1].oninput = e => it.price = Number(e.target.value||0);
      itemsBox.appendChild(row);
    });

    card.querySelector('[data-act="add-item"]').onclick = () => {
      g.items.push({ id: crypto.randomUUID(), label:'', price:0 });
      renderOptionGroups(groups, mount);
    };

    mount.appendChild(card);
  });
}

/* ===============================
   모달 오픈
================================ */
function openMenuDetailModal(target, onSave) {
  ensureMenuDetailModal();

  const modal = document.getElementById('menu-detail-modal');
  const img = modal.querySelector('#md-img');
  const desc = modal.querySelector('#md-desc');
  const cat = modal.querySelector('#md-category');
  const groupsMount = modal.querySelector('#md-opt-groups');

  img.value = target.img || '';
  desc.value = target.desc || '';
  cat.value = target.category || '';

  let groups = JSON.parse(JSON.stringify(target.options || []));
  renderOptionGroups(groups, groupsMount);

  modal.querySelector('#md-opt-add-group').onclick = () => {
    groups.push({
      id: crypto.randomUUID(),
      name:'',
      type:'single',
      required:false,
      items:[]
    });
    renderOptionGroups(groups, groupsMount);
  };

  modal.querySelector('#md-save').onclick = () => {
    target.img = img.value.trim();
    target.desc = desc.value.trim();
    target.category = cat.value.trim();
    target.options = groups.filter(g => g.name && g.items.length);
    modal.style.display = 'none';
    onSave && onSave();
  };

  modal.querySelector('#md-cancel').onclick = () => {
    modal.style.display = 'none';
  };

  modal.style.display = 'flex';
}

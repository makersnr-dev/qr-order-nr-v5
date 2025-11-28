// /src/admin/assets/js/modules/qr.js
import { patch, get } from './store.js';

const $ = (s, r = document) => r.querySelector(s);

// ===== 매장 식별 =====
function currentStoreId() {
  // admin.js에서 설정한 값 우선
  if (window.qrnrStoreId) return window.qrnrStoreId;

  // 없으면 localStorage 참고
  try {
    const saved = localStorage.getItem('qrnr.storeId');
    if (saved) return saved;
  } catch (e) {
    console.error('[qr] currentStoreId localStorage error', e);
  }

  // 그래도 없으면 기본값
  return 'store1';
}

// 공통 저장 위치 : ['admin', 'qrList']
//  - kind: 'store' | 'deliv' 로 구분
const PATH = ['admin', 'qrList'];

function ensureList() {
  const cur = get(PATH);
  if (Array.isArray(cur)) return cur;
  return [];
}

function loadAll() {
  const cur = get(PATH);
  return Array.isArray(cur) ? cur : [];
}

function saveAll(list) {
  patch(PATH, () => (Array.isArray(list) ? list : []));
}

function loadStoreQrList(storeId) {
  const all = loadAll();
  return all.filter((q) => q.storeId === storeId);
}

function saveStoreQrList(storeId, list) {
  const all = loadAll().filter((q) => q.storeId !== storeId);
  const next = [...all, ...(list || [])];
  saveAll(next);
}

export function initQR() {
  const wrap = document.getElementById('qr-wrap');
  if (!wrap) return;

  const storeId = currentStoreId();

  const inputTableNo = document.getElementById('qr-table-no');
  const inputCount = document.getElementById('qr-count');
  const btnGenerate = document.getElementById('qr-generate');
  const listWrap = document.getElementById('qr-list');
  const storeSpan = document.getElementById('qr-store-id');

  if (storeSpan) {
    storeSpan.textContent = storeId;
  }

  function renderList() {
    if (!listWrap) return;
    const list = loadStoreQrList(storeId);
    listWrap.innerHTML = '';

    if (!list.length) {
      listWrap.innerHTML =
        '<p class="text-muted small">생성된 QR 없음</p>';
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'qr-list';

    list.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'qr-item';

      const info = document.createElement('div');
      info.className = 'qr-info';
      info.textContent = `테이블 ${item.tableNo || '-'} (${item.kind === 'store' ? '매장' : '배달/예약'})`;

      const btnDelete = document.createElement('button');
      btnDelete.textContent = '삭제';
      btnDelete.className = 'btn btn-sm btn-outline-danger';

      btnDelete.addEventListener('click', () => {
        const ok = confirm('이 QR 항목을 삭제할까요?');
        if (!ok) return;
        const list = loadStoreQrList(storeId).filter(
          (q) => q.id !== item.id
        );
        saveStoreQrList(storeId, list);
        renderList();
      });

      const link = document.createElement('a');
      link.href = item.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '열기';

      li.appendChild(info);
      li.appendChild(link);
      li.appendChild(btnDelete);

      ul.appendChild(li);
    });

    listWrap.appendChild(ul);
  }

  renderList();

  if (btnGenerate) {
    btnGenerate.addEventListener('click', () => {
      const baseUrl = location.origin || '';
      const tableNo = (inputTableNo?.value || '').trim();
      const count = Math.max(
        1,
        Math.min(50, Number(inputCount?.value || '1') || 1)
      );

      const kindSel = document.getElementById('qr-kind');
      const kind =
        kindSel && kindSel.value === 'delivery' ? 'deliv' : 'store';

      const list = loadStoreQrList(storeId);
      let maxIdx = 0;
      list.forEach((q) => {
        const m = /_(\d+)$/.exec(q.id || '');
        if (m) {
          const v = parseInt(m[1], 10);
          if (!Number.isNaN(v) && v > maxIdx) maxIdx = v;
        }
      });

      const next = [...list];
      for (let i = 0; i < count; i++) {
        const idx = maxIdx + 1 + i;
        const id  = `${storeId}_${kind}_${idx}`;

        let url = '';
        if (kind === 'store') {
          url = `${baseUrl}/order/store?store=${encodeURIComponent(
            storeId
          )}&table=${encodeURIComponent(tableNo || String(idx))}`;
        } else {
          url = `${baseUrl}/order/select?store=${encodeURIComponent(
            storeId
          )}`;
        }

        next.push({
          id,
          storeId,
          kind,
          tableNo: tableNo || String(idx),
          url,
        });
      }

      saveStoreQrList(storeId, next);
      renderList();
    });
  }
}

// /src/admin/assets/js/modules/qr.js
// QR 생성/관리 (매장별 분리 + 보안 강화 버전)

import { patch, get, ensureStoreInitialized } from './store.js';

const $ = (s, r = document) => r.querySelector(s);

// ==============================
//  storeId는 무조건 JWT/localStorage 기반
// ==============================
function currentStoreId() {
  const sid =
    window.qrnrStoreId ||
    localStorage.getItem('qrnr.storeId') ||
    'store1';

  return sid;
}

// 공통 저장 위치 (매장별 필터링은 storeId로 분기)
const PATH = ['admin', 'qrList'];

function ensureList() {
  const cur = get(PATH);
  if (Array.isArray(cur)) return cur;
  patch(PATH, () => []);
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
  return all.filter(
    (q) =>
      q.storeId === storeId &&
      (q.kind === 'store' || !q.kind)
  );
}

function loadDelivQrList(storeId) {
  const all = loadAll();
  return all.filter((q) => q.storeId === storeId && q.kind === 'deliv');
}

// ==============================
// QR Code 생성 (qrcodejs)
// ==============================
function makeQRDataUrl(text) {
  return new Promise((resolve, reject) => {
    try {
      if (!window.QRCode) {
        return reject(new Error('QRCode 라이브러리가 없습니다.'));
      }

      const wrap = document.createElement('div');
      wrap.style.position = 'fixed';
      wrap.style.left = '-9999px';
      wrap.style.top = '-9999px';
      document.body.appendChild(wrap);

      new QRCode(wrap, {
        text,
        width: 256,
        height: 256,
        correctLevel: QRCode.CorrectLevel.H,
      });

      setTimeout(() => {
        try {
          const canvas = wrap.querySelector('canvas');
          const img = wrap.querySelector('img');

          let dataUrl = null;
          if (canvas?.toDataURL) dataUrl = canvas.toDataURL('image/png');
          else if (img?.src) dataUrl = img.src;

          document.body.removeChild(wrap);

          if (!dataUrl) throw new Error('QR 생성 실패');
          resolve(dataUrl);
        } catch (e) {
          document.body.removeChild(wrap);
          reject(e);
        }
      }, 0);
    } catch (e) {
      reject(e);
    }
  });
}

// ==============================
// 초기화
// ==============================
export function initQR() {
  ensureList();

  // 1) 매장 주문 QR
  const tableInput = $('#qr-table');
  const labelInput = $('#qr-label');
  const genBtn = $('#qr-generate');
  const clearBtn = $('#qr-clear');
  const grid = $('#qr-grid');

  function renderStoreList() {
    if (!grid) return;

    const storeId = currentStoreId();
    ensureStoreInitialized(storeId);

    const list = loadStoreQrList(storeId);
    grid.innerHTML = '';

    if (!list.length) {
      grid.innerHTML = '<div class="small">저장된 QR이 없습니다.</div>';
      return;
    }

    list
      .sort((a, b) => (a.table || '').localeCompare(b.table || ''))
      .forEach((q) => {
        const wrap = document.createElement('div');
        wrap.className = 'vstack';
        wrap.style.gap = '4px';
        wrap.style.alignItems = 'center';
        wrap.style.border = '1px solid #263241';
        wrap.style.padding = '8px';
        wrap.style.borderRadius = '10px';
        wrap.style.background = '#0b1620';

        const img = document.createElement('img');
        img.src = q.dataUrl;
        img.alt = q.label;
        img.style.width = '140px';
        img.style.height = '140px';

        const labelDiv = document.createElement('div');
        labelDiv.className = 'small';
        labelDiv.textContent = `${q.label} (테이블 ${q.table})`;

        const urlDiv = document.createElement('div');
        urlDiv.className = 'small';
        urlDiv.style.wordBreak = 'break-all';
        urlDiv.textContent = q.url;

        const btnRow = document.createElement('div');
        btnRow.className = 'hstack';
        btnRow.style.gap = '4px';

        const down = document.createElement('a');
        down.textContent = '다운로드';
        down.href = q.dataUrl;
        down.download = `table-${q.storeId}-${q.table}.png`;
        down.className = 'btn small';

        const del = document.createElement('button');
        del.textContent = '삭제';
        del.className = 'btn small';
        del.onclick = () => {
          const next = loadAll().filter((x) => x.id !== q.id);
          saveAll(next);
          renderStoreList();
        };

        btnRow.appendChild(down);
        btnRow.appendChild(del);

        wrap.appendChild(img);
        wrap.appendChild(labelDiv);
        wrap.appendChild(urlDiv);
        wrap.appendChild(btnRow);

        grid.appendChild(wrap);
      });
  }

  if (grid && tableInput && genBtn) {
    renderStoreList();

    genBtn.addEventListener('click', async () => {
      const storeId = currentStoreId();
      ensureStoreInitialized(storeId);

      const table = (tableInput.value || '').trim();
      const label = (labelInput.value || '').trim() || `${table}번 테이블`;

      if (!table) {
        alert('테이블 번호를 입력하세요.');
        tableInput.focus();
        return;
      }

      const url =
        `${location.origin}/order/store` +
        `?store=${encodeURIComponent(storeId)}` +
        `&table=${encodeURIComponent(table)}`;

      try {
        const dataUrl = await makeQRDataUrl(url);

        const item = {
          id: `QR-${Date.now()}-${storeId}-${table}`,
          kind: 'store',
          storeId,
          table,
          label,
          url,
          dataUrl,
        };

        const all = loadAll();
        const filtered = all.filter(
          (x) =>
            !(x.storeId === storeId &&
              (x.kind === 'store' || !x.kind) &&
              x.table === table)
        );

        saveAll([...filtered, item]);
        renderStoreList();
      } catch (e) {
        console.error(e);
        alert('QR 생성 중 오류가 발생했습니다.');
      }
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (!confirm('이 매장의 테이블 QR을 모두 삭제할까요?')) return;

        const storeId = currentStoreId();
        const next = loadAll().filter(
          (x) => !(x.storeId === storeId && (x.kind === 'store' || !x.kind))
        );
        saveAll(next);
        renderStoreList();
      });
    }
  }

  // ==============================
  // 2) 배달/예약용 QR
  // ==============================
  const delivLabelInput = $('#qr-deliv-label');
  const delivGenBtn = $('#qr-deliv-generate');
  const delivClearBtn = $('#qr-deliv-clear');
  const delivGrid = $('#qr-deliv-grid');

  function renderDelivList() {
    if (!delivGrid) return;

    const storeId = currentStoreId();
    ensureStoreInitialized(storeId);

    const list = loadDelivQrList(storeId);
    delivGrid.innerHTML = '';

    if (!list.length) {
      delivGrid.innerHTML = '<div class="small">저장된 QR이 없습니다.</div>';
      return;
    }

    list.forEach((q) => {
      const wrap = document.createElement('div');
      wrap.className = 'vstack';
      wrap.style.gap = '4px';
      wrap.style.alignItems = 'center';
      wrap.style.border = '1px solid #263241';
      wrap.style.padding = '8px';
      wrap.style.borderRadius = '10px';
      wrap.style.background = '#0b1620';

      const img = document.createElement('img');
      img.src = q.dataUrl;
      img.alt = q.label;
      img.style.width = '140px';
      img.style.height = '140px';

      const labelDiv = document.createElement('div');
      labelDiv.className = 'small';
      labelDiv.textContent = q.label || '배달/예약 QR';

      const urlDiv = document.createElement('div');
      urlDiv.className = 'small';
      urlDiv.style.wordBreak = 'break-all';
      urlDiv.textContent = q.url;

      const btnRow = document.createElement('div');
      btnRow.className = 'hstack';
      btnRow.style.gap = '4px';

      const down = document.createElement('a');
      down.textContent = '다운로드';
      down.href = q.dataUrl;
      down.download = `delivery-${q.storeId}-${Date.now()}.png`;
      down.className = 'btn small';

      const del = document.createElement('button');
      del.textContent = '삭제';
      del.className = 'btn small';
      del.onclick = () => {
        const next = loadAll().filter((x) => x.id !== q.id);
        saveAll(next);
        renderDelivList();
      };

      btnRow.appendChild(down);
      btnRow.appendChild(del);

      wrap.appendChild(img);
      wrap.appendChild(labelDiv);
      wrap.appendChild(urlDiv);
      wrap.appendChild(btnRow);

      delivGrid.appendChild(wrap);
    });
  }

  if (delivGrid && delivGenBtn) {
    renderDelivList();

    delivGenBtn.addEventListener('click', async () => {
      const storeId = currentStoreId();
      ensureStoreInitialized(storeId);

      const label =
        (delivLabelInput?.value || '').trim() || '배달/예약 주문';

      const url =
        `${location.origin}/order/delivery-entry` +
        `?store=${encodeURIComponent(storeId)}`;

      try {
        const dataUrl = await makeQRDataUrl(url);

        const item = {
          id: `QR-DELIV-${Date.now()}-${storeId}`,
          kind: 'deliv',
          storeId,
          label,
          url,
          dataUrl,
        };

        saveAll([...loadAll(), item]);
        renderDelivList();
      } catch (e) {
        console.error(e);
        alert('배달/예약 QR 생성 오류');
      }
    });

    if (delivClearBtn) {
      delivClearBtn.addEventListener('click', () => {
        if (!confirm('이 매장의 배달/예약 QR을 모두 삭제할까요?')) return;

        const storeId = currentStoreId();
        const next = loadAll().filter(
          (x) => !(x.storeId === storeId && x.kind === 'deliv')
        );
        saveAll(next);
        renderDelivList();
      });
    }
  }
}

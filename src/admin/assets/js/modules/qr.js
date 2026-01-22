// /src/admin/assets/js/modules/qr.js
import { patch, get } from './store.js';

const $ = (s, r = document) => r.querySelector(s);

// ===== 매장 식별 =====
function currentStoreId() {
  const storeId = window.qrnrStoreId;
  if (!storeId) {
    alert('매장 정보가 초기화되지 않았습니다.\n관리자 콘솔로 다시 진입해주세요.');
    throw new Error('STORE_ID_NOT_INITIALIZED');
  }
  return storeId;
}


// 공통 저장 위치 : ['admin', 'qrList']
//  - kind: 'store' | 'deliv' 로 구분
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
      (q.kind === 'store' || !q.kind) // kind 없는 예전 데이터는 매장용으로 취급
  );
}

function loadDelivQrList(storeId) {
  const all = loadAll();
  return all.filter((q) => q.storeId === storeId && q.kind === 'deliv');
}

// ===== QR 코드 생성 (qrcodejs) =====
function makeQRDataUrl(text) {
  return new Promise((resolve, reject) => {
    try {
      if (!window.QRCode) {
        return reject(new Error('QRCode 전역 객체가 없습니다.'));
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

          // canvas 우선
          if (canvas && canvas.toDataURL) {
            dataUrl = canvas.toDataURL('image/png');
          }
          // 일부 버전은 img(data:URL)로 생성함
          else if (img && img.src) {
            dataUrl = img.src;
          }

          document.body.removeChild(wrap);

          if (!dataUrl) {
            throw new Error('QR 이미지를 생성하지 못했습니다.');
          }

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

// ===== 초기화 =====
export function initQR() {
  ensureList();

  // ─────────────────────────────────────────────
  // 1) 매장 테이블용 QR (기존 기능)
  //    - 입력: #qr-table, #qr-label
  //    - 버튼: #qr-generate, #qr-clear
  //    - 그리드: #qr-grid
  // ─────────────────────────────────────────────
  const tableInput = $('#qr-table');
  const labelInput = $('#qr-label');
  const genBtn = $('#qr-generate');
  const clearBtn = $('#qr-clear');
  const grid = $('#qr-grid');

  function renderStoreList() {
    if (!grid) return;

    const storeId = currentStoreId();
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
          const all = loadAll();
          const next = all.filter((x) => x.id !== q.id);
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

    // QR 생성 & 저장 (매장 주문용)
    genBtn.addEventListener('click', async () => {
      const storeId = currentStoreId();
      const table = (tableInput.value || '').trim();
      const label = (labelInput.value || '').trim() || `${table}번 테이블`;

      if (!table) {
        alert('테이블 번호를 입력하세요.');
        tableInput.focus();
        return;
      }

      // 매장별 매장주문 URL
      const url =
        `${location.origin}/order/store` +
        `?store=${encodeURIComponent(storeId)}` +
        `&table=${encodeURIComponent(table)}`;

      try {
        const dataUrl = await makeQRDataUrl(url);

        const item = {
          id: `QR-${Date.now()}-${storeId}-${table}`,
          kind: 'store',          // ✅ 매장용
          storeId,
          table,
          label,
          url,
          dataUrl,
        };

        const all = loadAll();
        // 같은 매장+테이블 것은 교체
        const filtered = all.filter(
          (x) => !(x.storeId === storeId && x.kind !== 'deliv' && x.table === table)
        );
        saveAll([...filtered, item]);

        renderStoreList();
      } catch (e) {
        console.error(e);
        alert('QR 생성 중 오류가 발생했습니다.');
      }
    });

    // 현재 매장 QR 전체 삭제
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (!confirm('이 매장의 저장된 테이블 QR을 모두 삭제할까요?')) return;
        const storeId = currentStoreId();
        const all = loadAll();
        // 이 매장의 kind==='store'(또는 kind 없음)만 제거
        const next = all.filter(
          (x) =>
            !(
              x.storeId === storeId &&
              (x.kind === 'store' || !x.kind)
            )
        );
        saveAll(next);
        renderStoreList();
      });
    }
  }

  // ─────────────────────────────────────────────
  // 2) 배달/예약용 QR (새 기능)
  //    - 입력: #qr-deliv-label
  //    - 버튼: #qr-deliv-generate, #qr-deliv-clear
  //    - 그리드: #qr-deliv-grid
  //    ※ admin.html 에 이 id들이 없으면 그냥 건너뜀
  // ─────────────────────────────────────────────
  const delivLabelInput = $('#qr-deliv-label');
  const delivGenBtn = $('#qr-deliv-generate');
  const delivClearBtn = $('#qr-deliv-clear');
  const delivGrid = $('#qr-deliv-grid');

  function renderDelivList() {
    if (!delivGrid) return;

    const storeId = currentStoreId();
    const list = loadDelivQrList(storeId);

    delivGrid.innerHTML = '';

    if (!list.length) {
      delivGrid.innerHTML = '<div class="small">저장된 QR이 없습니다.</div>';
      return;
    }

    list
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''))
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
          const all = loadAll();
          const next = all.filter((x) => x.id !== q.id);
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

    // 배달/예약 진입 페이지 QR 생성
    delivGenBtn.addEventListener('click', async () => {
      const storeId = currentStoreId();
      const label =
        (delivLabelInput?.value || '').trim() || '배달/예약 주문';

      // ✅ 회원/비회원 선택 진입 페이지로 연결
      const url =
        `${location.origin}/src/order/delivery-entry.html?store=${encodeURIComponent(
          storeId
        )}`;

      try {
        const dataUrl = await makeQRDataUrl(url);

        const item = {
          id: `QR-DELIV-${Date.now()}-${storeId}`,
          kind: 'deliv', // ✅ 배달/예약용
          storeId,
          label,
          url,
          dataUrl,
        };

        const all = loadAll();
        saveAll([...all, item]);
        renderDelivList();
      } catch (e) {
        console.error(e);
        alert('배달/예약 QR 생성 중 오류가 발생했습니다.');
      }
    });

    if (delivClearBtn) {
      delivClearBtn.addEventListener('click', () => {
        if (!confirm('이 매장의 배달/예약 QR을 모두 삭제할까요?')) return;
        const storeId = currentStoreId();
        const all = loadAll();
        const next = all.filter(
          (x) => !(x.storeId === storeId && x.kind === 'deliv')
        );
        saveAll(next);
        renderDelivList();
      });
    }
  }
}

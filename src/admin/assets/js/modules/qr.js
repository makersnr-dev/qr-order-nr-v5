import { patch, get } from './store.js';

const $ = (s, r = document) => r.querySelector(s);

// ===== 매장 식별 =====
function currentStoreId() {
  // admin.js에서 설정한 값 우선
  if (window.qrnrStoreId) return window.qrnrStoreId;

  // 없으면 URL ?store= 참고
  try {
    const u = new URL(location.href);
    return u.searchParams.get('store') || 'store1';
  } catch (e) {
    return 'store1';
  }
}

// 공통 저장 위치 (2단계만 사용) : ['admin', 'qrList']
const PATH = ['admin', 'qrList'];

function ensureList() {
  const cur = get(PATH);
  if (Array.isArray(cur)) return cur;
  patch(PATH, () => []);
  return [];
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
  const tableInput = $('#qr-table');
  const labelInput = $('#qr-label');
  const genBtn = $('#qr-generate');
  const clearBtn = $('#qr-clear');
  const grid = $('#qr-grid');

  if (!grid || !tableInput || !genBtn) return;

  ensureList();
  renderList();

  // QR 생성 & 저장
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
        storeId,
        table,
        label,
        url,
        dataUrl,
      };

      // qrList 전체 중에서 같은 매장+테이블 것은 교체
      patch(PATH, (list) => {
        list = Array.isArray(list) ? list : [];
        const filtered = list.filter(
          (x) => !(x.storeId === storeId && x.table === table)
        );
        return [...filtered, item];
      });

      renderList();
    } catch (e) {
      console.error(e);
      alert('QR 생성 중 오류가 발생했습니다.');
    }
  });

  // 현재 매장 QR 전체 삭제
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!confirm('이 매장의 저장된 QR을 모두 삭제할까요?')) return;
      patch(PATH, (list) => {
        list = Array.isArray(list) ? list : [];
        // 이 매장(storeId) 것만 제거
        return list.filter((x) => x.storeId !== currentStoreId());
      });
      renderList();
    });
  }

  // ===== 리스트 렌더 =====
  function renderList() {
    if (!grid) return;

    const all = get(PATH) || [];
    const storeId = currentStoreId();

    // 현재 매장 QR만 필터링
    const list = all.filter((q) => q.storeId === storeId);

    grid.innerHTML = '';

    if (!list.length) {
      grid.innerHTML = '<div class="small">저장된 QR이 없습니다.</div>';
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
        patch(PATH, (list) =>
          (list || []).filter((x) => x.id !== q.id)
        );
        renderList();
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
}

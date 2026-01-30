// /src/admin/assets/js/modules/qr.js
import { showToast } from '../admin.js';

const $ = (s, r = document) => r.querySelector(s);

// ===== 매장 식별 =====
function currentStoreId() {
    const storeId = window.qrnrStoreId;
    if (!storeId) {
        showToast('매장 정보가 초기화되지 않았습니다.', 'error');
        throw new Error('STORE_ID_NOT_INITIALIZED');
    }
    return storeId;
}

// ===== [DB 연동] 데이터 통신 함수들 =====
async function loadQrListFromServer(storeId) {
    try {
        const res = await fetch(`/api/qrcodes?storeId=${storeId}`);
        const data = await res.json();
        return data.list || [];
    } catch (e) {
        console.error(e);
        showToast('QR 목록을 불러오지 못했습니다.', 'error');
        return [];
    }
}

async function saveQrToDB(storeId, qrData) {
    // 🚀 서버 API 호출 (제한 로직은 서버 api/qrcodes.js에서 처리함)
    return await fetch(`/api/qrcodes?storeId=${storeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(qrData)
    });
}

// ===== QR 코드 생성 (qrcodejs) =====
function makeQRDataUrl(text) {
    return new Promise((resolve, reject) => {
        try {
            if (!window.QRCode) return reject(new Error('QRCode 전역 객체가 없습니다.'));

            const wrap = document.createElement('div');
            wrap.style.position = 'fixed'; wrap.style.left = '-9999px'; wrap.style.top = '-9999px';
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
                    let dataUrl = canvas ? canvas.toDataURL('image/png') : (img ? img.src : null);
                    document.body.removeChild(wrap);
                    if (!dataUrl) throw new Error('QR 이미지를 생성하지 못했습니다.');
                    resolve(dataUrl);
                } catch (e) {
                    if (wrap.parentNode) document.body.removeChild(wrap);
                    reject(e);
                }
            }, 100);
        } catch (e) { reject(e); }
    });
}

// ===== 초기화 및 렌더링 =====
export async function initQR() {
    const storeId = currentStoreId();

    const tableInput = $('#qr-table');
    const labelInput = $('#qr-label');
    const genBtn = $('#qr-generate');
    const clearBtn = $('#qr-clear');
    const grid = $('#qr-grid');

    const delivLabelInput = $('#qr-deliv-label');
    const delivGenBtn = $('#qr-deliv-generate');
    const delivClearBtn = $('#qr-deliv-clear');
    const delivGrid = $('#qr-deliv-grid');

    // ── 리스트 새로고침 함수 ──
    async function refreshAllLists() {
        const all = await loadQrListFromServer(storeId);
        
        // 1) 매장 테이블용 렌더
        if (grid) {
            const storeList = all.filter(q => q.kind === 'store' || !q.kind);
            renderItems(grid, storeList, 'table');
        }
        // 2) 배달/예약용 렌더
        if (delivGrid) {
            const delivList = all.filter(q => q.kind === 'deliv');
            renderItems(delivGrid, delivList, 'delivery');
        }
    }

    function renderItems(targetGrid, list, downloadPrefix) {
        targetGrid.innerHTML = '';
        if (!list.length) {
            targetGrid.innerHTML = '<div class="small">저장된 QR이 없습니다.</div>';
            return;
        }

        list.sort((a, b) => (a.table || '').localeCompare(b.table || '')).forEach((q) => {
            const wrap = document.createElement('div');
            wrap.className = 'vstack';
            wrap.style.cssText = 'gap:4px; alignItems:center; border:1px solid #263241; padding:8px; borderRadius:10px; background:#0b1620; text-align:center;';

            wrap.innerHTML = `
                <img src="${q.dataUrl}" style="width:140px; height:140px; border-radius:4px;">
                <div class="small"><b>${q.label}</b> ${q.table ? `(${q.table}번)` : ''}</div>
                <div class="small" style="word-break:break-all; color:var(--muted); font-size:10px; max-width:140px;">${q.url}</div>
                <div class="hstack" style="gap:4px; margin-top:5px; justify-content:center;">
                    <a href="${q.dataUrl}" download="${downloadPrefix}-${q.table || 'qr'}.png" class="btn small">다운</a>
                    <button class="btn small danger" data-id="${q.id}">삭제</button>
                </div>
            `;

            wrap.querySelector('.danger').onclick = async () => {
                if (!confirm('삭제할까요?')) return;
                const res = await fetch(`/api/qrcodes?storeId=${storeId}&id=${q.id}`, { method: 'DELETE' });
                if (res.ok) {
                    showToast('QR 코드가 삭제되었습니다.', 'success');
                    refreshAllLists();
                }
            };
            targetGrid.appendChild(wrap);
        });
    }

    // ── 1) 매장 QR 생성 ──
    if (genBtn) {
        genBtn.onclick = async () => {
            const table = (tableInput.value || '').trim();
            const label = (labelInput.value || '').trim() || `${table}번 테이블`;
            if (!table) return showToast('테이블 번호를 입력하세요.', 'info');

            const url = `${location.origin}/order/store?store=${encodeURIComponent(storeId)}&table=${encodeURIComponent(table)}`;
            
            try {
                const dataUrl = await makeQRDataUrl(url);
                const qrItem = { id: `QR-${Date.now()}-${table}`, kind: 'store', table, label, url, dataUrl };
                
                const res = await saveQrToDB(storeId, qrItem);
                const result = await res.json();

                if (res.ok) {
                    showToast(`✅ ${table}번 QR 생성 완료`, 'success');
                    tableInput.value = ''; labelInput.value = '';
                    refreshAllLists();
                } else {
                    // 🚀 [제한 체크] 서버에서 보낸 "최대 10개..." 메시지를 그대로 토스트로 띄움
                    showToast(result.message || '생성 실패', 'error');
                }
            } catch (e) {
                showToast('QR 생성 중 오류가 발생했습니다.', 'error');
            }
        };
    }

    // ── 2) 배달/예약 QR 생성 ──
    if (delivGenBtn) {
        delivGenBtn.onclick = async () => {
            const label = (delivLabelInput.value || '').trim() || '배달/예약 주문';
            const url = `${location.origin}/src/order/delivery-entry.html?store=${encodeURIComponent(storeId)}`;
            
            try {
                const dataUrl = await makeQRDataUrl(url);
                const qrItem = { id: `QR-DELIV-${Date.now()}`, kind: 'deliv', label, url, dataUrl };
                
                const res = await saveQrToDB(storeId, qrItem);
                const result = await res.json();

                if (res.ok) {
                    showToast('✅ 배달/예약용 QR 생성 완료', 'success');
                    delivLabelInput.value = '';
                    refreshAllLists();
                } else {
                    showToast(result.message || '생성 실패', 'error');
                }
            } catch (e) {
                showToast('QR 생성 실패', 'error');
            }
        };
    }

    // ── 전체 삭제 버튼 ──
    if (clearBtn) {
        clearBtn.onclick = async () => {
            if (!confirm('매장 테이블용 QR을 모두 삭제할까요?')) return;
            const res = await fetch(`/api/qrcodes?storeId=${storeId}&kind=store`, { method: 'DELETE' });
            if (res.ok) {
                showToast('매장 QR이 모두 삭제되었습니다.', 'success');
                refreshAllLists();
            }
        };
    }
    if (delivClearBtn) {
        delivClearBtn.onclick = async () => {
            if (!confirm('배달/예약용 QR을 모두 삭제할까요?')) return;
            const res = await fetch(`/api/qrcodes?storeId=${storeId}&kind=deliv`, { method: 'DELETE' });
            if (res.ok) {
                showToast('배달 QR이 모두 삭제되었습니다.', 'success');
                refreshAllLists();
            }
        };
    }

    // 초기 로드
    refreshAllLists();
}

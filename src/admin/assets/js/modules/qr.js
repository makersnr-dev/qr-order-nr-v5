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

    // [보완] 이미 이벤트가 걸려있다면 다시 걸지 않도록 방어
    if (grid && grid.dataset.eventBound === 'true') {
        refreshAllLists(); // 리스트만 갱신하고 종료
        return;
    }

    // ── [추가된 부분] 이벤트 위임용 공통 처리 함수 ──
    const handleGridClick = async (e) => {
        const btn = e.target.closest('button');
        // 클릭된 게 버튼이 아니거나, 삭제 버튼(data-act="del")이 아니면 무시
        if (!btn || btn.dataset.act !== 'del') return; 

        // 버튼 상위의 .qr-card에서 ID를 가져옴
        const qId = btn.closest('.qr-card')?.dataset.id; 
        if (!qId || !confirm('삭제할까요?')) return;

        const res = await fetch(`/api/qrcodes?storeId=${storeId}&id=${qId}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('QR 코드가 삭제되었습니다.', 'success');
            refreshAllLists(); // 리스트 새로고침
        }
    };

    // ── [추가된 부분] 부모 그리드에 딱 한 번만 이벤트 바인딩 ──
    // 이렇게 부모에 걸어두면 innerHTML로 자식들이 계속 바뀌어도 이벤트가 유지됩니다.
    if (grid) {
        grid.addEventListener('click', handleGridClick);
        grid.dataset.eventBound = 'true'; // 플래그 설정
    }
    if (delivGrid) {
        delivGrid.addEventListener('click', handleGridClick);
        delivGrid.dataset.eventBound = 'true'; // 플래그 설정
    }

    // ── 리스트 새로고침 함수 ──
    async function refreshAllLists() {
        const all = await loadQrListFromServer(storeId);
        
        // 1) 매장 테이블용 렌더
        if (grid) {
            const storeList = all.filter(q => q.kind === 'store' || !q.kind);
            renderItems(grid, storeList, 'table');
        }
        // 2) 예약용 렌더
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
        wrap.className = 'vstack qr-card'; // [수정] 식별용 클래스 추가
        wrap.dataset.id = q.id;           // [추가] 삭제를 위한 ID 저장
        wrap.style.cssText = `display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; border:1px solid #263241; padding:16px; border-radius:12px; background:#0b1620; text-align:center; width:100%;`;

        wrap.innerHTML = `
            <img src="${q.dataUrl}" style="width:140px; height:140px; border-radius:4px; display: block; margin: 0 auto;">
            <div class="small" style="width:100%; font-weight:bold; color:#fff;">
                ${q.label} ${q.table ? `(${q.table}번)` : ''}
            </div>
            <div class="small" style="word-break:break-all; color:var(--muted); font-size:10px; width:100%; max-width:160px;">
                ${q.url}
            </div>
            <div class="hstack" style="gap:4px; margin-top:6px; justify-content:center; width:100%;">
                <a href="${q.dataUrl}" download="${downloadPrefix}-${q.table || 'qr'}.png" class="btn small">다운</a>
                <button class="btn small danger" data-act="del">삭제</button> 
            </div>
        `;
        // [삭제] wrap.querySelector('.danger').onclick = ... (개별 이벤트 삭제)
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
            genBtn.disabled = true;
            
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
            console.error(e);
            showToast('QR 생성 중 오류가 발생했습니다.', 'error');
        } finally {
            genBtn.disabled = false; // 성공/실패 여부와 상관없이 마지막에 활성화
        }
        };
    }
    // ── 2) 예약 QR 생성 ──
    if (delivGenBtn) {
        delivGenBtn.onclick = async () => {
            const label = (delivLabelInput.value || '').trim() || '예약 주문';
            const url = `${location.origin}/src/order/delivery-entry.html?store=${encodeURIComponent(storeId)}`;
            delivGenBtn.disabled = true;
            try {
                const dataUrl = await makeQRDataUrl(url);
                const qrItem = { id: `QR-DELIV-${Date.now()}`, kind: 'deliv', label, url, dataUrl };
                
                const res = await saveQrToDB(storeId, qrItem);
                const result = await res.json();

                if (res.ok) {
                    showToast('✅ 예약용 QR 생성 완료', 'success');
                    delivLabelInput.value = '';
                    refreshAllLists();
                } else {
                    showToast(result.message || '생성 실패', 'error');
                }
            } catch (e) {
                console.error(e);
                showToast('QR 생성 실패', 'error');
            }finally {
            delivGenBtn.disabled = false; // 성공/실패 여부와 상관없이 마지막에 활성화
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
            if (!confirm('예약용 QR을 모두 삭제할까요?')) return;
            const res = await fetch(`/api/qrcodes?storeId=${storeId}&kind=deliv`, { method: 'DELETE' });
            if (res.ok) {
                showToast('예약 QR이 모두 삭제되었습니다.', 'success');
                refreshAllLists();
            }
        };
    }

    // 초기 로드
    refreshAllLists();
}

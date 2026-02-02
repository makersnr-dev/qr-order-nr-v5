// /src/order/assets/js/modules/cust-store.js

/**
 * URL 파라미터나 로컬 스토리지에서 현재 storeId를 추출합니다.
 */
export function currentStoreId() {
    const u = new URL(location.href);
    let sid = u.searchParams.get('store');

    if (sid) {
        localStorage.setItem('qrnr.storeId', sid);
        return sid;
    }

    sid = localStorage.getItem('qrnr.storeId');
    if (sid) return sid;

    // 만약 둘 다 없다면 기본값 (또는 에러 처리)
    console.error('[cust-store] 매장 ID를 찾을 수 없습니다.');
    return 'store1'; 
}

/**
 * [DB 연동] 서버에서 매장의 상세 정보(이름, 상태 등)를 가져옵니다.
 */
export async function loadStoreInfo() {
    const sid = currentStoreId();
    try {
        // 매장 목록 API에서 현재 매장 정보만 쏙 골라옵니다.
        const res = await fetch(`/api/stores?storeId=${sid}`);
        if (!res.ok) throw new Error('STORE_NOT_FOUND');
        
        const data = await res.json();
        const store = data.stores?.[sid] || data.store;
        
        if (!store) throw new Error('STORE_DATA_EMPTY');
        
        return {
            id: sid,
            name: store.name || '우리동네 매장',
            code: store.code || '0000',
            active: store.active !== false,
            // 추가로 DB에 저장된 설정값들이 있다면 여기서 합쳐줍니다.
            ...store
        };
    } catch (e) {
        console.error('[cust-store] 매장 정보 로드 실패:', e);
        return { id: sid, name: '정보 없음', active: false };
    }
}

/**
 * 화면 상단 헤더 등에 매장 이름을 뿌려줍니다.
 */
export async function renderStoreHeader() {
    const info = await loadStoreInfo();
    const nameEl = document.getElementById('store-name-display');
    const statusEl = document.getElementById('store-status-display');

    if (nameEl) nameEl.textContent = info.name;
    
    if (statusEl) {
        if (!info.active) {
            statusEl.textContent = '● 영업 준비중';
            statusEl.style.color = '#ef4444';
        } else {
            statusEl.textContent = '● 영업중';
            statusEl.style.color = '#2ea043';
        }
    }
    
    // 페이지 타이틀도 매장명으로 변경
    document.title = `${info.name}`;
}

export const get = loadStoreInfo;


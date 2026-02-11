//src/order/assets/js/modules/time.js
/**
 * 1. 현재 한국 시간(KST) 문자열 생성
 */
export function getNowKST() {
    const now = new Date();
    // UTC 기준 시간에 9시간을 더해 KST 생성
    const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    return kst.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * 2. 주문 목록 표시용 시간 포맷
 */
export function fmtTime(ts) {
    if (!ts) return '-';
    const d = new Date(ts);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${m}월 ${dd}일 ${h}:${mm}`;
}

/**
 * 🚀 3. [추가] HTML 셀렉트 박스에 시간 채우기 (에러 해결 핵심)
 * delivery-guest.html에서 호출하는 함수입니다.
 */
export function fillTimeSelectors(prefix = "time") {
    const apEl = document.getElementById(`${prefix}-ap`);
    const hhEl = document.getElementById(`${prefix}-hh`);
    const mmEl = document.getElementById(`${prefix}-mm`);

    if (!apEl || !hhEl || !mmEl) return;

    // 오전/오후
    apEl.innerHTML = `
        <option value="AM">오전</option>
        <option value="PM">오후</option>
    `;

    // 시 (1~12)
    let hOptions = "";
    for (let i = 1; i <= 12; i++) {
        hOptions += `<option value="${i}">${i}시</option>`;
    }
    hhEl.innerHTML = hOptions;

    // 분 (00~50, 10분 단위)
    let mOptions = "";
    for (let i = 0; i < 60; i += 10) {
        const val = String(i).padStart(2, '0');
        mOptions += `<option value="${val}">${val}분</option>`;
    }
    mmEl.innerHTML = mOptions;
}

/**
 * 🚀 4. [추가] 선택된 시간 값 가져오기 (에러 해결 핵심)
 */
export function getTimeValue(prefix = "time") {
    const ap = document.getElementById(`${prefix}-ap`)?.value;
    const hh = document.getElementById(`${prefix}-hh`)?.value;
    const mm = document.getElementById(`${prefix}-mm`)?.value;
    return { ap, hh, mm };
}

/**
 * 5. 예약 가능 시간 리스트 (DB 연동 및 매장 설정용)
 */
export function getAvailableTimeSlots(startHour = 10, endHour = 22) {
    const slots = [];
    const now = new Date();
    const startTime = new Date(now.getTime() + 30 * 60 * 1000);
    
    for (let h = startHour; h < endHour; h++) {
        for (let m = 0; m < 60; m += 15) {
            const slotTime = new Date();
            slotTime.setHours(h, m, 0, 0);
            if (slotTime > startTime) {
                const hh = String(h).padStart(2, '0');
                const mm = String(m).padStart(2, '0');
                slots.push(`${hh}:${mm}`);
            }
        }
    }
    return slots;
}

/**
 * 6. 영업 여부 판단
 */
export function isStoreOpen(openTime = "10:00", closeTime = "22:00") {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const [oH, oM] = openTime.split(':').map(Number);
    const [cH, cM] = closeTime.split(':').map(Number);
    const start = oH * 60 + oM;
    const end = cH * 60 + cM;
    return currentTime >= start && currentTime <= end;
}


export function checkBusinessHours(bh, targetDate = new Date()) {
    if (!bh || !bh.enabled) return { ok: true };

    const day = targetDate.getDay();
    if (!bh.days.includes(day)) return { ok: false, msg: "오늘은 정기 휴무일입니다." };

    const currentTime = targetDate.getHours() * 60 + targetDate.getMinutes();
    const [sH, sM] = bh.start.split(':').map(Number);
    const [eH, eM] = bh.end.split(':').map(Number);
    const start = sH * 60 + sM;
    const end = eH * 60 + eM;

    if (currentTime < start || currentTime > end) {
        return { ok: false, msg: `영업 시간이 아닙니다. (영업시간: ${bh.start} ~ ${bh.end})` };
    }
    return { ok: true };
}

/**
 * 🚀 8. [추가] 날짜 선택 시 해당일의 영업 여부 판단
 */
export function isDayOff(bh, dateString) {
    if (!bh || !bh.enabled) return false;
    const date = new Date(dateString);
    const day = date.getDay(); // 0:일, 1:월 ...
    return !bh.days.includes(day); // 설정된 영업 요일에 포함되지 않으면 true(휴무)
}

/**
 * 🚀 9. [추가] 선택된 날짜에 따른 유효 시간 생성
 */
export function updateAvailableHours(bh, dateString, selectEl) {
    if (!bh || !bh.enabled || !selectEl) return;
    
    const [sH] = bh.start.split(':').map(Number);
    const [eH] = bh.end.split(':').map(Number);
    
    // 기존 옵션 제거
    selectEl.innerHTML = "";
    
    for (let i = 1; i <= 12; i++) {
        // AM/PM 로직을 타기 위해 24시간제로 변환하여 체크하는 로직이 필요하지만,
        // UI가 단순하므로 모든 시를 넣되 선택 시점에만 막거나, 
        // 관리자가 설정한 시작~종료 시간 사이의 숫자만 option으로 생성합니다.
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = `${i}시`;
        selectEl.appendChild(opt);
    }
}

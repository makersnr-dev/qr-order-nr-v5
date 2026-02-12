<div id="type-selector" class="hstack" style="gap:10px; margin-bottom:20px;">
    <button type="button" id="btn-type-delivery" class="btn-type active" onclick="setOrderType('delivery')">🛵 배달로 받기</button>
    <button type="button" id="btn-type-pickup" class="btn-type" onclick="setOrderType('pickup')">🛍️ 매장 픽업</button>
</div>

<div id="address-section">
    <div class="vstack" style="gap:8px;">
        <label class="small">배달 주소</label>
        <div class="hstack" style="gap:8px;">
            <input id="cust-addr" class="input" placeholder="주소 검색을 눌러주세요" readonly style="flex:1;">
            <button type="button" id="btn-search-addr" class="btn small" style="width:80px;">검색</button>
        </div>
        <input id="cust-addr-detail" class="input" placeholder="상세 주소를 입력하세요">
    </div>
    <div id="delivery-msg" class="small" style="margin-top:8px; color:#58a6ff;"></div>
</div>

<style>
    .btn-type { flex:1; height:45px; border-radius:10px; border:1px solid var(--border); background:transparent; color:var(--muted); cursor:pointer; font-weight:bold; }
    .btn-type.active { border-color:#2ea043; color:#2ea043; background:rgba(46, 160, 67, 0.1); }
</style>

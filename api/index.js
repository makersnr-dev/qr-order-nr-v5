import { query, queryOne } from './_lib/db.js';
import { verifyJWT, signJWT } from '../src/shared/jwt.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const ipMap = new Map(); // 🛡️ 주문 폭탄 방지용
const menuCache = new Map();
const settingsCache = new Map();

export default async function handler(req, res) {
    const json = (body, status = 200) => {
        if (!res.headersSent) {
            res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
            return res.send(JSON.stringify(body));
        }
    };

    const method = req.method;
    const headers = req.headers;

    // 🛡️ [추가] Body Size 제한 (200KB)
    // 이미지는 Supabase 직접 업로드이므로, 서버로는 텍스트 데이터만 들어옵니다.
    const contentLen = parseInt(headers['content-length'] || '0');
    if (contentLen > 204800) { // 200 * 1024 = 204,800 bytes
        return json({ ok: false, message: '요청 데이터가 너무 큽니다. (최대 200KB)' }, 413);
    }

    // 1. Body 파싱 (순서 교정: ReferenceError 방지)
    let parsedBody = req.body;
    if (!parsedBody && (method === 'POST' || method === 'PUT')) {
        try {
            const buffers = [];
            for await (const chunk of req) { buffers.push(chunk); }
            const data = Buffer.concat(buffers).toString();
            parsedBody = data ? JSON.parse(data) : {};
        } catch (e) { parsedBody = {}; }
    }
    const safeBody = parsedBody || {};
    
    const url = new URL(req.url, `http://${headers.host}`);
    const pathname = url.pathname;
    const params = url.searchParams;
    const storeId = params.get('storeId') || safeBody.storeId;

    if (pathname === '/api/orders/lookup' || pathname.endsWith('/lookup')) {
        return await handleLookup(req, res, safeBody, url.searchParams);
    }

    async function hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    const getAuth = async () => {
        const cookieHeader = headers.cookie || '';
        const cookies = Object.fromEntries(cookieHeader.split(';').map(c => c.trim().split('=')));
        const isSuperPath = pathname.startsWith('/api/super-') || pathname.startsWith('/api/admin/');
        let token = isSuperPath ? cookies['super_token'] : (cookies['admin_token'] || cookies['super_token']);
        if (!token) return null;
        try {
            return await verifyJWT(token, process.env.JWT_SECRET);
        } catch (e) { return null; }
    };

    try {
        if (pathname === '/api/config') return json({ supabaseUrl: process.env.SUPABASE_URL, supabaseKey: process.env.SUPABASE_ANON_KEY });
        if (pathname === '/api/test') return json({ ok: true, message: "연결 성공!" });
        if (pathname === '/api/check-time') return json({ ok: true, serverTime: new Date(Date.now() + 9 * 60 * 60 * 1000) });

        // --- 1. 슈퍼 관리자 전용 로직 ---
        if (pathname === '/api/super-login') {
            const { uid, pwd } = safeBody;
            const superAdmins = JSON.parse(process.env.SUPER_ADMINS_JSON || '[]');
            const found = superAdmins.find(a => a.id === uid && a.pw === pwd);
            if (found) {
                const token = await signJWT({ realm: 'super', uid, isSuper: true }, process.env.JWT_SECRET , 86400); // 🚀 만료시간 추가
                res.setHeader('Set-Cookie', `super_token=${token}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax`);
                return json({ ok: true, token });
            }
            return json({ ok: false }, 401);
        }
        if (pathname === '/api/super-me') {
            const auth = await getAuth();
            return auth?.realm === 'super' ? json({ ok: true, isSuper: true, superId: auth.uid }) : json({ ok: false }, 401);
        }
        if (pathname === '/api/super-logout') {
            res.setHeader('Set-Cookie', `super_token=; Path=/; Max-Age=0; HttpOnly; Path=/`);
            return json({ ok: true });
        }

        // --- 2. 매장/매핑 관리 (과거 코드 기능 100% 이식) ---
        if (pathname === '/api/stores' || pathname === '/api/admin-mappings') {
            const auth = await getAuth();
            if (pathname === '/api/stores' && method === 'GET') {
                const r = await query('SELECT store_id, code FROM admin_stores ORDER BY created_at DESC');
                const stores = {};
                r.rows.forEach(s => { stores[s.store_id] = { name: s.store_id + " 매장", code: s.code }; });
                return json({ ok: true, stores });
            }
            if (auth?.realm !== 'super') return json({ ok: false }, 403);
            if (method === 'GET') {
                const r = await query('SELECT admin_key, store_id, code, note FROM admin_stores ORDER BY created_at DESC');
                return json({ ok: true, mappings: r.rows || [] });
            }
            if (method === 'DELETE') {
                await query('DELETE FROM admin_stores WHERE admin_key = $1 AND store_id = $2', [safeBody.adminKey, safeBody.storeId]);
                return json({ ok: true });
            }
            const { adminKey, storeId, code, note } = safeBody;
            await query(`INSERT INTO admin_stores (admin_key, store_id, code, note) VALUES ($1, $2, $3, $4) ON CONFLICT (admin_key, store_id) DO UPDATE SET code = EXCLUDED.code, note = EXCLUDED.note`, [adminKey, storeId, code, note]);
            return json({ ok: true });
        }

        // --- 3. 매장 설정 (COALESCE 보존 로직 유지) ---
        if (pathname === '/api/store-settings') {
            if (method === 'GET') {
                // 🚀 1. 캐시 확인 (5분 유지)
                const now = Date.now();
                const cached = settingsCache.get(storeId);
                if (cached && now < cached.expire) {
                    return json({ ok: true, settings: cached.data, cached: true });
                }

                const r = await queryOne('SELECT owner_bank, privacy_policy, notify_config, call_options, business_hours, delivery_config FROM store_settings WHERE store_id = $1', [storeId]);
                const settings = r || {};
                if (typeof settings.owner_bank === 'string') try { settings.owner_bank = JSON.parse(settings.owner_bank); } catch (e) { }
                if (typeof settings.notify_config === 'string') try { settings.notify_config = JSON.parse(settings.notify_config); } catch (e) { }
                if (typeof settings.call_options === 'string') try { settings.call_options = JSON.parse(settings.call_options); } catch (e) { }
                if (typeof settings.business_hours === 'string') try { settings.business_hours = JSON.parse(settings.business_hours); } catch (e) { }
                if (typeof settings.delivery_config === 'string') try { settings.delivery_config = JSON.parse(settings.delivery_config); } catch (e) { }
                
                // 🚀 2. 캐시 저장 (5분 = 300,000ms)
                settingsCache.set(storeId, { data: settings, expire: now + 300000 });

                return json({ ok: true, settings });
            }
            if (method === 'PUT') {
                settingsCache.delete(storeId);
                const { ownerBank, privacyPolicy, notifyConfig, callOptions, businessHours, deliveryConfig } = safeBody;
                const b = ownerBank ? JSON.stringify(ownerBank) : null;
                const n = notifyConfig ? JSON.stringify(notifyConfig) : null;
                const c = callOptions ? JSON.stringify(callOptions) : null;
                const bh = businessHours ? JSON.stringify(businessHours) : null; // 추가
                const dc = deliveryConfig ? JSON.stringify(deliveryConfig) : null; // 🚀 추가
                
                await query(`INSERT INTO store_settings (store_id, owner_bank, privacy_policy, notify_config, call_options, business_hours, delivery_config) 
                            VALUES ($1, $2, $3, $4, $5, $6, $7) 
                            ON CONFLICT (store_id) DO UPDATE SET 
                            owner_bank=COALESCE($2, store_settings.owner_bank), 
                            privacy_policy=COALESCE($3, store_settings.privacy_policy), 
                            notify_config=COALESCE($4, store_settings.notify_config), 
                            call_options=COALESCE($5, store_settings.call_options),
                            business_hours=COALESCE($6, store_settings.business_hours),
                            delivery_config=COALESCE($7, store_settings.delivery_config)`, // 🚀 추가
                            [storeId, b, privacyPolicy, n, c, bh, dc]); // 🚀 파라미터 $7 추가
                return json({ ok: true });
            }
        }

        // --- 4. 메뉴 관리 ---
        if (pathname === '/api/menus') {
            if (method === 'GET') {
                const now = Date.now();
                const cached = menuCache.get(storeId);
            
                // 🚀 캐시가 있고 1분(60,000ms)이 안 지났다면 바로 반환! (DB 안 감)
                if (cached && now < cached.expire) {
                    console.log(`⚡ 캐시된 메뉴 반환 (${storeId})`);
                    return json({ ok: true, menus: cached.data });
                }
            
                const r = await query(`
                    SELECT menu_id as id, name, price, category, active, sold_out as "soldOut", 
                           img, description as desc, options 
                    FROM menus 
                    WHERE store_id = $1 
                    ORDER BY menu_id ASC
                `, [storeId]);
                const menus = r.rows || [];
            
                // DB 조회 후 캐시에 저장 (유효기간 1분)
                menuCache.set(storeId, { data: menus, expire: now + 60000 });
                
                return json({ ok: true, menus });
            }
            if (method === 'PUT') {
                menuCache.delete(storeId);
                const items = Array.isArray(safeBody) ? safeBody : [safeBody];
                for (const m of items) {
                    await query(`INSERT INTO menus (store_id, menu_id, name, price, category, active, sold_out, img, description, options) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (store_id, menu_id) DO UPDATE SET name=$3, price=$4, category=$5, active=$6, sold_out=$7, img=$8, description=$9, options=$10`, [storeId, m.id, m.name, m.price, m.category, m.active, m.soldOut, m.img, m.desc, JSON.stringify(m.options || [])]);
                }
                return json({ ok: true });
            }
            if (method === 'DELETE') {
                menuCache.delete(storeId);
                const menuId = params.get('menuId');
                if (!storeId || !menuId) return json({ ok: false, error: 'MISSING_PARAMETERS' }, 400);
                await query('DELETE FROM menus WHERE store_id = $1 AND menu_id = $2', [storeId, menuId]);
                return json({ ok: true });
            }
        }

        // --- 5. 주문 관리 (과거 코드의 복잡한 맵핑 로직 + 보안) ---
        if (pathname === '/api/orders') {
            const auth = await getAuth();
            if (!auth && method !== 'POST') return json({ ok: false }, 401);
            if (method === 'GET') {
                const type = params.get('type');
                const r = (type === 'store') 
                    ? await query('SELECT * FROM orders WHERE store_id = $1 ORDER BY created_at DESC', [storeId])
                    : await query('SELECT * FROM orderss WHERE store_id = $1 ORDER BY created_at DESC', [storeId]);
                const orders = r.rows.map(row => {
                    const meta = typeof row.meta === 'string' ? JSON.parse(row.meta || '{}') : (row.meta || {});
                    
                    // 1. 상품 데이터 소스 통일 (매장은 meta.cart, 예약은 items 컬럼)
                    const items = (type === 'store') 
                        ? (meta.cart || []) 
                        : (typeof row.items === 'string' ? JSON.parse(row.items || '[]') : (row.items || []));

                    // 2. 관리자용 요약 문구 생성 (옵션 포함 + 외 n건)
                    let displaySummary = '상품 없음';
                    if (items.length > 0) {
                        const first = items[0];
                        
                        // 1. 옵션 데이터 추출 (예약/매장 통합 대응)
                        let rawOpts = first.optionText || first.options || [];
                        if (typeof rawOpts === 'string') try { rawOpts = JSON.parse(rawOpts); } catch(e) { rawOpts = []; }
                        
                        // 2. 옵션 텍스트 생성 (최대 1개 노출 + '외 n')
                        let optText = '';
                        if (rawOpts.length > 0) {
                            // 첫 번째 옵션 이름만 추출 (예: "샷추가")
                            const firstOpt = typeof rawOpts[0] === 'string' ? rawOpts[0].split(':').pop() : (rawOpts[0].label || rawOpts[0].name);
                            
                            // 옵션이 2개 이상이면 '외 n' 표시 (옵션임을 명시)
                            if (rawOpts.length > 1) {
                                optText = ` [${firstOpt} 외 ${rawOpts.length - 1}]`;
                            } else {
                                optText = ` [${firstOpt}]`;
                            }
                        }
                    
                        // 3. 전체 요약 구성
                        displaySummary = `${first.name} x ${first.qty}${optText}`;
                        
                        // 4. 다른 메뉴가 더 있다면 '외 n건' (메뉴임을 명시)
                        if (items.length > 1) {
                            displaySummary += ` 외 ${items.length - 1}건`;
                        }
                    }

                    // 3. 기존 필드 유지 + displaySummary 추가
                    if (type === 'store') {
                        return { ...row, orderId: row.order_no, cart: items, displaySummary, ts: new Date(row.created_at).getTime() };
                    } else {
                        return { 
                            ...row, 
                            orderId: row.order_no, 
                            amount: row.total_amount, 
                            //items, 
                            cart: items, 
                            displaySummary, // 요약 필드 추가
                            customer: { name: row.customer_name, phone: row.customer_phone, addr: row.address }, 
                            reserve: meta.reserve || {}, 
                            requestMsg: meta.reserve?.note || meta.reserve?.message || meta.memo || '-', 
                            ts: new Date(row.created_at).getTime(), 
                            meta 
                        };
                    }
                });
                return json({ ok: true, orders });
            }
            if (method === 'POST') {
                const ip = headers['x-forwarded-for'] || req.socket?.remoteAddress || '0.0.0.0';
                if (Date.now() - (ipMap.get(ip) || 0) < 10000) return json({ ok: false, message: '주문이 너무 잦습니다.' }, 429);
                ipMap.set(ip, Date.now());
                if (ipMap.size > 1000) ipMap.clear();

                const { type, table, cart, amount, customer, reserve, agreePrivacy, lookupPw, memberId, meta: clientMeta } = safeBody;
                const newOrderNo = `${storeId}-${type === 'store' ? 'S' : 'R'}-${Date.now()}`;
                if (type === 'store') {
                    await query(`INSERT INTO orders (store_id, order_no, status, table_no, amount, meta) VALUES ($1, $2, '주문접수', $3, $4, $5)`, [storeId, newOrderNo, table, amount, JSON.stringify({ cart, ts: Date.now() })]);
                } else {
                    const newNumericId = parseInt(String(Date.now()).slice(-9)); 
                    await query(`INSERT INTO orderss (order_id, store_id, type, status, customer_name, customer_phone, address, items, total_amount, lookup_pw, order_no, meta) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`, 
                        [
                            newNumericId, 
                            storeId, 
                            'reserve', 
                            '입금 미확인', 
                            customer.name, 
                            customer.phone, 
                            customer.fullAddr, 
                            JSON.stringify(cart), 
                            amount, 
                            lookupPw, 
                            newOrderNo, 
                            JSON.stringify(clientMeta) // 👈 여기서 덮어씌우지 말고 통째로 저장하세요!
                        ]
                    );
                }
                try {
                    await supabase.channel(`qrnr_realtime_${storeId}`).send({ type: 'broadcast', event: 'NEW_ORDER', payload: { orderNo: newOrderNo, orderType: type, table: table || '예약', amount, customerName: customer?.name || '비회원', at: new Date().toISOString() } });
                } catch (err) {}
                return json({ ok: true, orderId: newOrderNo });
            }
            if (method === 'PUT') {
                const { orderId, type, status, meta, metaAppend } = safeBody;
                const tableName = type === 'store' ? 'orders' : 'orderss';
                const idColumn = type === 'store' ? 'order_no' : 'order_id';
                const existing = await queryOne(`SELECT meta FROM ${tableName} WHERE ${idColumn} = $1`, [orderId]);
                if (!existing) return json({ ok: false, error: 'ORDER_NOT_FOUND' }, 404);
                let newMeta = { ...existing.meta, ...meta };
                if (metaAppend?.history) {
                    const history = existing.meta?.history || [];
                    history.push(metaAppend.history);
                    newMeta.history = history;
                }
                if (status) await query(`UPDATE ${tableName} 
                SET status = $1, meta = $2 WHERE ${idColumn} = $3`, [status, JSON.stringify(newMeta), orderId]);
                else await query(`UPDATE ${tableName} 
                SET meta = $1 WHERE ${idColumn} = $2`, [JSON.stringify(newMeta), orderId]);
                try { 
                    await supabase.channel(`qrnr_realtime_${storeId}`).send({ 
                        type: 'broadcast', 
                        event: 'STATUS_CHANGED', 
                        payload: { orderId, status, type } 
                    }); 
                    console.log(`✅ 실시간 상태 변경 신호 전송: ${status} (${storeId})`);
                } catch (err) {
                    console.error("❌ 실시간 신호 전송 실패:", err);
                }
                return json({ ok: true });
            }
            // 🚀 [추가 시작] 비회원 주문 조회를 위한 신규 경로
            /*if (pathname.includes('/api/orders/lookup')) {
                if (method !== 'POST') return json({ ok: false, message: '지원하지 않는 방식입니다.' }, 405);
            
                // 사용자가 입력한 이름, 번호 뒤자리(또는 전체), 비번, 매장ID 추출
                const { name, phone, pw, storeId } = safeBody;
                
                // 필수값 검증
                if (!name || !phone || !pw || !storeId) {
                    return json({ ok: false, message: '조회 정보를 모두 입력해주세요.' }, 400);
                }
            
                try {
                    const cleanPhone = phone.replace(/\D/g, ''); // 숫자만 남김
                    // 이름과 비밀번호가 정확히 일치하고, 전화번호가 해당 숫자로 끝나는 주문 찾기
                    // (orderss 테이블은 예약주문용 테이블입니다)
                    const r = await query(`
                        SELECT order_no, status, total_amount as amount, items, created_at
                        FROM orderss 
                        WHERE store_id = $1 
                          AND customer_name = $2 
                          AND lookup_pw = $4
                          AND REPLACE(customer_phone, '-', '') = $3
                        ORDER BY created_at DESC
                    `, [storeId, name, cleanPhone, pw]);
            
                    const orders = r.rows.map(row => ({
                        id: row.order_no,
                        status: row.status,
                        amount: row.amount,
                        // DB에 저장된 JSON 문자열을 객체로 변환
                        items: typeof row.items === 'string' ? JSON.parse(row.items || '[]') : (row.items || []),
                        ts: new Date(row.created_at).getTime()
                    }));
            
                    return json({ ok: true, orders });
                } catch (err) {
                    console.error("조회 에러:", err);
                    return json({ ok: false, message: '서버 오류가 발생했습니다.' }, 500);
                }
            }*/
        }

        // --- 6. 호출/결제코드/QR (누락 없음) ---
        if (pathname === '/api/call') {
            if (method === 'GET') {
                const r = await query('SELECT id, table_no, message, status, created_at as ts FROM call_logs WHERE store_id = $1 ORDER BY created_at DESC LIMIT 50', [storeId]);
                return json({ ok: true, logs: r.rows });
            }
            if (method === 'POST') {
                await query('INSERT INTO call_logs (store_id, table_no, message, status) VALUES ($1, $2, $3, \'대기\')', [storeId, safeBody.table, safeBody.note]);
                return json({ ok: true });
            }
            if (method === 'PUT') {
                await query('UPDATE call_logs SET status = $1 WHERE id = $2', [safeBody.status, safeBody.id]);
                return json({ ok: true });
            }
        }
        if (pathname === '/api/payment-code') {
            const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
            if (method === 'GET') {
                await query('DELETE FROM payment_codes WHERE store_id = $1 AND date < $2', [storeId, today]);
                let row = await queryOne('SELECT code FROM payment_codes WHERE store_id = $1 AND date = $2', [storeId, today]);
                if (!row) {
                    const newCode = String(Math.floor(1000 + Math.random() * 9000));
                    await query('INSERT INTO payment_codes (store_id, date, code) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [storeId, today, newCode]);
                    row = await queryOne('SELECT code FROM payment_codes WHERE store_id = $1 AND date = $2', [storeId, today]);
                }
                return json({ ok: true, code: row?.code, date: today });
            }
            if (method === 'POST') {
                const nc = String(Math.floor(1000 + Math.random() * 9000));
                await query(`INSERT INTO payment_codes (store_id, date, code) VALUES ($1, $2, $3) ON CONFLICT (store_id, date) DO UPDATE SET code = EXCLUDED.code`, [storeId, today, nc]);
                return json({ ok: true, code: nc, date: today });
            }
        }
        if (pathname === '/api/qrcodes') {
            if (method === 'GET') {
                const r = await query('SELECT id, kind, table_no as "table", label, url, data_url as "dataUrl" FROM qr_codes WHERE store_id = $1 ORDER BY created_at DESC', [storeId]);
                return json({ ok: true, list: r.rows || [] });
            }
            if (method === 'PUT') {
                const { id, kind, table, label, url, dataUrl } = safeBody;
                await query(`INSERT INTO qr_codes (id, store_id, kind, table_no, label, url, data_url, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) ON CONFLICT (id) DO UPDATE SET label=$5, data_url=$7, updated_at=NOW()`, [id, storeId, kind, table, label, url, dataUrl]);
                return json({ ok: true });
            }
            if (method === 'DELETE') {
                const k = params.get('kind'), i = params.get('id');
                if (i) await query('DELETE FROM qr_codes WHERE id = $1 AND store_id = $2', [i, storeId]);
                else if (k) await query('DELETE FROM qr_codes WHERE store_id = $1 AND kind = $2', [storeId, k]);
                return json({ ok: true });
            }
        }

        // --- 7. 관리자 로그인 (환경변수 + DB 통합) ---
        if (pathname === '/api/login-admin') {
            const uid = safeBody.uid || safeBody.id, pwd = safeBody.pwd || safeBody.pw;
            if (!uid || !pwd) return json({ ok: false, message: 'ID와 비밀번호를 입력하세요.' }, 400);
            const admins = JSON.parse(process.env.ADMIN_USERS_JSON || '[]');
            const envFound = admins.find(a => a.id === uid && a.pw === pwd);
            if (envFound) {
                const map = await queryOne('SELECT store_id FROM admin_stores WHERE admin_key = $1', [uid]);
                const sid = map?.store_id || 'store1';
                const token = await signJWT({ realm: 'admin', uid, storeId: sid }, process.env.JWT_SECRET , 86400);
                res.setHeader('Set-Cookie', `admin_token=${token}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax`);
                return json({ ok: true, token, storeId: sid });
            }

            // B. DB 확인 (JOIN으로 한 번에 가져오기)
            const pwHash = await hashPassword(pwd);
            const queryText = `
                SELECT a.id, a.name, a.role, a.is_active, m.store_id
                FROM admins a
                LEFT JOIN admin_store_mapping m ON a.id = m.admin_id
                WHERE a.id = $1 AND a.pw_hash = $2
            `;
            const dbResult = await query(queryText, [uid, pwHash]);

            if (dbResult.rows.length > 0) {
                const rows = dbResult.rows;
                const firstRow = rows[0];

                // 1. 비활성화 계정 체크 (기존 기능)
                if (!firstRow.is_active) return json({ ok: false, message: "비활성화된 계정입니다." }, 403);

                // 2. 매장 목록 생성 (기존 mappings.rows.map 로직 통합)
                const stores = rows
                    .filter(r => r.store_id) // 매장이 연결된 경우만
                    .map(r => ({ storeId: r.store_id, storeName: r.store_id + " 매장" }));

                // 3. 기본 매장 ID 결정 (기존 sid 로직)
                const sid = stores.length > 0 ? stores[0].storeId : 'store1';
                
                // 4. 토큰 발급 및 쿠키 설정 (기존 signJWT 로직)
                const token = await signJWT(
                    { realm: 'admin', uid, storeId: sid, role: firstRow.role }, 
                    process.env.JWT_SECRET , 
                    86400
                );

                res.setHeader('Set-Cookie', `admin_token=${token}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax`);
                
                // 5. 최종 응답 (기존 admin 객체 포함 데이터 반환)
                return json({ 
                    ok: true, 
                    token, 
                    storeId: sid, 
                    admin: { id: firstRow.id, name: firstRow.name, stores } 
                });
            }

            // 로그인 실패 시 (기존 기능)
            return json({ ok: false, message: '로그인 정보가 틀렸습니다.' }, 401);
            }
            
            

        // --- 8. 관리자 관리 API ---
        if (pathname.startsWith('/api/admin/')) {
            const auth = await getAuth();
            if (auth?.realm !== 'super') return json({ ok: false }, 403);
            if (pathname === '/api/admin/register' && method === 'POST') {
                const { id, password, name, storeId, role = 'admin' } = safeBody;
                await query(`INSERT INTO admins (id, pw_hash, name, role, is_active) VALUES ($1, $2, $3, $4, true) ON CONFLICT (id) DO UPDATE SET pw_hash=$2, name=$3`, [id, await hashPassword(password), name, role]);
                if (storeId) await query(`INSERT INTO admin_store_mapping (admin_id, store_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, storeId]);
                return json({ ok: true });
            }
            if (pathname === '/api/admin/list-admins' && method === 'GET') return json({ ok: true, admins: (await query(`SELECT id, name FROM admins`)).rows });
            if (pathname === '/api/admin/add-mapping' && method === 'POST') {
                const { adminId, storeId, note } = safeBody;
                await query(`INSERT INTO admin_store_mapping (admin_id, store_id, note) VALUES ($1, $2, $3) ON CONFLICT (admin_id, store_id) DO UPDATE SET note=EXCLUDED.note`, [adminId, storeId, note]);
                return json({ ok: true });
            }
            if (pathname === '/api/admin/delete-admin' && method === 'POST') {
                await query(`DELETE FROM admins WHERE id = $1`, [safeBody.adminId]);
                return json({ ok: true });
            }
        
        }

        if (pathname === '/api/me' || pathname === '/api/verify') {
            const auth = await getAuth();
            return auth ? json({ ok: true, ...auth }) : json({ ok: false }, 401);
        }

        return json({ error: 'NOT_FOUND' }, 404);
    } catch (e) {
        console.error(e);
        return json({ ok: false, error: e.message }, 500);
    }
}

// 🚀 [추가] 조회 전용 함수를 handler 바깥으로 완전히 뺍니다.
async function handleLookup(req, res, safeBody, params) {
    const sendJson = (body, status = 200) => {
        res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.send(JSON.stringify(body));
    };

    const { name, phone, pw } = safeBody;
    const storeId = params.get('storeId') || safeBody.storeId;
    if (!name || !phone || !pw || !storeId) {
        return sendJson({ ok: false, message: '조회 정보를 모두 입력해주세요.' }, 400);
    }
    
    try {
        const r = await query(`
            SELECT 
                order_no, status, total_amount as amount, items, 
                customer_name, customer_phone, address, meta, created_at
            FROM orderss 
            WHERE store_id = $1 AND customer_name = $2 AND lookup_pw = $4
              AND REPLACE(customer_phone, '-', '') = $3
            ORDER BY created_at DESC
        `, [storeId, name, phone, pw]);

        const orders = r.rows.map(row => ({
            id: row.order_no,
            status: row.status,
            amount: row.amount,
            items: typeof row.items === 'string' ? JSON.parse(row.items || '[]') : (row.items || []),
            customer_name: row.customer_name,
            customer_phone: row.customer_phone,
            address: row.address,
            // 🚀 핵심: DB의 meta 컬럼(예약날짜, 메모 등)을 객체로 변환해서 전달
            meta: typeof row.meta === 'string' ? JSON.parse(row.meta || '{}') : (row.meta || {}),
            ts: new Date(row.created_at).getTime()
        }));

        return sendJson({ ok: true, orders });
    } catch (err) {
        console.error("조회 에러:", err);
        return sendJson({ ok: false, message: '조회 중 서버 오류가 발생했습니다.' }, 500);
    }
}

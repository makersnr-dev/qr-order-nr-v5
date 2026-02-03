import { query, queryOne } from './_lib/db.js';
import { verifyJWT, signJWT } from '../src/shared/jwt.js';

export default async function handler(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = req.method;
    const params = url.searchParams;
    const storeId = params.get('storeId') || req.body?.storeId;

    const json = (body, status = 200) => {
        res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.send(JSON.stringify(body));
    };

    const getAuth = async () => {
        const cookieHeader = req.headers.cookie || '';
        const cookies = Object.fromEntries(
            cookieHeader.split(';').map(c => {
                const [key, ...v] = c.trim().split('=');
                return [key, v.join('=')];
            })
        );
        const token = cookies['super_token'] || cookies['admin_token'];
        if (!token) return null;
        try {
            return await verifyJWT(token, process.env.JWT_SECRET || 'dev-secret');
        } catch (e) { return null; }
    };

    try {
        if (pathname === '/api/test') return json({ ok: true, message: "연결 성공!" });
        if (pathname === '/api/check-time') return json({ ok: true, serverTime: new Date(Date.now() + 9 * 60 * 60 * 1000) });
        if (pathname === '/api/config') return json({ tossClientKey: process.env.TOSS_CLIENT_KEY || "" });
        
        // --- 1. 슈퍼 관리자 전용 로직 (원문 그대로 복구) ---
        if (pathname === '/api/super-login') {
            const { uid, pwd } = req.body;
            const superAdmins = JSON.parse(process.env.SUPER_ADMINS_JSON || '[]');
            const found = superAdmins.find(a => a.id === uid && a.pw === pwd);
            if (found) {
                const token = await signJWT({ realm: 'super', uid, isSuper: true }, process.env.JWT_SECRET || 'dev-secret');
                res.setHeader('Set-Cookie', `super_token=${token}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax`);
                return json({ ok: true });
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
                await query('DELETE FROM admin_stores WHERE admin_key = $1 AND store_id = $2', [req.body.adminKey, req.body.storeId]);
                return json({ ok: true });
            }
            const { adminKey, storeId, code, note } = req.body;
            await query(`INSERT INTO admin_stores (admin_key, store_id, code, note) VALUES ($1, $2, $3, $4) ON CONFLICT (admin_key, store_id) DO UPDATE SET code = EXCLUDED.code, note = EXCLUDED.note`, [adminKey, storeId, code, note]);
            return json({ ok: true });
        }

        // --- 2. 매장 설정 (기존의 복잡한 COALESCE 필터링 유지) ---
        if (pathname === '/api/store-settings') {
            if (method === 'GET') {
                const r = await queryOne('SELECT owner_bank, privacy_policy, notify_config, call_options FROM store_settings WHERE store_id = $1', [storeId]);
                const settings = r || {};
                // 기존의 안전한 JSON 파싱 로직 복구
                if (typeof settings.owner_bank === 'string') try { settings.owner_bank = JSON.parse(settings.owner_bank); } catch (e) { }
                if (typeof settings.notify_config === 'string') try { settings.notify_config = JSON.parse(settings.notify_config); } catch (e) { }
                if (typeof settings.call_options === 'string') try { settings.call_options = JSON.parse(settings.call_options); } catch (e) { }
                return json({ ok: true, settings });
            }
            if (method === 'PUT') {
                const { ownerBank, privacyPolicy, notifyConfig, callOptions } = req.body;
                const b = ownerBank ? JSON.stringify(ownerBank) : null;
                const n = notifyConfig ? JSON.stringify(notifyConfig) : null;
                const c = callOptions ? JSON.stringify(callOptions) : null;
                await query(`INSERT INTO store_settings (store_id, owner_bank, privacy_policy, notify_config, call_options) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (store_id) DO UPDATE SET owner_bank=COALESCE($2, store_settings.owner_bank), privacy_policy=COALESCE($3, store_settings.privacy_policy), notify_config=COALESCE($4, store_settings.notify_config), call_options=COALESCE($5, store_settings.call_options)`, [storeId, b, privacyPolicy, n, c]);
                return json({ ok: true });
            }
        }

        // --- 3. 메뉴 관리 (ON CONFLICT 및 상세 옵션 유지) ---
        if (pathname === '/api/menus') {
            if (method === 'GET') {
                const r = await query('SELECT menu_id as id, name, price, category, active, sold_out as "soldOut", img, description as desc, options FROM menus WHERE store_id = $1 ORDER BY display_order ASC', [storeId]);
                return json({ ok: true, menus: r.rows || [] });
            }
            if (method === 'PUT') {
                const items = Array.isArray(req.body) ? req.body : [req.body];
                for (const m of items) {
                    await query(`INSERT INTO menus (store_id, menu_id, name, price, category, active, sold_out, img, description, options) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (store_id, menu_id) DO UPDATE SET name=$3, price=$4, category=$5, active=$6, sold_out=$7, img=$8, description=$9, options=$10`, [storeId, m.id, m.name, m.price, m.category, m.active, m.soldOut, m.img, m.desc, JSON.stringify(m.options || [])]);
                }
                return json({ ok: true });
            }
        }

        // --- 4. 주문 관리 (핵심 교정부: 기존 필터링 기능 유지) ---
        if (pathname === '/api/orders') {
            const auth = await getAuth();
            if (!auth) return json({ ok: false }, 401);
            if (method === 'GET') {
                const type = params.get('type');
                if (type === 'store') {
                    // 🏠 매장 주문: orders 테이블
                    const r = await query('SELECT * FROM orders WHERE store_id = $1 ORDER BY created_at DESC LIMIT 100', [storeId]);
                    return json({
                        ok: true,
                        orders: r.rows.map(row => ({
                            ...row,
                            orderId: row.order_no,  // 프론트엔드 UI용 통합 ID
                            order_no: row.order_no, // 실제 컬럼명
                            table_no: row.table_no,
                            amount: row.amount,
                            cart: row.meta?.cart || [],
                            ts: new Date(row.created_at).getTime()
                        }))
                    });
                } else {
                    // 📅 예약 주문: orderss 테이블
                    const r = await query('SELECT * FROM orderss WHERE store_id = $1 ORDER BY created_at DESC LIMIT 100', [storeId]);
                    return json({
                        ok: true,
                        orders: r.rows.map(row => ({
                            ...row,
                            orderId: row.order_no,       // UI에서 undefined 방지 (중요!)
                            order_no: row.order_no,      // 새로 추가한 컬럼
                            lookup_pw: row.lookup_pw,    // 새로 추가한 컬럼
                            customer_name: row.customer_name,
                            customer_phone: row.customer_phone,
                            table_no: row.table_no,      // 주소가 저장된 곳
                            total_amount: row.total_amount,
                            amount: row.total_amount,    // 프론트 공통 필드용
                            items: row.items || [],
                            cart: row.items || [],       // 프론트 공통 필드용
                            reserve: row.meta?.reserve || {},
                            ts: new Date(row.created_at).getTime()
                        }))
                    });
                }
            }
            if (method === 'POST') {
                const { type, table, cart, amount, customer, reserve, agreePrivacy, lookupPw, memberId } = req.body;
                
                // 1. 주문 식별자 생성
                // order_id (숫자): DB 인덱싱 및 내부 관리용 (9자리 숫자)
                const newNumericId = parseInt(String(Date.now()).slice(-9)); 
                // order_no (문자열): 관리자 화면 표시 및 고객 확인용 (가독성 있는 번호)
                const newOrderNo = `${storeId}-${type === 'store' ? 'S' : 'R'}-${Date.now()}`;
    
                if (type === 'store') {
                    // 매장 주문 (orders 테이블)
                    await query(
                        `INSERT INTO orders (store_id, order_no, status, table_no, amount, meta) 
                         VALUES ($1, $2, '주문접수', $3, $4, $5)`, 
                        [storeId, newOrderNo, table, amount, JSON.stringify({ cart, type, table, ts: Date.now() })]
                    );
                } else {
                    // 예약 주문 (orderss 테이블)
                    // order_id(숫자형), order_no(문자열형), lookup_pw(조회비번) 모두 포함
                    await query(
                        `INSERT INTO orderss (order_id, order_no, store_id, type, status, customer_name, customer_phone, table_no, items, total_amount, lookup_pw, meta) 
                         VALUES ($1, $2, $3, $4, '입금 미확인', $5, $6, $7, $8, $9, $10, $11)`, 
                        [
                            newNumericId,   // order_id (integer)
                            newOrderNo,     // order_no (varying)
                            storeId, 
                            'reserve', 
                            customer.name, 
                            customer.phone, 
                            customer.addr, 
                            JSON.stringify(cart), 
                            amount, 
                            lookupPw, 
                            JSON.stringify({ reserve, agreePrivacy, memberId })
                        ]
                    );
                }
                // 프론트엔드에는 가독성 좋은 order_no를 반환합니다.
                return json({ ok: true, orderId: newOrderNo });
            }
        }

        // --- 5. 호출 관리 (기존 상태변경 로직 포함) ---
        if (pathname === '/api/call') {
            if (method === 'GET') {
                const r = await query('SELECT id, table_no, message, status, created_at as ts FROM call_logs WHERE store_id = $1 ORDER BY created_at DESC LIMIT 50', [storeId]);
                return json({ ok: true, logs: r.rows });
            }
            if (method === 'POST') {
                await query('INSERT INTO call_logs (store_id, table_no, message, status) VALUES ($1, $2, $3, \'대기\')', [storeId, req.body.table, req.body.note]);
                return json({ ok: true });
            }
            if (method === 'PUT') {
                await query('UPDATE call_logs SET status = $1 WHERE id = $2', [req.body.status, req.body.id]);
                return json({ ok: true });
            }
        }

        // --- 6. 결제코드 및 QR (기존 한도 체크 로직 복구) ---
        if (pathname === '/api/payment-code') {
            const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
            let codeRow = await queryOne('SELECT code FROM payment_codes WHERE store_id = $1 AND date = $2', [storeId, today]);
            if (!codeRow) {
                const newCode = String(Math.floor(1000 + Math.random() * 9000));
                await query('INSERT INTO payment_codes (store_id, date, code) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [storeId, today, newCode]);
                codeRow = { code: newCode };
            }
            return json({ ok: true, code: codeRow.code, date: today });
        }

        if (pathname === '/api/qrcodes') {
            if (method === 'GET') {
                const r = await query('SELECT id, kind, table_no as "table", label, url, data_url as "dataUrl" FROM qr_codes WHERE store_id = $1 ORDER BY created_at DESC', [storeId]);
                return json({ ok: true, list: r.rows || [] });
            }
            if (method === 'PUT') {
                const { id, kind, table, label, url, dataUrl } = req.body;
                const row = await queryOne('SELECT qr_limit FROM admin_stores WHERE store_id = $1 LIMIT 1', [storeId]); 
                const limit = row?.qr_limit || 20;
                const current = await queryOne('SELECT COUNT(*) as count FROM qr_codes WHERE store_id = $1', [storeId]);
                const exists = await queryOne('SELECT id FROM qr_codes WHERE id = $1', [id]);
                if (!exists && parseInt(current.count) >= limit) return json({ ok: false, message: `QR 한도 초과` }, 403);
                await query(`INSERT INTO qr_codes (id, store_id, kind, table_no, label, url, data_url, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) ON CONFLICT (id) DO UPDATE SET label=$5, data_url=$7, updated_at=NOW()`, [id, storeId, kind, table, label, url, dataUrl]);
                return json({ ok: true });
            }
            if (method === 'DELETE') {
                await query('DELETE FROM qr_codes WHERE id = $1 AND store_id = $2', [params.get('id'), storeId]);
                return json({ ok: true });
            }
        }

        // --- 7. 관리자 인증 및 정보 조회 ---
        if (pathname === '/api/login-admin') {
            const { id, pw } = req.body;
            const admins = JSON.parse(process.env.ADMIN_USERS_JSON || '[]');
            const found = admins.find(a => a.id === id && a.pw === pw);
            if (!found) return json({ ok: false, message: '로그인 정보가 틀렸습니다.' }, 401);
            const map = await queryOne('SELECT store_id FROM admin_stores WHERE admin_key = $1', [id]);
            const sid = map?.store_id || 'store1';
            const token = await signJWT({ realm: 'admin', uid: id, storeId: sid }, process.env.JWT_SECRET || 'dev-secret', 86400);
            res.setHeader('Set-Cookie', `admin_token=${token}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax`);
            return json({ ok: true, storeId: sid });
        }

        if (pathname === '/api/me' || pathname === '/api/verify') {
            const auth = await getAuth();
            if (!auth) return json({ ok: false, message: 'Unauthorized' }, 401);
            return json({ ok: true, ...auth });
        }

        return json({ error: 'NOT_FOUND', path: pathname }, 404);
    } catch (e) {
        console.error(e);
        return json({ ok: false, error: e.message }, 500);
    }
}

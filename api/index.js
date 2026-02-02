import { query, queryOne } from './_lib/db.js';
import { verifyJWT, signJWT } from '../src/shared/jwt.js';

export default async function handler(req, res) {
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    const method = req.method;
    const params = new URLSearchParams(new URL(req.url, `http://${req.headers.host}`).search);
    const storeId = params.get('storeId') || req.body?.storeId;

    const json = (body, status = 200) => {
        res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.send(JSON.stringify(body));
    };

    // 공통 인증 확인 함수 (Super 관리자용)
    const getAuth = async () => {
        const cookie = req.headers.cookie || '';
        const token = cookie.match(/(admin_token|super_token)=([^;]+)/)?.[2];
        if (!token) return null;
        try { return await verifyJWT(token, process.env.JWT_SECRET || 'dev-secret'); } 
        catch { return null; }
    };

    try {
        // --- 1. [Super Admin 전용] 매장 및 매핑 관리 ---
        if (pathname === '/api/stores' || pathname === '/api/admin-mappings') {
            if (method === 'GET') {
                if (pathname === '/api/stores') {
                    const r = await query('SELECT store_id, name, code FROM stores ORDER BY created_at DESC');
                    const stores = {}; r.rows.forEach(s => stores[s.store_id] = { name: s.name, code: s.code });
                    return json({ ok: true, stores });
                }
                const auth = await getAuth();
                if (auth?.realm !== 'super') return json({ ok: false }, 403);
                const r = await query('SELECT * FROM admin_stores ORDER BY created_at DESC');
                return json({ ok: true, mappings: r.rows });
            }
            
            // POST/DELETE (매장 생성, 삭제, 매핑 추가 등)
            const auth = await getAuth();
            if (auth?.realm !== 'super') return json({ ok: false }, 403);
            const { adminKey, name, code, note } = req.body || {};
            
            if (method === 'DELETE') {
                if (pathname === '/api/admin-mappings') await query('DELETE FROM admin_stores WHERE admin_key = $1 AND store_id = $2', [req.body.adminKey, req.body.storeId]);
                else await query('DELETE FROM stores WHERE store_id = $1', [storeId || req.body.storeId]);
                return json({ ok: true });
            }
            // 매장 생성/수정 및 매핑 추가
            if (pathname === '/api/stores') {
                await query('INSERT INTO stores (store_id, name, code) VALUES ($1, $2, $3) ON CONFLICT (store_id) DO UPDATE SET name=$2, code=$3', [req.body.storeId, name, code]);
            } else {
                await query('INSERT INTO admin_stores (admin_key, store_id, note) VALUES ($1, $2, $3) ON CONFLICT (admin_key, store_id) DO UPDATE SET note=$3', [adminKey, req.body.storeId, note]);
            }
            return json({ ok: true });
        }

        // --- 2. [Super Admin 전용] 슈퍼 로그인/로그아웃 ---
        if (pathname === '/api/super-login') {
            const { uid, pwd } = req.body;
            if (uid === process.env.SUPER_ID && pwd === process.env.SUPER_PW) {
                const token = await signJWT({ realm: 'super', uid, isSuper: true }, process.env.JWT_SECRET || 'dev-secret');
                res.setHeader('Set-Cookie', `super_token=${token}; Path=/; HttpOnly; Max-Age=86400`);
                return json({ ok: true });
            }
            return json({ ok: false }, 401);
        }
        if (pathname === '/api/super-me') {
            const auth = await getAuth();
            return auth?.realm === 'super' ? json({ ok: true, isSuper: true, superId: auth.uid }) : json({ ok: false }, 401);
        }
        if (pathname === '/api/super-logout') {
            res.setHeader('Set-Cookie', `super_token=; Path=/; Max-Age=0`);
            return json({ ok: true });
        }

        // --- 3. 매장 설정 (store-settings) ---
        if (pathname === '/api/store-settings') {
            if (method === 'GET') {
                const r = await queryOne('SELECT owner_bank, privacy_policy, notify_config, call_options FROM store_settings WHERE store_id = $1', [storeId]);
                return json({ ok: true, settings: r || {} });
            }
            if (method === 'PUT') {
                const { ownerBank, privacyPolicy, notifyConfig, callOptions } = req.body;
                await query(`INSERT INTO store_settings (store_id, owner_bank, privacy_policy, notify_config, call_options) VALUES ($1, $2, $3, $4, $5) 
                             ON CONFLICT (store_id) DO UPDATE SET owner_bank=COALESCE($2, store_settings.owner_bank), privacy_policy=COALESCE($3, store_settings.privacy_policy), notify_config=COALESCE($4, store_settings.notify_config), call_options=COALESCE($5, store_settings.call_options)`, 
                             [storeId, JSON.stringify(ownerBank), privacyPolicy, JSON.stringify(notifyConfig), JSON.stringify(callOptions)]);
                return json({ ok: true });
            }
        }

        // --- 4. 메뉴 (menus), 주문 (orders), 호출 (call) ---
        // (이 부분은 이전과 동일하게 유지하되, 사장님 기존 DB 필드에 맞춤)
        if (pathname === '/api/menus') {
            if (method === 'GET') {
                const r = await query('SELECT menu_id as id, name, price, category, active, sold_out as "soldOut", img, description as desc, options FROM menus WHERE store_id = $1 ORDER BY display_order ASC', [storeId]);
                return json({ ok: true, menus: r.rows });
            }
            if (method === 'PUT') {
                const items = Array.isArray(req.body) ? req.body : [req.body];
                for (const m of items) {
                    await query(`INSERT INTO menus (store_id, menu_id, name, price, category, active, sold_out, img, description, options)
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                                 ON CONFLICT (store_id, menu_id) DO UPDATE SET name=$3, price=$4, category=$5, active=$6, sold_out=$7, img=$8, description=$9, options=$10`, 
                                 [storeId, m.id, m.name, m.price, m.category, m.active, m.soldOut, m.img, m.desc, JSON.stringify(m.options || [])]);
                }
                return json({ ok: true });
            }
        }

        if (pathname === '/api/orders') {
            if (method === 'POST') {
                const { type, table, cart, amount, customer, reserve } = req.body;
                const orderNo = `${storeId}-${type}-${Date.now()}`;
                await query('INSERT INTO orders (store_id, order_no, status, table_no, amount, meta) VALUES ($1, $2, $3, $4, $5, $6)', 
                            [storeId, orderNo, (type === 'reserve' ? '입금 미확인' : '주문접수'), table, amount, JSON.stringify({ customer, reserve, cart, type, ts: Date.now() })]);
                return json({ ok: true, orderId: orderNo });
            }
            if (method === 'GET') {
                const type = params.get('type');
                const r = await query('SELECT * FROM orders WHERE store_id = $1 AND (meta->>\'type\') = $2 ORDER BY created_at DESC LIMIT 100', [storeId, type]);
                return json({ ok: true, orders: r.rows.map(row => ({ ...row, orderId: row.order_no, cart: row.meta?.cart, customer: row.meta?.customer, reserve: row.meta?.reserve })) });
            }
            if (method === 'PUT') {
                const { orderId, status, meta } = req.body;
                await query('UPDATE orders SET status = COALESCE($1, status), meta = meta || $2::jsonb WHERE order_no = $3', [status, JSON.stringify(meta || {}), orderId]);
                return json({ ok: true });
            }
        }

        if (pathname === '/api/call') {
            if (method === 'POST') {
                await query('INSERT INTO call_logs (store_id, table_no, message, status) VALUES ($1, $2, $3, \'대기\')', [storeId, req.body.table, req.body.note]);
                return json({ ok: true });
            }
            if (method === 'GET') {
                const r = await query('SELECT id, table_no as table, message, status, created_at as ts FROM call_logs WHERE store_id = $1 ORDER BY created_at DESC LIMIT 50', [storeId]);
                return json({ ok: true, logs: r.rows });
            }
            if (method === 'PUT') {
                await query('UPDATE call_logs SET status = $1 WHERE id = $2', [req.body.status, req.body.id]);
                return json({ ok: true });
            }
        }

        // --- 5. 일반 관리자 로그인 및 정보 확인 ---
        if (pathname === '/api/login-admin') {
            const { id, pw } = req.body;
            const admins = JSON.parse(process.env.ADMIN_USERS_JSON || '[]');
            const found = admins.find(a => a.id === id && a.pw === pw);
            if (!found) return json({ ok: false }, 401);
            const map = await queryOne('SELECT store_id FROM admin_stores WHERE admin_key = $1', [id]);
            const token = await signJWT({ realm: 'admin', uid: id, storeId: map?.store_id || 'store1' }, process.env.JWT_SECRET || 'dev-secret');
            res.setHeader('Set-Cookie', `admin_token=${token}; Path=/; HttpOnly; Max-Age=86400`);
            return json({ ok: true, storeId: map?.store_id || 'store1' });
        }
        if (pathname === '/api/me' || pathname === '/api/verify') {
            const auth = await getAuth();
            return auth ? json({ ok: true, ...auth }) : json({ ok: false }, 401);
        }
        if (pathname === '/api/payment-code') {
            const today = new Date(Date.now() + 9*60*60*1000).toISOString().slice(0, 10);
            let codeRow = await queryOne('SELECT code FROM payment_codes WHERE store_id = $1 AND date = $2', [storeId, today]);
            if (!codeRow) {
                const newCode = String(Math.floor(1000 + Math.random() * 9000));
                await query('INSERT INTO payment_codes (store_id, date, code) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [storeId, today, newCode]);
                codeRow = { code: newCode };
            }
            return json({ ok: true, code: codeRow.code, date: today });
        }

        return json({ error: 'NOT_FOUND' }, 404);
    } catch (e) {
        console.error(e);
        return json({ ok: false, error: e.message }, 500);
    }
}

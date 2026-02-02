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

    try {
        // --- 1. 테스트 및 설정 ---
        if (pathname === '/api/test') return json({ ok: true, message: "연결 성공!" });
        if (pathname === '/api/config') return json({ tossClientKey: process.env.TOSS_CLIENT_KEY || "" });

        // --- 2. 매장 및 설정 (store-settings) ---
        if (pathname === '/api/stores') {
            const r = await query('SELECT store_id, name, code FROM stores ORDER BY created_at DESC');
            const stores = {}; r.rows.forEach(s => stores[s.store_id] = { name: s.name, code: s.code });
            return json({ ok: true, stores });
        }
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

        // --- 3. 메뉴 (menus) ---
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

        // --- 4. 주문 (orders) ---
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
                const { orderId, status, meta, metaAppend } = req.body;
                await query('UPDATE orders SET status = COALESCE($1, status), meta = meta || $2::jsonb WHERE order_no = $3', [status, JSON.stringify(meta || {}), orderId]);
                return json({ ok: true });
            }
        }

        // --- 5. 호출 (call) ---
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
                const { id, status } = req.body;
                await query('UPDATE call_logs SET status = $1 WHERE id = $2', [status, id]);
                return json({ ok: true });
            }
        }

        // --- 6. 로그인 (login) ---
        if (pathname === '/api/login-admin') {
            const { id, pw } = req.body;
            const admins = JSON.parse(process.env.ADMIN_USERS_JSON || '[]');
            const found = admins.find(a => a.id === id && a.pw === pw);
            if (!found) return json({ ok: false, message: '실패' }, 401);
            const map = await queryOne('SELECT store_id FROM admin_stores WHERE admin_key = $1', [id]);
            const token = await signJWT({ realm: 'admin', uid: id, storeId: map?.store_id || 'store1' }, process.env.JWT_SECRET || 'dev-secret');
            res.setHeader('Set-Cookie', `admin_token=${token}; Path=/; HttpOnly; Max-Age=86400`);
            return json({ ok: true, storeId: map?.store_id || 'store1' });
        }

        return json({ error: 'NOT_FOUND' }, 404);
    } catch (e) {
        return json({ ok: false, error: e.message }, 500);
    }
}

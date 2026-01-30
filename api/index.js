// /api/index.js
import { query, queryOne, transaction } from './_lib/db.js';
import { verifyJWT, signJWT } from '../src/shared/jwt.js';

export const config = { runtime: 'nodejs' };

const json = (res, body, status = 200) => {
    res.status(status).setHeader('content-type', 'application/json; charset=utf-8');
    return res.send(JSON.stringify(body));
};

// --- [공통 인증 로직] ---
async function getAuth(req) {
    const cookie = req.headers.cookie || '';
    const token = cookie.match(/(admin_token|super_token)=([^;]+)/)?.[2] || 
                  req.headers.authorization?.split(' ')[1];
    if (!token) return null;
    try {
        return await verifyJWT(token, process.env.JWT_SECRET || 'dev-secret');
    } catch { return null; }
}

export default async function handler(req, res) {
    const { pathname, searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const method = req.method;
    const storeId = searchParams.get('storeId') || req.body?.storeId;

    try {
        // 1. [stores & admin-mappings] (기존 stores.js, super-me.js 등 통합)
        if (pathname === '/api/stores' || pathname === '/api/admin-mappings') {
            if (method === 'GET') {
                if (pathname === '/api/stores') {
                    const r = await query('SELECT store_id, name, code FROM stores ORDER BY created_at DESC');
                    const stores = {}; r.rows.forEach(s => stores[s.store_id] = { name: s.name, code: s.code });
                    return json(res, { ok: true, stores });
                }
                const auth = await getAuth(req);
                if (auth?.realm !== 'super') return json(res, { ok: false }, 403);
                const r = await query('SELECT * FROM admin_stores ORDER BY created_at DESC');
                return json(res, { ok: true, mappings: r.rows });
            }
            // POST/PUT/DELETE 로직... (중략 없이 통합됨)
            const auth = await getAuth(req);
            if (auth?.realm !== 'super') return json(res, { ok: false }, 403);
            const { adminKey, name, code, note } = req.body || {};
            if (method === 'DELETE') {
                if (pathname === '/api/admin-mappings') await query('DELETE FROM admin_stores WHERE admin_key = $1 AND store_id = $2', [req.body.adminKey, req.body.storeId]);
                else await query('DELETE FROM stores WHERE store_id = $1', [storeId || req.body.storeId]);
                return json(res, { ok: true });
            }
            await query('INSERT INTO stores (store_id, name, code) VALUES ($1, $2, $3) ON CONFLICT (store_id) DO UPDATE SET name=$2, code=$3', [req.body.storeId, name, code]);
            return json(res, { ok: true });
        }

        // 2. [menus] (기존 menus.js 통합: 엑셀 업로드 및 개별 수정 대응)
        if (pathname === '/api/menus') {
            if (method === 'GET') {
                const r = await query('SELECT menu_id as id, name, price, category, active, sold_out as "soldOut", img, description as desc, options FROM menus WHERE store_id = $1 ORDER BY display_order ASC', [storeId]);
                return json(res, { ok: true, menus: r.rows });
            }
            if (method === 'PUT') {
                const items = Array.isArray(req.body) ? req.body : [req.body];
                for (const m of items) {
                    await query(`
                        INSERT INTO menus (store_id, menu_id, name, price, category, active, sold_out, img, description, options)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                        ON CONFLICT (store_id, menu_id) DO UPDATE SET name=$3, price=$4, category=$5, active=$6, sold_out=$7, img=$8, description=$9, options=$10`, 
                        [storeId, m.id, m.name, m.price, m.category, m.active, m.soldOut, m.img, m.desc, JSON.stringify(m.options || [])]);
                }
                return json(res, { ok: true });
            }
        }

        // 3. [orders] (기존 orders.js 통합: 매장/예약 주문 생성 및 상태 변경)
        if (pathname === '/api/orders') {
            if (method === 'POST') {
                const { type, table, cart, amount, customer, reserve } = req.body;
                const orderNo = `${storeId}-${type}-${Date.now()}`;
                await query('INSERT INTO orders (store_id, order_no, status, table_no, amount, meta) VALUES ($1, $2, $3, $4, $5, $6)', 
                    [storeId, orderNo, (type === 'reserve' ? '입금 미확인' : '주문접수'), table, amount, JSON.stringify({ customer, reserve, cart, type, ts: Date.now() })]);
                return json(res, { ok: true, orderId: orderNo });
            }
            if (method === 'GET') {
                const r = await query('SELECT * FROM orders WHERE store_id = $1 ORDER BY created_at DESC LIMIT 100', [storeId]);
                return json(res, { ok: true, orders: r.rows.map(row => ({ ...row, orderId: row.order_no, cart: row.meta?.cart, customer: row.meta?.customer, reserve: row.meta?.reserve })) });
            }
            if (method === 'PUT') {
                const { orderId, status, meta, metaAppend } = req.body;
                await query('UPDATE orders SET status = COALESCE($1, status), meta = meta || $2::jsonb WHERE order_no = $3', [status, JSON.stringify(meta || {}), orderId]);
                return json(res, { ok: true });
            }
        }

        // 4. [login & me] (기존 login-admin.js, login-cust.js, me.js, verify.js 통합)
        if (pathname === '/api/login-admin') {
            const { id, pw } = req.body;
            const admins = JSON.parse(process.env.ADMIN_USERS_JSON || '[]');
            const found = admins.find(a => a.id === id && a.pw === pw);
            if (!found) return json(res, { ok: false, message: '실패' }, 401);
            const map = await queryOne('SELECT store_id FROM admin_stores WHERE admin_key = $1', [id]);
            const token = await signJWT({ realm: 'admin', uid: id, storeId: map?.store_id || 'store1' }, process.env.JWT_SECRET || 'dev-secret');
            res.setHeader('Set-Cookie', `admin_token=${token}; Path=/; HttpOnly; Max-Age=86400`);
            return json(res, { ok: true, storeId: map?.store_id || 'store1' });
        }

        if (pathname === '/api/login-cust') {
            const { uid, pwd } = req.body;
            const users = JSON.parse(process.env.CUST_USERS_JSON || '[]');
            const user = users.find(u => u.id === uid && u.pw === pwd);
            if (!user) return json(res, { ok: false }, 401);
            const token = await signJWT({ realm: 'cust', uid: user.id, name: user.name }, process.env.JWT_SECRET || 'dev-secret');
            return json(res, { ok: true, token });
        }

        if (pathname === '/api/me' || pathname === '/api/verify') {
            const auth = await getAuth(req);
            return auth ? json(res, { ok: true, ...auth }) : json(res, { ok: false }, 401);
        }

        // 5. [settings & qrcodes & call] (기존 qrcodes.js, call.js, store-settings.js 통합)
        if (pathname === '/api/store-settings') {
            if (method === 'GET') {
                const r = await queryOne('SELECT owner_bank, privacy_policy, notify_config, call_options FROM store_settings WHERE store_id = $1', [storeId]);
                return json(res, { ok: true, settings: r || {} });
            }
            if (method === 'PUT') {
                const { ownerBank, privacyPolicy, notifyConfig, callOptions } = req.body;
                await query(`INSERT INTO store_settings (store_id, owner_bank, privacy_policy, notify_config, call_options) VALUES ($1, $2, $3, $4, $5) 
                    ON CONFLICT (store_id) DO UPDATE SET owner_bank=COALESCE($2, store_settings.owner_bank), privacy_policy=COALESCE($3, store_settings.privacy_policy), notify_config=COALESCE($4, store_settings.notify_config), call_options=COALESCE($5, store_settings.call_options)`, 
                    [storeId, JSON.stringify(ownerBank), privacyPolicy, JSON.stringify(notifyConfig), JSON.stringify(callOptions)]);
                return json(res, { ok: true });
            }
        }

        if (pathname === '/api/qrcodes') {
            if (method === 'GET') {
                const r = await query('SELECT id, kind, table_no as "table", label, url, data_url as "dataUrl" FROM qr_codes WHERE store_id = $1', [storeId]);
                return json(res, { ok: true, list: r.rows });
            }
            if (method === 'PUT') {
                const { id, kind, table, label, url, dataUrl } = req.body;
                await query('INSERT INTO qr_codes (id, store_id, kind, table_no, label, url, data_url) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE SET label=$5, data_url=$7', [id, storeId, kind, table, label, url, dataUrl]);
                return json(res, { ok: true });
            }
            if (method === 'DELETE') {
                await query('DELETE FROM qr_codes WHERE id = $1', [searchParams.get('id')]);
                return json(res, { ok: true });
            }
        }

        if (pathname === '/api/call') {
            if (method === 'POST') {
                await query('INSERT INTO call_logs (store_id, table_no, message, status) VALUES ($1, $2, $3, \'대기\')', [storeId, req.body.table, req.body.note]);
                return json(res, { ok: true });
            }
            if (method === 'GET') {
                const r = await query('SELECT id, table_no as table, message, status, created_at as ts FROM call_logs WHERE store_id = $1 ORDER BY created_at DESC LIMIT 50', [storeId]);
                return json(res, { ok: true, logs: r.rows });
            }
        }

        // 6. [payment-code & config]
        if (pathname === '/api/payment-code') {
            const today = new Date(Date.now() + 9*60*60*1000).toISOString().slice(0, 10);
            let code = await queryOne('SELECT code FROM payment_codes WHERE store_id = $1 AND date = $2', [storeId, today]);
            if (!code) {
                const newCode = String(Math.floor(1000 + Math.random() * 9000));
                await query('INSERT INTO payment_codes (store_id, date, code) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [storeId, today, newCode]);
                code = { code: newCode };
            }
            return json(res, { ok: true, code: code.code, date: today });
        }

        if (pathname === '/api/config') {
            return json(res, { tossClientKey: process.env.TOSS_CLIENT_KEY || "", origin: `https://${req.headers.host}` });
        }

        return json(res, { error: 'NOT_FOUND' }, 404);
    } catch (e) {
        console.error(e);
        return json(res, { ok: false, error: e.message }, 500);
    }
}

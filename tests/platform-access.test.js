const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const createRouter = require('../src/modules/PlatformAccess/route');

async function setup(t, { secret = 'test-control-secret', store = {} } = {}) {
    const model = {
        findById(id) {
            assert.equal(id, 'platform');
            return { lean: async () => {
                if (store.readError) throw new Error('Read failed');
                return store.state;
            } };
        },
        async updateOne(filter, update, options) {
            assert.deepEqual(filter, { _id: 'platform' });
            assert.equal(options.upsert, true);
            if (store.writeError) throw new Error('Write failed');
            store.state = { ...update.$set };
        }
    };
    const app = express();
    app.use(createRouter({ model, getSecret: () => secret }));
    app.use(express.json());
    app.use((req, res) => res.json({ working: true }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const request = (path, options) => fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
    const control = (value, key = secret, method = 'GET') => request(`/platform-access/${value}`, {
        method, headers: key ? { 'X-Platform-Control-Key': key } : {}
    });
    return { request, control, store };
}

test('block all API methods and restore access through the exempt control endpoint', async t => {
    const { request, control } = await setup(t);
    assert.equal((await request('/products')).status, 200);
    const blocked = await control('true');
    assert.equal(blocked.status, 200);
    assert.equal((await blocked.json()).blocked, true);
    assert.equal(blocked.headers.get('cache-control'), 'no-store');
    for (const path of ['/admin/login', '/users', '/upload', '/unknown']) {
        for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
            const response = await request(path, { method });
            assert.equal(response.status, 503);
            assert.deepEqual(await response.json(), { message: 'Network error' });
        }
    }
    const malformed = await request('/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad json'
    });
    assert.equal(malformed.status, 503);
    assert.equal((await control('false', 'wrong')).status, 401);
    assert.equal((await request('/orders')).status, 503);
    const enabled = await control('false');
    assert.equal((await enabled.json()).blocked, false);
    assert.equal((await request('/orders')).status, 200);
});

test('reject missing/wrong keys, invalid values and non-GET methods without changing state', async t => {
    const { control, store } = await setup(t);
    assert.equal((await control('true', '')).status, 401);
    assert.equal((await control('true', 'bad-key')).status, 401);
    assert.equal((await control('TRUE')).status, 400);
    assert.equal((await control('true', undefined, 'HEAD')).status, 405);
    assert.equal((await control('true', undefined, 'POST')).status, 405);
    assert.equal(store.state, undefined);
});

test('missing server secret disables control but leaves default API access enabled', async t => {
    const { request, control } = await setup(t, { secret: '' });
    assert.equal((await control('true', 'anything')).status, 503);
    assert.equal((await request('/products')).status, 200);
});

test('new router instances read shared persisted state', async t => {
    const store = {};
    const first = await setup(t, { store });
    await first.control('true');
    const second = await setup(t, { store });
    assert.equal((await second.request('/products')).status, 503);
    await second.control('false');
    assert.equal((await first.request('/products')).status, 200);
});

test('database failures return 503 and failed writes never report success', async t => {
    const store = { readError: true, writeError: true };
    const { request, control } = await setup(t, { store });
    const response = await request('/products');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { message: 'Network error' });
    assert.equal((await control('true')).status, 503);
    assert.equal(store.state, undefined);
});

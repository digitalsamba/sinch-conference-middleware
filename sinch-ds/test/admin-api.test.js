import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, api, adminHeaders } from './helpers.js';
import { createApp } from '../src/app.js';

let ctx;
beforeEach(async () => { ctx = await startApp(); });
afterEach(async () => { await ctx.close(); });

test('admin routes require Basic auth; webhooks and /healthz do not', async () => {
    let r = await api(ctx.base, '/api/conferences', { headers: {} });
    assert.equal(r.status, 401);
    assert.match(r.headers.get('www-authenticate'), /^Basic /);

    r = await api(ctx.base, '/api/conferences', { headers: adminHeaders('admin', 'wrong') });
    assert.equal(r.status, 401);

    r = await api(ctx.base, '/', { headers: {} });
    assert.equal(r.status, 401, 'the UI itself is protected');

    r = await api(ctx.base, '/api/conferences');
    assert.equal(r.status, 200);

    r = await api(ctx.base, '/healthz', { headers: {} });
    assert.equal(r.status, 200);
});

test('admin surface is disabled (503) when no credentials are configured', async () => {
    await ctx.close();
    ctx = await startApp({ adminAuth: { mode: 'locked' } });
    const r = await api(ctx.base, '/api/conferences', { headers: {} });
    assert.equal(r.status, 503);
});

test('createApp defaults to the locked mode with no ADMIN_* env', () => {
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_AUTH_DISABLED;
    assert.doesNotThrow(() => createApp());
});

test('conference and user CRUD round-trip', async () => {
    let r = await api(ctx.base, '/api/conference', { method: 'POST', body: { conference_id: 'conf-1', digitalsamba_room_id: 'room-1' } });
    assert.equal(r.status, 201);

    r = await api(ctx.base, '/api/user', { method: 'POST', body: { conference_id: 'conf-1', pin: '1234', display_name: 'Alice' } });
    assert.equal(r.status, 201);
    assert.equal((await r.json()).pin, 1234);

    r = await api(ctx.base, '/api/conferences-and-users');
    const [conf] = await r.json();
    assert.equal(conf.conference_id, 'conf-1');
    assert.deepEqual(conf.users.map((u) => u.pin), [1234]);

    r = await api(ctx.base, '/api/user/1234/external-id', { method: 'PATCH', body: { external_id: 'ext-9' } });
    assert.equal(r.status, 200);
    r = await api(ctx.base, '/api/users?conference_id=conf-1');
    assert.equal((await r.json())[0].external_id, 'ext-9');

    r = await api(ctx.base, '/api/user', { method: 'DELETE', body: { pin: 1234 } });
    assert.equal(r.status, 200);
    r = await api(ctx.base, '/api/user', { method: 'DELETE', body: { pin: 1234 } });
    assert.equal(r.status, 404);
});

test('deleting a conference cascades to its users', async () => {
    await api(ctx.base, '/api/conference', { method: 'POST', body: { conference_id: 'conf-1' } });
    await api(ctx.base, '/api/user', { method: 'POST', body: { conference_id: 'conf-1', pin: 1111 } });

    let r = await api(ctx.base, '/api/conference/conf-1', { method: 'DELETE' });
    assert.equal(r.status, 200);
    r = await api(ctx.base, '/api/users');
    assert.deepEqual(await r.json(), []);
});

test('input validation and constraint errors map to 4xx', async () => {
    const post = (path, body) => api(ctx.base, path, { method: 'POST', body });

    assert.equal((await post('/api/conference', {})).status, 400);
    assert.equal((await post('/api/conference', { conference_id: 'x'.repeat(65) })).status, 400);
    assert.equal((await post('/api/conference', { conference_id: 'c' })).status, 201);
    assert.equal((await post('/api/conference', { conference_id: 'c' })).status, 409);

    assert.equal((await post('/api/user', { conference_id: 'c', pin: 'abc' })).status, 400);
    assert.equal((await post('/api/user', { conference_id: 'c', pin: '1234567' })).status, 400);
    assert.equal((await post('/api/user', { conference_id: 'nope', pin: 42 })).status, 404);
    assert.equal((await post('/api/user', { conference_id: 'c', pin: 42 })).status, 201);
    assert.equal((await post('/api/user', { conference_id: 'c', pin: 42 })).status, 409);

    // No body at all must not crash the handler.
    const r = await api(ctx.base, '/api/user', { method: 'DELETE', headers: adminHeaders() });
    assert.equal(r.status, 400);
});

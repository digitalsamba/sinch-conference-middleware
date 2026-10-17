import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import { attachLogWebSocket } from '../src/logStream.js';
import { checkAdminRequest } from '../src/middleware/auth.js';

const admin = { mode: 'basic', username: 'admin', password: 'pw' };

const connect = (url, headers) => new Promise((resolve) => {
    const ws = new WebSocket(url, { headers });
    ws.on('open', () => { ws.close(); resolve('open'); });
    ws.on('unexpected-response', (req, res) => resolve(res.statusCode));
    ws.on('error', () => resolve('error'));
});

test('log WebSocket requires the admin credentials', async () => {
    const server = http.createServer();
    const wss = attachLogWebSocket(server, {
        verifyClient: ({ req }) => checkAdminRequest(admin, req.headers.authorization) === 'ok',
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const url = `ws://127.0.0.1:${server.address().port}`;

    assert.equal(await connect(url, {}), 401);
    assert.equal(await connect(url, { authorization: 'Basic ' + Buffer.from('admin:nope').toString('base64') }), 401);
    assert.equal(await connect(url, { authorization: 'Basic ' + Buffer.from('admin:pw').toString('base64') }), 'open');

    wss.close();
    await new Promise((r) => server.close(r));
});

test('checkAdminRequest modes', () => {
    assert.equal(checkAdminRequest({ mode: 'open' }, undefined), 'ok');
    assert.equal(checkAdminRequest({ mode: 'locked' }, 'Basic eA=='), 'locked');
    assert.equal(checkAdminRequest(admin, 'Bearer x'), 'unauthorized');
    assert.equal(checkAdminRequest(admin, 'Basic ' + Buffer.from('admin').toString('base64')), 'unauthorized');
});

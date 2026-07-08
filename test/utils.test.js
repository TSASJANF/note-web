const assert = require('node:assert/strict');
const test = require('node:test');
const { getClientIp } = require('../src/utils');

test('getClientIp returns req.ip when available', () => {
    const req = { ip: '192.168.1.1', socket: { remoteAddress: '10.0.0.1' } };
    assert.equal(getClientIp(req), '192.168.1.1');
});

test('getClientIp falls back to socket.remoteAddress', () => {
    const req = { ip: undefined, socket: { remoteAddress: '10.0.0.1' } };
    assert.equal(getClientIp(req), '10.0.0.1');
});

test('getClientIp returns unknown when both are missing', () => {
    const req = { ip: undefined, socket: {} };
    assert.equal(getClientIp(req), 'unknown');
});

test('getClientIp handles null ip', () => {
    const req = { ip: null, socket: { remoteAddress: '10.0.0.1' } };
    assert.equal(getClientIp(req), '10.0.0.1');
});

test('getClientIp handles empty string ip', () => {
    const req = { ip: '', socket: { remoteAddress: '10.0.0.1' } };
    assert.equal(getClientIp(req), '10.0.0.1');
});

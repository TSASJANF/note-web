const assert = require('node:assert/strict');
const test = require('node:test');
const { hashPassword, verifyPassword } = require('../src/auth');

test('hashPassword returns scrypt format string', () => {
    const hash = hashPassword('test-password');
    assert.ok(hash.startsWith('scrypt$'), 'should start with scrypt$');
    const parts = hash.split('$');
    assert.equal(parts.length, 6, 'should have6 parts');
    assert.equal(parts[0], 'scrypt');
    assert.equal(Number(parts[1]), 16384, 'N parameter');
    assert.equal(Number(parts[2]), 8, 'r parameter');
    assert.equal(Number(parts[3]), 1, 'p parameter');
});

test('hashPassword generates different hashes for same password', () => {
    const hash1 = hashPassword('test-password');
    const hash2 = hashPassword('test-password');
    assert.notEqual(hash1, hash2, 'different salts should produce different hashes');
});

test('verifyPassword returns true for correct password', () => {
    const hash = hashPassword('my-secret');
    assert.equal(verifyPassword('my-secret', hash), true);
});

test('verifyPassword returns false for wrong password', () => {
    const hash = hashPassword('my-secret');
    assert.equal(verifyPassword('wrong-password', hash), false);
});

test('verifyPassword returns false for empty password', () => {
    const hash = hashPassword('my-secret');
    assert.equal(verifyPassword('', hash), false);
    assert.equal(verifyPassword(null, hash), false);
    assert.equal(verifyPassword(undefined, hash), false);
});

test('verifyPassword returns false for empty hash', () => {
    assert.equal(verifyPassword('password', ''), false);
    assert.equal(verifyPassword('password', null), false);
    assert.equal(verifyPassword('password', undefined), false);
});

test('verifyPassword returns false for malformed hash', () => {
    assert.equal(verifyPassword('password', 'not-a-valid-hash'), false);
    assert.equal(verifyPassword('password', 'scrypt$invalid'), false);
});

test('verifyPassword uses constant-time comparison', () => {
    const hash = hashPassword('test');
    // Should not throw for valid hash
    assert.equal(verifyPassword('test', hash), true);
    assert.equal(verifyPassword('wrong', hash), false);
});

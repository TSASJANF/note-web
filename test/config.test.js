const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { loadConfig, saveConfig, hashConfigToken, verifyConfigToken } = require('../src/config');

test('loadConfig returns defaults when no config file exists', () => {
    const configPath = path.join(os.tmpdir(), `nonexistent-${Date.now()}.json`);
    const config = loadConfig(configPath);
    assert.equal(config.port, 2980);
    assert.equal(config.saveInterval, 1000);
    assert.equal(config.emptyNoteRetentionDays, 30);
    assert.ok(Array.isArray(config.noteIdBlacklist));
});

test('loadConfig reads values from config file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ port: 9999, saveInterval: 2000 }));
    const config = loadConfig(configPath);
    assert.equal(config.port, 9999);
    assert.equal(config.saveInterval, 2000);
    fs.rmSync(tmpDir, { recursive: true });
});

test('loadConfig handles corrupted JSON gracefully', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, '{ invalid json }');
    const config = loadConfig(configPath);
    assert.equal(config.port, 2980, 'should fall back to defaults');
    fs.rmSync(tmpDir, { recursive: true });
});

test('saveConfig writes valid JSON to file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
    const configPath = path.join(tmpDir, 'config.json');
    const config = { port: 8080, saveInterval: 1000, noteIdBlacklist: ['test'] };
    saveConfig(configPath, config);
    const written = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    assert.equal(written.port, 8080);
    assert.equal(written.saveInterval, 1000);
    assert.deepEqual(written.noteIdBlacklist, ['test']);
    fs.rmSync(tmpDir, { recursive: true });
});

test('saveConfig creates temp file and renames atomically', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
    const configPath = path.join(tmpDir, 'config.json');
    saveConfig(configPath, { port: 3000 });
    assert.ok(fs.existsSync(configPath));
    const files = fs.readdirSync(tmpDir);
    assert.equal(files.length, 1, 'should only have config.json, no temp files');
    fs.rmSync(tmpDir, { recursive: true });
});

test('hashConfigToken returns sha256 prefixed string', () => {
    const hash = hashConfigToken('my-token');
    assert.ok(hash.startsWith('sha256:'));
    assert.equal(hash.length, 7 + 64, 'sha256: + 64 hex chars');
});

test('hashConfigToken returns empty string for empty input', () => {
    assert.equal(hashConfigToken(''), '');
    assert.equal(hashConfigToken(null), '');
    assert.equal(hashConfigToken(undefined), '');
});

test('verifyConfigToken verifies hashed tokens', () => {
    const token = 'my-secret-token';
    const hash = hashConfigToken(token);
    assert.equal(verifyConfigToken(token, hash), true);
    assert.equal(verifyConfigToken('wrong-token', hash), false);
});

test('verifyConfigToken verifies plaintext tokens (backward compatibility)', () => {
    assert.equal(verifyConfigToken('old-token', 'old-token'), true);
    assert.equal(verifyConfigToken('wrong', 'old-token'), false);
});

test('verifyConfigToken returns false for empty inputs', () => {
    assert.equal(verifyConfigToken('', 'hash'), false);
    assert.equal(verifyConfigToken('token', ''), false);
    assert.equal(verifyConfigToken(null, 'hash'), false);
    assert.equal(verifyConfigToken('token', null), false);
});

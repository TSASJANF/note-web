const assert = require('node:assert/strict');
const test = require('node:test');
const { parseCookies, safeDecodeURIComponent } = require('../src/admin/cookies');

test('safeDecodeURIComponent decodes valid encoded strings', () => {
    assert.equal(safeDecodeURIComponent('hello%20world'), 'hello world');
    assert.equal(safeDecodeURIComponent('%E4%B8%AD%E6%96%87'), '中文');
});

test('safeDecodeURIComponent returns original string for invalid encoding', () => {
    assert.equal(safeDecodeURIComponent('%ZZ'), '%ZZ');
    assert.equal(safeDecodeURIComponent('%'), '%');
    assert.equal(safeDecodeURIComponent('normal'), 'normal');
});

test('parseCookies parses simple cookies', () => {
    const cookies = parseCookies('name=value; other=test');
    assert.equal(cookies.name, 'value');
    assert.equal(cookies.other, 'test');
});

test('parseCookies handles empty header', () => {
    assert.deepEqual(parseCookies(''), {});
    assert.deepEqual(parseCookies(null), {});
    assert.deepEqual(parseCookies(undefined), {});
});

test('parseCookies handles cookies with equals in value', () => {
    const cookies = parseCookies('token=abc=def');
    assert.equal(cookies.token, 'abc=def');
});

test('parseCookies handles malformed cookies gracefully', () => {
    const cookies = parseCookies('malformed; good=value');
    assert.equal(cookies.good, 'value');
    assert.equal(cookies.malformed, undefined);
});

test('parseCookies decodes URI-encoded values', () => {
    const cookies = parseCookies('name=hello%20world');
    assert.equal(cookies.name, 'hello world');
});

test('parseCookies handles malformed encoding in cookie value', () => {
    const cookies = parseCookies('name=%ZZ');
    assert.equal(cookies.name, '%ZZ');
});

test('parseCookies trims whitespace', () => {
    const cookies = parseCookies(' name = value ; other = test ');
    assert.equal(cookies.name, 'value');
    assert.equal(cookies.other, 'test');
});

const assert = require('node:assert/strict');
const test = require('node:test');
const { escapeHtml, renderMarkdown } = require('../src/markdown');

test('escapeHtml escapes ampersand', () => {
    assert.equal(escapeHtml('&'), '&amp;');
});

test('escapeHtml escapes less than', () => {
    assert.equal(escapeHtml('<'), '&lt;');
});

test('escapeHtml escapes greater than', () => {
    assert.equal(escapeHtml('>'), '&gt;');
});

test('escapeHtml escapes double quotes', () => {
    assert.equal(escapeHtml('"'), '&quot;');
});

test('escapeHtml escapes single quotes', () => {
    assert.equal(escapeHtml("'"), '&#39;');
});

test('escapeHtml handles mixed content', () => {
    assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
});

test('escapeHtml handles empty string', () => {
    assert.equal(escapeHtml(''), '');
});

test('renderMarkdown renders basic markdown', () => {
    const html = renderMarkdown('# Hello');
    assert.ok(html.includes('<h1'));
    assert.ok(html.includes('Hello'));
});

test('renderMarkdown renders links', () => {
    const html = renderMarkdown('[link](https://example.com)');
    assert.ok(html.includes('<a'));
    assert.ok(html.includes('https://example.com'));
});

test('renderMarkdown sanitizes dangerous HTML', () => {
    const html = renderMarkdown('<script>alert("xss")</script>');
    assert.ok(!html.includes('<script>'));
});

test('renderMarkdown allows safe HTML tags', () => {
    const html = renderMarkdown('<del>deleted</del>');
    assert.ok(html.includes('<del>'));
    assert.ok(html.includes('deleted'));
});

test('renderMarkdown renders code blocks', () => {
    const html = renderMarkdown('```javascript\nconsole.log("test");\n```');
    assert.ok(html.includes('<code'));
    assert.ok(html.includes('console'));
});

test('renderMarkdown sanitizes event handlers', () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">');
    assert.ok(!html.includes('onerror'));
});

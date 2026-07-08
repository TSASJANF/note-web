const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createApp } = require('../src/app');
const { createMemoryNoteStore } = require('../src/storage/memory-note-store');
const { hashPassword } = require('../src/auth');

async function createTestServer(options = {}) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-web-'));
    const store = createMemoryNoteStore();
    const config = {
        port: 0,
        saveInterval: 1000,
        bodySizeLimit: '1mb',
        rateLimitWindowMs: 60_000,
        rateLimitMaxRequests: 1000,
        randomIdSaturationRatio: options.randomIdSaturationRatio || 0.6,
        noteIdBlacklist: options.noteIdBlacklist || ['api', 'admin', 'vendor'],
        emptyNoteRetentionDays: 30,
        illegalNoteRetentionDays: 365,
        activityLogRetentionDays: 180,
        adminUsername: options.adminUsername || '',
        adminPasswordHash: options.adminPasswordHash || '',
        adminPath: options.adminPath || '/admin',
        adminEntryToken: options.adminEntryToken || '',
        universalEditToken: options.universalEditToken || '',
        configPath: path.join(dataDir, 'config.json')
    };
    const app = await createApp({ config, store });
    const server = app.listen(0);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    return { baseUrl, server, store, dataDir, config };
}

async function createNote(ctx, id = 'readme', options = {}) {
    ctx.store.createNote(id, options);
    const load = await fetch(`${ctx.baseUrl}/api/${id}`);
    const body = await load.json();
    return { ...ctx.store.getNoteRecord(id), version: body.version };
}

async function loginAdmin(ctx, basePath = ctx.config.adminPath) {
    const entryCookie = ctx.config.adminEntryToken
        ? (await fetch(`${ctx.baseUrl}${basePath}?entry=${ctx.config.adminEntryToken}`, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0]
        : '';
    const login = await fetch(`${ctx.baseUrl}${basePath}/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...(entryCookie ? { Cookie: entryCookie } : {})
        },
        redirect: 'manual',
        body: new URLSearchParams({ username: 'admin', password: 'password' })
    });
    const sessionCookie = login.headers.get('set-cookie').split(';')[0];
    return [entryCookie, sessionCookie].filter(Boolean).join('; ');
}

async function getCsrf(ctx, cookie, pathName = ctx.config.adminPath) {
    const response = await fetch(`${ctx.baseUrl}${pathName}`, { headers: { Cookie: cookie } });
    const html = await response.text();
    return html.match(/name="csrf" value="([^"]+)"/)[1];
}

test('homepage creates short random ids and skips blacklisted ids', async (t) => {
    const ctx = await createTestServer({ noteIdBlacklist: ['abc'] });
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });

    const response = await fetch(`${ctx.baseUrl}/`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    const id = response.headers.get('location').slice(1).split('?')[0];

    assert.equal(id.length, 3);
    assert.notEqual(id.toLowerCase(), 'abc');
});

test('random id length grows when current length is saturated', async (t) => {
    const ctx = await createTestServer({ randomIdSaturationRatio: 0.000001 });
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });
    ctx.store.createNote('abc');

    const response = await fetch(`${ctx.baseUrl}/`, { redirect: 'manual' });
    const id = response.headers.get('location').slice(1).split('?')[0];

    assert.equal(id.length, 4);
});

test('saves and loads plain text notes without requiring tokens by default', async (t) => {
    const ctx = await createTestServer();
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });
    const note = await createNote(ctx);

    const save = await fetch(`${ctx.baseUrl}/api/readme`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'If-Match': String(note.version) },
        body: 'hello'
    });

    assert.equal(save.status, 200);
    const saveBody = await save.json();
    assert.equal(saveBody.version, 2);

    const load = await fetch(`${ctx.baseUrl}/api/readme`);
    assert.equal(load.status, 200);
    assert.deepEqual(await load.json(), {
        id: 'readme',
        content: 'hello',
        readonly: false,
        canEdit: true,
        editTokenRequired: false,
        version: 2,
        deletedAt: null,
        updatedAt: saveBody.updatedAt
    });
});

test('GET and POST create non-blacklisted missing notes', async (t) => {
    const ctx = await createTestServer({ noteIdBlacklist: ['blocked'] });
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });

    const getCreate = await fetch(`${ctx.baseUrl}/api/new-get-note`);
    assert.equal(getCreate.status, 200);
    assert.equal(ctx.store.getNoteRecord('new-get-note').createdByAdmin, false);

    const postCreate = await fetch(`${ctx.baseUrl}/api/new-post-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'created by post'
    });
    assert.equal(postCreate.status, 200);
    const record = ctx.store.getNoteRecord('new-post-note');
    assert.equal(record.content, 'created by post');
    assert.equal(record.createdByAdmin, false);
});

test('blacklisted missing notes return 404 for GET and POST', async (t) => {
    const ctx = await createTestServer({ noteIdBlacklist: ['blocked'] });
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });

    assert.equal((await fetch(`${ctx.baseUrl}/api/blocked`)).status, 404);
    assert.equal((await fetch(`${ctx.baseUrl}/api/blocked`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' })).status, 404);
    assert.equal(ctx.store.getNoteRecord('blocked'), null);
});

test('empty content marks a note as empty and can be restored before purge', async (t) => {
    const ctx = await createTestServer();
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });
    const note = await createNote(ctx, 'empty-note');

    const empty = await fetch(`${ctx.baseUrl}/api/empty-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'If-Match': String(note.version) },
        body: ''
    });
    assert.equal(empty.status, 200);
    const emptyBody = await empty.json();
    assert.equal(typeof ctx.store.getNoteRecord('empty-note').deletedAt, 'string');

    const restore = await fetch(`${ctx.baseUrl}/api/empty-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'If-Match': String(emptyBody.version) },
        body: 'restored'
    });
    assert.equal(restore.status, 200);
    assert.equal(ctx.store.getNoteRecord('empty-note').deletedAt, null);
});

test('new empty notes are immediately classified as empty', async (t) => {
    const ctx = await createTestServer();
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });

    const note = ctx.store.createNote('new-empty-note');
    const record = ctx.store.getNoteRecord('new-empty-note');

    assert.equal(record.content, '');
    assert.equal(typeof record.deletedAt, 'string');
    assert.equal(note.deletedAt, record.deletedAt);
    assert.equal(ctx.store.listNotes({ filter: 'empty' }).some((item) => item.id === 'new-empty-note'), true);
});

test('stores token hashes only when token edit mode is enabled', async (t) => {
    const ctx = await createTestServer();
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });

    const open = ctx.store.createNote('open-note');
    assert.equal(open.editToken, null);
    assert.equal(open.editTokenHash, null);
    assert.equal(open.adminTokenHash, null);

    const protectedNote = ctx.store.createNote('protected-note', { editTokenRequired: true });
    const record = ctx.store.getNoteRecord('protected-note');
    assert.equal(typeof protectedNote.editToken, 'string');
    assert.equal(record.editToken, undefined);
    assert.equal(record.adminTokenHash, null);
    assert.equal(typeof record.editTokenHash, 'string');
    assert.notEqual(record.editTokenHash, protectedNote.editToken);
});

test('token edit mode requires own token or universal edit token', async (t) => {
    const ctx = await createTestServer({ universalEditToken: 'universal-secret' });
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });
    const note = ctx.store.createNote('token-note', { editTokenRequired: true });

    const denied = await fetch(`${ctx.baseUrl}/api/token-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'If-Match': String(note.version) },
        body: 'blocked'
    });
    assert.equal(denied.status, 403);

    const own = await fetch(`${ctx.baseUrl}/api/token-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'If-Match': String(note.version), 'X-Note-Token': note.editToken },
        body: 'own token'
    });
    assert.equal(own.status, 200);
    const ownBody = await own.json();

    const universal = await fetch(`${ctx.baseUrl}/api/token-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'If-Match': String(ownBody.version), 'X-Note-Token': 'universal-secret' },
        body: 'universal token'
    });
    assert.equal(universal.status, 200);
    assert.equal(ctx.store.getNoteRecord('token-note').content, 'universal token');
});

test('readonly takes precedence over valid edit tokens', async (t) => {
    const ctx = await createTestServer({ universalEditToken: 'universal-secret' });
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });
    const note = ctx.store.createNote('readonly-token-note', { readonly: true, editTokenRequired: true });

    const response = await fetch(`${ctx.baseUrl}/api/readonly-token-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'If-Match': String(note.version), 'X-Note-Token': note.editToken },
        body: 'blocked'
    });

    assert.equal(response.status, 403);
});

test('invalid JSON content is rejected instead of reporting false success', async (t) => {
    const ctx = await createTestServer();
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });
    const note = await createNote(ctx, 'bad-json-content');

    const response = await fetch(`${ctx.baseUrl}/api/bad-json-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'If-Match': String(note.version) },
        body: JSON.stringify({ content: { nested: true } })
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Invalid note content' });
});

test('rejects missing and stale If-Match versions', async (t) => {
    const ctx = await createTestServer();
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });
    const note = await createNote(ctx, 'conflict');

    const missing = await fetch(`${ctx.baseUrl}/api/conflict`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'blocked'
    });
    assert.equal(missing.status, 428);

    const first = await fetch(`${ctx.baseUrl}/api/conflict`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'If-Match': String(note.version) },
        body: 'first'
    });
    assert.equal(first.status, 200);

    const stale = await fetch(`${ctx.baseUrl}/api/conflict`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'If-Match': String(note.version) },
        body: 'stale'
    });
    assert.equal(stale.status, 409);
    const body = await stale.json();
    assert.equal(body.error, 'Version conflict');
    assert.equal(body.version, 2);
    assert.equal(body.content, 'first');
});

test('public readonly endpoint is removed', async (t) => {
    const ctx = await createTestServer();
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });
    await createNote(ctx, 'locked');

    const response = await fetch(`${ctx.baseUrl}/api/locked/readonly`, { method: 'POST' });
    assert.equal(response.status, 404);
});

test('blacklisted user-created notes are marked illegal and become readonly for public users', async (t) => {
    const ctx = await createTestServer({ noteIdBlacklist: ['bad'] });
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });
    ctx.store.createNote('bad', { content: 'illegal content', createdByAdmin: false });

    const view = await fetch(`${ctx.baseUrl}/api/bad`);
    const body = await view.json();
    assert.equal(view.status, 200);
    assert.equal(body.content, 'illegal content');
    assert.equal(body.canEdit, false);
    assert.equal(ctx.store.getNoteRecord('bad').readonly, true);
    assert.equal(typeof ctx.store.getNoteRecord('bad').illegalMarkedAt, 'string');

    const save = await fetch(`${ctx.baseUrl}/api/bad`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'If-Match': String(body.version) },
        body: 'blocked'
    });
    assert.equal(save.status, 403);
});

test('blacklisted admin-created notes remain public when not hidden', async (t) => {
    const ctx = await createTestServer({ noteIdBlacklist: ['reserved'] });
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });
    ctx.store.createNote('reserved', { content: 'admin content', createdByAdmin: true });

    const response = await fetch(`${ctx.baseUrl}/api/reserved`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.content, 'admin content');
    assert.equal(body.canEdit, true);
});

test('hidden notes return 404 publicly but remain visible in admin', async (t) => {
    const ctx = await createTestServer({ adminUsername: 'admin', adminPasswordHash: hashPassword('password') });
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });
    ctx.store.createNote('hidden-note', { content: 'secret' });
    ctx.store.setHidden('hidden-note', true);

    assert.equal((await fetch(`${ctx.baseUrl}/api/hidden-note`)).status, 404);
    const cookie = await loginAdmin(ctx);
    const detail = await fetch(`${ctx.baseUrl}/admin/notes/hidden-note`, { headers: { Cookie: cookie } });
    assert.equal(detail.status, 200);
    assert.match(await detail.text(), /secret/);
});

test('markdown view sanitizes raw HTML and uses local assets', async (t) => {
    const ctx = await createTestServer();
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });
    const note = await createNote(ctx, 'xss');

    await fetch(`${ctx.baseUrl}/api/xss`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'If-Match': String(note.version) },
        body: '<a id="usage"></a>\n\n~~deleted~~\n\n<img src="https://example.test/x.png" onerror="alert(1)">\n\n```mermaid\ngraph TD; A-->B;\n```'
    });

    const response = await fetch(`${ctx.baseUrl}/xss.md`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /<a id="usage"><\/a>/);
    assert.match(html, /<del>deleted<\/del>/);
    assert.match(html, /code class="hljs language-mermaid"/);
    assert.match(html, /<img src="https:\/\/example.test\/x.png" \/>/);
    assert.doesNotMatch(html, /onerror/);
    assert.match(html, /\/vendor\/mermaid\/mermaid.min.js/);
    assert.match(html, /\/markdown-view.js/);
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
});

test('html view uses a sandbox without same-origin escape hatch', async (t) => {
    const ctx = await createTestServer();
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });
    const note = await createNote(ctx, 'html-demo');

    await fetch(`${ctx.baseUrl}/api/html-demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'If-Match': String(note.version) },
        body: '<h1>Hello</h1>'
    });

    const response = await fetch(`${ctx.baseUrl}/html-demo.html`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /<iframe sandbox srcdoc=/);
    assert.doesNotMatch(html, /allow-same-origin/);
});

test('admin can inspect notes and change readonly with csrf', async (t) => {
    const ctx = await createTestServer({ adminUsername: 'admin', adminPasswordHash: hashPassword('password') });
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });
    ctx.store.createNote('admin-note', { content: 'secret content' });
    const cookie = await loginAdmin(ctx);

    const list = await fetch(`${ctx.baseUrl}/admin`, { headers: { Cookie: cookie } });
    assert.match(await list.text(), /Token 编辑模式/);

    const detail = await fetch(`${ctx.baseUrl}/admin/notes/admin-note`, { headers: { Cookie: cookie } });
    const detailHtml = await detail.text();
    assert.equal(detail.status, 200);
    assert.match(detailHtml, /secret content/);
    const csrf = detailHtml.match(/name="csrf" value="([^"]+)"/)[1];

    const update = await fetch(`${ctx.baseUrl}/admin/notes/admin-note/readonly`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
        redirect: 'manual',
        body: new URLSearchParams({ csrf, readonly: 'true' })
    });

    assert.equal(update.status, 303);
    assert.equal(ctx.store.getNoteRecord('admin-note').readonly, true);
});

test('admin can edit readonly note content directly', async (t) => {
    const ctx = await createTestServer({ adminUsername: 'admin', adminPasswordHash: hashPassword('password') });
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });
    ctx.store.createNote('readonly-edit', { content: 'before', readonly: true });
    const cookie = await loginAdmin(ctx);
    const csrf = await getCsrf(ctx, cookie, '/admin/notes/readonly-edit');

    const update = await fetch(`${ctx.baseUrl}/admin/notes/readonly-edit/content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
        redirect: 'manual',
        body: new URLSearchParams({ csrf, content: 'after' })
    });

    assert.equal(update.status, 303);
    const record = ctx.store.getNoteRecord('readonly-edit');
    assert.equal(record.content, 'after');
    assert.equal(record.readonly, true);
    assert.equal(record.version, 2);
});

test('admin can create readonly token-mode notes and delete notes', async (t) => {
    const ctx = await createTestServer({ adminUsername: 'admin', adminPasswordHash: hashPassword('password'), noteIdBlacklist: ['blocked'] });
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });
    const cookie = await loginAdmin(ctx);
    const csrf = await getCsrf(ctx, cookie);

    const blacklistedAdminCreate = await fetch(`${ctx.baseUrl}/admin/notes/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
        body: new URLSearchParams({ csrf, id: 'blocked' })
    });
    assert.equal(blacklistedAdminCreate.status, 200);
    assert.equal(ctx.store.getNoteRecord('blocked').createdByAdmin, true);

    const create = await fetch(`${ctx.baseUrl}/admin/notes/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
        body: new URLSearchParams({ csrf, id: 'readonly-created' })
    });
    const html = await create.text();
    assert.equal(create.status, 200);
    assert.match(html, /笔记编辑 Token：/);
    assert.equal(ctx.store.getNoteRecord('readonly-created').readonly, true);
    assert.equal(ctx.store.getNoteRecord('readonly-created').editTokenRequired, true);

    const remove = await fetch(`${ctx.baseUrl}/admin/notes/readonly-created/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
        redirect: 'manual',
        body: new URLSearchParams({ csrf })
    });
    assert.equal(remove.status, 303);
    assert.equal(ctx.store.getNoteRecord('readonly-created'), null);
});

test('admin can enable, disable, and rotate note token edit mode', async (t) => {
    const ctx = await createTestServer({ adminUsername: 'admin', adminPasswordHash: hashPassword('password') });
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });
    ctx.store.createNote('mode-note', { content: 'x' });
    const cookie = await loginAdmin(ctx);
    const csrf = await getCsrf(ctx, cookie, '/admin/notes/mode-note');

    const enable = await fetch(`${ctx.baseUrl}/admin/notes/mode-note/token-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
        body: new URLSearchParams({ csrf, required: 'true' })
    });
    const enableHtml = await enable.text();
    assert.equal(enable.status, 200);
    assert.match(enableHtml, /笔记编辑 Token：/);
    assert.equal(ctx.store.getNoteRecord('mode-note').editTokenRequired, true);
    assert.equal(typeof ctx.store.getNoteRecord('mode-note').editTokenHash, 'string');

    const rotate = await fetch(`${ctx.baseUrl}/admin/notes/mode-note/rotate-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
        body: new URLSearchParams({ csrf })
    });
    assert.equal(rotate.status, 200);
    assert.match(await rotate.text(), /笔记编辑 Token：/);

    const disable = await fetch(`${ctx.baseUrl}/admin/notes/mode-note/token-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
        redirect: 'manual',
        body: new URLSearchParams({ csrf, required: 'false' })
    });
    assert.equal(disable.status, 303);
    assert.equal(ctx.store.getNoteRecord('mode-note').editTokenRequired, false);
    assert.equal(ctx.store.getNoteRecord('mode-note').editTokenHash, null);
});

test('admin path can be hidden behind entry token', async (t) => {
    const ctx = await createTestServer({
        adminUsername: 'admin',
        adminPasswordHash: hashPassword('password'),
        adminPath: '/manage-secret',
        adminEntryToken: 'entry-secret'
    });
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });

    assert.equal((await fetch(`${ctx.baseUrl}/admin/login`)).status, 404);
    assert.equal((await fetch(`${ctx.baseUrl}/manage-secret/login`)).status, 404);

    const entry = await fetch(`${ctx.baseUrl}/manage-secret?entry=entry-secret`, { redirect: 'manual' });
    assert.equal(entry.status, 303);
    assert.equal(entry.headers.get('location'), '/manage-secret/login');
    const entryCookie = entry.headers.get('set-cookie').split(';')[0];

    const login = await fetch(`${ctx.baseUrl}/manage-secret/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: entryCookie },
        redirect: 'manual',
        body: new URLSearchParams({ username: 'admin', password: 'password' })
    });
    assert.equal(login.status, 303);
    assert.equal(login.headers.get('location'), '/manage-secret');
});

test('admin entry token and universal edit token rotation require confirmation', async (t) => {
    const ctx = await createTestServer({
        adminUsername: 'admin',
        adminPasswordHash: hashPassword('password'),
        adminPath: '/manage-secret',
        adminEntryToken: 'old-entry',
        universalEditToken: 'old-universal'
    });
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });
    const cookie = await loginAdmin(ctx, '/manage-secret');
    const csrf = await getCsrf(ctx, cookie, '/manage-secret/settings');

    const generatedEntry = await fetch(`${ctx.baseUrl}/manage-secret/settings/admin-entry-token/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
        body: new URLSearchParams({ csrf })
    });
    const entryToken = (await generatedEntry.text()).match(/<div class="token">([^<]+)<\/div>/)[1];
    assert.notEqual(entryToken, 'old-entry');
    assert.equal(ctx.config.adminEntryToken, 'old-entry');

    const confirmEntry = await fetch(`${ctx.baseUrl}/manage-secret/settings/admin-entry-token/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
        redirect: 'manual',
        body: new URLSearchParams({ csrf })
    });
    assert.equal(confirmEntry.status, 303);
    assert.ok(ctx.config.adminEntryToken.startsWith('sha256:'), 'entry token should be hashed');

    const generatedUniversal = await fetch(`${ctx.baseUrl}/manage-secret/settings/universal-edit-token/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
        body: new URLSearchParams({ csrf })
    });
    const universalToken = (await generatedUniversal.text()).match(/<div class="token">([^<]+)<\/div>/)[1];
    assert.notEqual(universalToken, 'old-universal');
    assert.equal(ctx.config.universalEditToken, 'old-universal');

    const confirmUniversal = await fetch(`${ctx.baseUrl}/manage-secret/settings/universal-edit-token/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
        redirect: 'manual',
        body: new URLSearchParams({ csrf })
    });
    assert.equal(confirmUniversal.status, 303);
    assert.ok(ctx.config.universalEditToken.startsWith('sha256:'), 'universal edit token should be hashed');
});

test('admin csrf protection rejects forged mutations', async (t) => {
    const ctx = await createTestServer({ adminUsername: 'admin', adminPasswordHash: hashPassword('password') });
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });
    ctx.store.createNote('csrf-note');
    const cookie = await loginAdmin(ctx);

    const forged = await fetch(`${ctx.baseUrl}/admin/notes/csrf-note/readonly`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
        body: new URLSearchParams({ csrf: 'wrong', readonly: 'true' })
    });

    assert.equal(forged.status, 403);
    assert.equal(ctx.store.getNoteRecord('csrf-note').readonly, false);
});

test('admin can list and purge empty notes, then configure settings', async (t) => {
    const ctx = await createTestServer({ adminUsername: 'admin', adminPasswordHash: hashPassword('password') });
    t.after(() => {
        ctx.server.close();
        ctx.store.close();
    });
    const note = ctx.store.createNote('empty-admin-note');
    ctx.store.saveNote('empty-admin-note', '', { expectedVersion: note.version });
    const cookie = await loginAdmin(ctx);

    const emptyList = await fetch(`${ctx.baseUrl}/admin?filter=empty`, { headers: { Cookie: cookie } });
    const emptyHtml = await emptyList.text();
    assert.match(emptyHtml, /empty-admin-note/);
    assert.match(emptyHtml, /空笔记时长/);

    const csrf = await getCsrf(ctx, cookie, '/admin/settings');
    const purge = await fetch(`${ctx.baseUrl}/admin/settings/purge-empty-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
        body: new URLSearchParams({ csrf })
    });
    assert.equal(purge.status, 200);
    assert.equal(ctx.store.getNoteRecord('empty-admin-note'), null);

    const update = await fetch(`${ctx.baseUrl}/admin/settings/empty-retention`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
        redirect: 'manual',
        body: new URLSearchParams({ csrf, adminPath: '/manage-next', emptyNoteRetentionDays: '7', illegalNoteRetentionDays: '365', activityLogRetentionDays: '180', randomIdSaturationRatio: '0.6', noteIdBlacklist: 'api,admin,vendor' })
    });
    assert.equal(update.status, 303);
    assert.equal(ctx.config.emptyNoteRetentionDays, 7);
    assert.equal(ctx.config.adminPath, '/manage-next');
    assert.equal(ctx.config.noteIdBlacklist.includes('manage-next'), true);
});

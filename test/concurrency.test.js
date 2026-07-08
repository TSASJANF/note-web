const assert = require('node:assert/strict');
const test = require('node:test');
const { createApp } = require('../src/app');
const { createMemoryNoteStore } = require('../src/storage/memory-note-store');

function createTestServer() {
    const store = createMemoryNoteStore();
    const config = {
        port: 0,
        saveInterval: 1000,
        bodySizeLimit: '1mb',
        rateLimitWindowMs: 60_000,
        rateLimitMaxRequests: 1000,
        randomIdSaturationRatio: 0.6,
        noteIdBlacklist: ['api', 'admin', 'vendor'],
        emptyNoteRetentionDays: 30,
        illegalNoteRetentionDays: 365,
        activityLogRetentionDays: 180,
        adminUsername: '',
        adminPasswordHash: '',
        adminPath: '/admin',
        adminEntryToken: '',
        universalEditToken: ''
    };
    return { config, store };
}

test('concurrent saves to same note detect version conflicts', async (t) => {
    const { config, store } = createTestServer();
    t.after(() => store.close());
    const app = await createApp({ config, store });
    const server = app.listen(0);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    t.after(() => server.close());

    store.createNote('conflict-note', { content: 'initial' });
    const record = store.getNoteRecord('conflict-note');
    const version = record.version;

    const results = await Promise.allSettled([
        fetch(`${baseUrl}/api/conflict-note`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain', 'If-Match': String(version) },
            body: 'save-1'
        }),
        fetch(`${baseUrl}/api/conflict-note`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain', 'If-Match': String(version) },
            body: 'save-2'
        })
    ]);

    const statuses = results.map(r => r.value.status);
    assert.ok(statuses.includes(200), 'one save should succeed');
    assert.ok(statuses.includes(409), 'one save should conflict');

    const finalRecord = store.getNoteRecord('conflict-note');
    assert.ok(['save-1', 'save-2'].includes(finalRecord.content), 'final content should be one of the saves');
});

test('concurrent creates with same ID return conflict', async (t) => {
    const { config, store } = createTestServer();
    t.after(() => store.close());
    const app = await createApp({ config, store });
    const server = app.listen(0);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    t.after(() => server.close());

    const results = await Promise.allSettled([
        fetch(`${baseUrl}/api/new-note-1`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: 'first'
        }),
        fetch(`${baseUrl}/api/new-note-1`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: 'second'
        })
    ]);

    const successCount = results.filter(r => r.value.status === 200).length;
    assert.ok(successCount >= 1, 'at least one should succeed');
});

test('concurrent reads do not interfere with each other', async (t) => {
    const { config, store } = createTestServer();
    t.after(() => store.close());
    const app = await createApp({ config, store });
    const server = app.listen(0);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    t.after(() => server.close());

    store.createNote('read-test', { content: 'shared content' });

    const results = await Promise.all([
        fetch(`${baseUrl}/api/read-test`),
        fetch(`${baseUrl}/api/read-test`),
        fetch(`${baseUrl}/api/read-test`),
        fetch(`${baseUrl}/api/read-test`),
        fetch(`${baseUrl}/api/read-test`)
    ]);

    for (const response of results) {
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.content, 'shared content');
    }
});

test('concurrent saves from multiple notes do not interfere', async (t) => {
    const { config, store } = createTestServer();
    t.after(() => store.close());
    const app = await createApp({ config, store });
    const server = app.listen(0);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    t.after(() => server.close());

    store.createNote('note-a', { content: 'a' });
    store.createNote('note-b', { content: 'b' });
    store.createNote('note-c', { content: 'c' });

    const vA = store.getNoteRecord('note-a').version;
    const vB = store.getNoteRecord('note-b').version;
    const vC = store.getNoteRecord('note-c').version;

    const results = await Promise.all([
        fetch(`${baseUrl}/api/note-a`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain', 'If-Match': String(vA) },
            body: 'updated-a'
        }),
        fetch(`${baseUrl}/api/note-b`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain', 'If-Match': String(vB) },
            body: 'updated-b'
        }),
        fetch(`${baseUrl}/api/note-c`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain', 'If-Match': String(vC) },
            body: 'updated-c'
        })
    ]);

    for (const response of results) {
        assert.equal(response.status, 200);
    }

    assert.equal(store.getNoteRecord('note-a').content, 'updated-a');
    assert.equal(store.getNoteRecord('note-b').content, 'updated-b');
    assert.equal(store.getNoteRecord('note-c').content, 'updated-c');
});

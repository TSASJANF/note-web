const express = require('express');
const path = require('path');
const { customAlphabet } = require('nanoid');
const { createMysqlNoteStore } = require('./storage/mysql-note-store');
const { loadConfig, verifyConfigToken } = require('./config');
const { renderMarkdown } = require('./markdown');
const { buildHtmlView, buildIllegalNoteView, buildMarkdownView } = require('./views');
const { HttpError } = require('./errors');
const { registerAdminRoutes } = require('./admin/index');
const {
    validateNoteId,
    securityHeaders,
    markdownSecurityHeaders,
    createRateLimiter,
    errorHandler
} = require('./middleware');
const { MAX_ID_ATTEMPTS, MIN_RANDOM_ID_LENGTH, MAX_RANDOM_ID_LENGTH, RANDOM_ID_ALPHABET } = require('./constants');

const { getClientIp } = require('./utils');

const randomId = customAlphabet(RANDOM_ID_ALPHABET);

function normalizeBlacklist(config) {
    return new Set((config.noteIdBlacklist || []).map((id) => String(id).toLowerCase()));
}

function isBlacklistedNoteId(id, config) {
    return normalizeBlacklist(config).has(String(id).toLowerCase());
}

async function getRandomIdLength(store, config) {
    const saturationRatio = config.randomIdSaturationRatio ?? 0.6;
    for (let length = MIN_RANDOM_ID_LENGTH; length <= MAX_RANDOM_ID_LENGTH; length += 1) {
        const capacity = RANDOM_ID_ALPHABET.length ** length;
        const used = await store.countNotesByIdLength(length);
        if (used < capacity * saturationRatio) {
            return length;
        }
    }

    return MAX_RANDOM_ID_LENGTH;
}

async function generateNoteId(store, config) {
    const length = await getRandomIdLength(store, config);
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
        const id = randomId(length);
        if (!await store.noteExists(id) && !isBlacklistedNoteId(id, config)) {
            return await store.createNote(id);
        }
    }

    throw new Error('Failed to generate unique note ID');
}

function getAccessToken(req) {
    return req.get('X-Note-Token') || req.get('X-Edit-Token') || '';
}

function getEditTokenType(record, token, config, store) {
    if (!record?.editTokenRequired) {
        return 'none';
    }
    if (token && store.hasEditAccess(record, token)) {
        return 'own';
    }
    if (token && config.universalEditToken && verifyConfigToken(token, config.universalEditToken)) {
        return 'universal';
    }
    return null;
}

function shouldHideFromPublic(record) {
    return record?.hidden === true;
}

async function markIllegalIfNeeded(record, store, config) {
    if (!record || !isBlacklistedNoteId(record.id, config) || record.createdByAdmin) {
        return false;
    }
    await store.markIllegal(record.id);
    return true;
}

function getRequestContent(req) {
    if (typeof req.body === 'string') {
        return req.body;
    }

    if (req.is('application/json') && typeof req.body?.content === 'string') {
        return req.body.content;
    }

    return null;
}

async function createApp(options = {}) {
    const config = options.config || loadConfig();
    let store;
    if (options.store) {
        store = options.store;
    } else {
        store = await createMysqlNoteStore(config.mysql);
        console.log('[SERVER] Using MySQL storage engine');
    }
    const app = express();
    if (config.trustProxy) {
        app.set('trust proxy', true);
    }
    const retentionDays = Number(config.emptyNoteRetentionDays ?? 30);
    setImmediate(() => {
        try {
            if (Number.isFinite(retentionDays) && retentionDays > 0) {
                store.purgeDeletedOlderThan?.(retentionDays);
            }
            store.purgeIllegalOlderThan?.(config.illegalNoteRetentionDays ?? 365);
            store.purgeActivityOlderThan?.(config.activityLogRetentionDays ?? 180);
        } catch {
            // Ignore errors from purge tasks (e.g., store already closed)
        }
    });

    app.use(securityHeaders);
    app.use(createRateLimiter({
        windowMs: config.rateLimitWindowMs,
        maxRequests: config.rateLimitMaxRequests
    }));

    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - start;
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
        });
        next();
    });

    app.get('/', async (req, res, next) => {
        try {
            const note = await generateNoteId(store, config);
            store.logActivity?.({ ip: getClientIp(req), noteId: note.id, action: 'create' });
            res.redirect(302, `/${note.id}`);
        } catch (err) {
            next(err);
        }
    });

    app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h', etag: true }));
    app.use('/vendor/mermaid', express.static(path.join(__dirname, '..', 'node_modules', 'mermaid', 'dist'), { maxAge: '7d', etag: true }));
    app.use('/vendor/highlight.js/styles', express.static(path.join(__dirname, '..', 'node_modules', 'highlight.js', 'styles'), { maxAge: '7d', etag: true }));
    registerAdminRoutes(app, { config, store, express });

    app.get('/api/config', (req, res) => {
        res.json({ saveInterval: config.saveInterval });
    });

    app.get('/api/:id', validateNoteId, async (req, res, next) => {
        try {
            const { id } = req.params;
            let record = await store.getNoteRecord(id);
            if (!record) {
                if (isBlacklistedNoteId(id, config)) {
                    throw new HttpError(404, 'Note not found');
                }
                await store.createNote(id, { creatorIp: getClientIp(req), createdByAdmin: false });
                record = await store.getNoteRecord(id);
                store.logActivity?.({ ip: getClientIp(req), noteId: id, action: 'create' });
            }
            if (shouldHideFromPublic(record)) {
                throw new HttpError(404, 'Note not found');
            }
            const becameIllegal = await markIllegalIfNeeded(record, store, config);
            if (becameIllegal) {
                record = await store.getNoteRecord(id);
            }
            const token = getAccessToken(req);
            const tokenType = getEditTokenType(record, token, config, store);
            const canEdit = record?.readonly !== true && record?.illegalMarkedAt == null && (!record?.editTokenRequired || Boolean(tokenType));
            store.logActivity?.({ ip: getClientIp(req), noteId: id, action: 'view', metadata: { viewType: 'editor' } });
            res.json({
                id,
                content: record?.content ?? '',
                readonly: record?.readonly === true || !canEdit,
                canEdit,
                editTokenRequired: record?.editTokenRequired === true,
                version: record?.version ?? 0,
                deletedAt: record?.deletedAt ?? null,
                updatedAt: record?.updatedAt ?? null
            });
        } catch (err) {
            next(err);
        }
    });

    app.post(
        '/api/:id',
        validateNoteId,
        express.text({ type: 'text/plain', limit: config.bodySizeLimit }),
        express.json({ type: 'application/json', limit: config.bodySizeLimit }),
        async (req, res, next) => {
            try {
                const { id } = req.params;
                const record = await store.getNoteRecord(id);
                const token = getAccessToken(req);
                let createdByPost = false;

                let target = record;
                if (!target) {
                    if (isBlacklistedNoteId(id, config)) {
                        throw new HttpError(404, 'Note not found');
                    }
                    await store.createNote(id, { creatorIp: getClientIp(req), createdByAdmin: false });
                    target = await store.getNoteRecord(id);
                    createdByPost = true;
                    store.logActivity?.({ ip: getClientIp(req), noteId: id, action: 'create', metadata: { via: 'post' } });
                }

                if (shouldHideFromPublic(target)) {
                    throw new HttpError(404, 'Note not found');
                }

                if (await markIllegalIfNeeded(target, store, config)) {
                    target = await store.getNoteRecord(id);
                }

                if (target.readonly) {
                    throw new HttpError(403, 'Note is readonly');
                }

                if (target.illegalMarkedAt) {
                    throw new HttpError(403, 'Illegal note is readonly');
                }

                const tokenType = getEditTokenType(target, token, config, store);
                if (target.editTokenRequired && !tokenType) {
                    throw new HttpError(403, 'Missing or invalid edit token');
                }

                const content = getRequestContent(req);
                if (content === null) {
                    throw new HttpError(400, 'Invalid note content');
                }

                const result = await store.saveNote(id, content, {
                    expectedVersion: req.get('If-Match') || req.body?.version || (createdByPost ? target.version : undefined)
                });

                if (!result.ok) {
                    if (result.reason === 'version_conflict') {
                        return res.status(409).json({
                            error: 'Version conflict',
                            version: result.record.version,
                            content: result.record.content,
                            updatedAt: result.record.updatedAt
                        });
                    }
                    if (result.reason === 'missing_version') {
                        throw new HttpError(428, 'Missing If-Match note version');
                    }
                    if (result.reason === 'readonly') {
                        throw new HttpError(403, 'Note is readonly');
                    }
                    throw new Error('Failed to save note');
                }

                res.set('ETag', `"${result.record.version}"`);
                store.logActivity?.({ ip: getClientIp(req), noteId: id, action: 'edit', metadata: { tokenMode: target.editTokenRequired === true, tokenType: tokenType || 'none' } });
                res.json({ success: true, version: result.record.version, updatedAt: result.record.updatedAt });
            } catch (err) {
                next(err);
            }
        }
    );

    app.post('/api/:id/readonly', validateNoteId, (req, res) => {
        res.status(404).json({ error: 'Not found' });
    });

    app.get('/:id.md', validateNoteId, markdownSecurityHeaders, async (req, res, next) => {
        try {
            const { id } = req.params;
            const record = await store.getNoteRecord(id);
            if (!record || shouldHideFromPublic(record)) {
                return res.status(404).send('Not found');
            }
            const isIllegal = await markIllegalIfNeeded(record, store, config);
            if (isIllegal) {
                store.logActivity?.({ ip: getClientIp(req), noteId: id, action: 'view', metadata: { viewType: 'illegal-markdown' } });
                return res.send(buildIllegalNoteView(id, record.content, config.illegalNoteRetentionDays));
            }
            const content = record.content;
            if (content.length === 0) {
                return res.sendFile(path.join(__dirname, '..', 'public', 'empty.html'));
            }

            store.logActivity?.({ ip: getClientIp(req), noteId: id, action: 'view', metadata: { viewType: 'markdown' } });
            res.send(buildMarkdownView(id, renderMarkdown(content)));
        } catch (err) {
            next(err);
        }
    });

    app.get('/:id.html', validateNoteId, async (req, res, next) => {
        try {
            const { id } = req.params;
            const record = await store.getNoteRecord(id);
            if (!record || shouldHideFromPublic(record)) {
                return res.status(404).send('Not found');
            }
            const isIllegal = await markIllegalIfNeeded(record, store, config);
            if (isIllegal) {
                store.logActivity?.({ ip: getClientIp(req), noteId: id, action: 'view', metadata: { viewType: 'illegal-html' } });
                return res.send(buildIllegalNoteView(id, record.content, config.illegalNoteRetentionDays));
            }
            const content = record.content;
            if (content.length === 0) {
                return res.sendFile(path.join(__dirname, '..', 'public', 'empty.html'));
            }

            store.logActivity?.({ ip: getClientIp(req), noteId: id, action: 'view', metadata: { viewType: 'html' } });
            res.send(buildHtmlView(id, content));
        } catch (err) {
            next(err);
        }
    });

    app.get('/:id', validateNoteId, async (req, res) => {
        const record = await store.getNoteRecord(req.params.id);
        if (!record && isBlacklistedNoteId(req.params.id, config)) {
            return res.status(404).send('Not found');
        }
        if (shouldHideFromPublic(record)) {
            return res.status(404).send('Not found');
        }
        if (await markIllegalIfNeeded(record, store, config)) {
            store.logActivity?.({ ip: getClientIp(req), noteId: req.params.id, action: 'view', metadata: { viewType: 'illegal-editor' } });
            return res.send(buildIllegalNoteView(req.params.id, record.content, config.illegalNoteRetentionDays));
        }
        res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    });

    app.use((req, res) => {
        res.status(404).json({ error: 'Not found' });
    });

    app.use(errorHandler);

    app.store = store;
    return app;
}

module.exports = { createApp, generateNoteId, getRequestContent };

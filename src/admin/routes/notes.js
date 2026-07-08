const { ID_REGEX, MAX_ID_LENGTH } = require('../../constants');
const { getClientIp } = require('../../utils');
const { requireAdmin, requireCsrf } = require('../middleware');
const { renderList } = require('../views/list');
const { renderNote } = require('../views/note');

function registerNoteRoutes(app, { config, store, sessions, parseForm, basePath, loginPath }) {
    app.get(basePath, requireAdmin(sessions, loginPath), async (req, res) => {
        const filter = ['empty', 'illegal'].includes(req.query.filter) ? req.query.filter : 'all';
        const notes = await store.listNotes({ limit: 200, filter });
        res.send(renderList(notes, req.adminSession.session.csrf, basePath));
    });

    app.post(`${basePath}/notes/create`, parseForm, requireAdmin(sessions, loginPath), requireCsrf, async (req, res) => {
        const id = String(req.body.id || '').trim();
        if (!id || id.length > MAX_ID_LENGTH || !ID_REGEX.test(id)) {
            return res.status(400).send('无效的笔记 ID');
        }
        if (await store.noteExists(id)) {
            return res.status(409).send('笔记已存在');
        }

        const ip = getClientIp(req);
        const note = await store.createNote(id, { readonly: true, content: '', creatorIp: ip, createdByAdmin: true, editTokenRequired: true });
        store.logActivity({ ip, noteId: id, action: 'create', isAdmin: true });
        res.send(renderNote(note, req.adminSession.session.csrf, basePath, note));
    });

    app.get(`${basePath}/notes/:id`, requireAdmin(sessions, loginPath), async (req, res) => {
        const note = await store.getNoteRecord(req.params.id);
        if (!note) {
            return res.status(404).send('笔记不存在');
        }
        res.send(renderNote(note, req.adminSession.session.csrf, basePath));
    });

    app.post(`${basePath}/notes/:id/readonly`, parseForm, requireAdmin(sessions, loginPath), requireCsrf, async (req, res) => {
        await store.setReadonly(req.params.id, req.body.readonly === 'true');
        store.logActivity({ ip: getClientIp(req), noteId: req.params.id, action: 'set_readonly', isAdmin: true });
        res.redirect(303, `${basePath}/notes/${encodeURIComponent(req.params.id)}`);
    });

    app.post(`${basePath}/notes/:id/token-mode`, parseForm, requireAdmin(sessions, loginPath), requireCsrf, async (req, res) => {
        const result = await store.setTokenMode(req.params.id, req.body.required === 'true');
        if (!result) {
            return res.status(404).send('笔记不存在');
        }
        store.logActivity({ ip: getClientIp(req), noteId: req.params.id, action: result.editTokenRequired ? 'enable_token_mode' : 'disable_token_mode', isAdmin: true });
        if (result.editToken) {
            return res.send(renderNote(result, req.adminSession.session.csrf, basePath, result));
        }
        res.redirect(303, `${basePath}/notes/${encodeURIComponent(req.params.id)}`);
    });

    app.post(`${basePath}/notes/:id/hidden`, parseForm, requireAdmin(sessions, loginPath), requireCsrf, async (req, res) => {
        await store.setHidden(req.params.id, req.body.hidden === 'true');
        store.logActivity({ ip: getClientIp(req), noteId: req.params.id, action: 'set_hidden', isAdmin: true });
        res.redirect(303, `${basePath}/notes/${encodeURIComponent(req.params.id)}`);
    });

    app.post(`${basePath}/notes/:id/content`, parseForm, requireAdmin(sessions, loginPath), requireCsrf, async (req, res) => {
        const updated = await store.adminUpdateNoteContent(req.params.id, req.body.content || '');
        if (!updated) {
            return res.status(404).send('笔记不存在');
        }
        store.logActivity({ ip: getClientIp(req), noteId: req.params.id, action: 'edit', isAdmin: true });
        res.redirect(303, `${basePath}/notes/${encodeURIComponent(req.params.id)}`);
    });

    app.post(`${basePath}/notes/:id/rotate-tokens`, parseForm, requireAdmin(sessions, loginPath), requireCsrf, async (req, res) => {
        const rotated = await store.rotateTokens(req.params.id);
        if (!rotated) {
            return res.status(404).send('笔记不存在');
        }
        store.logActivity({ ip: getClientIp(req), noteId: req.params.id, action: 'rotate_tokens', isAdmin: true });
        res.send(renderNote(rotated, req.adminSession.session.csrf, basePath, rotated));
    });

    app.post(`${basePath}/notes/:id/delete`, parseForm, requireAdmin(sessions, loginPath), requireCsrf, async (req, res) => {
        if (!await store.deleteNote(req.params.id)) {
            return res.status(404).send('笔记不存在');
        }
        store.logActivity({ ip: getClientIp(req), noteId: req.params.id, action: 'delete', isAdmin: true });
        res.redirect(303, basePath);
    });
}

module.exports = { registerNoteRoutes };

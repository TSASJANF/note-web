(function() {
    'use strict';

    // DOM elements
    const editor = document.getElementById('editor');
    const noteId = window.location.pathname.slice(1).replace(/\/$/, '');

    // State
    let lastContent = '';
    let saveInterval = 1000;
    let saveTimer = null;
    let isReadonly = false;
    let isSaving = false;
    let saveAgain = false;
    let version = 0;
    let noteToken = '';

    function getTokenStorageKey() {
        return `note-token:${noteId}`;
    }

    function consumeTokenFromUrl() {
        const url = new URL(window.location.href);
        const token = url.searchParams.get('token');
        if (!token) {
            return localStorage.getItem(getTokenStorageKey()) || '';
        }

        localStorage.setItem(getTokenStorageKey(), token);
        url.searchParams.delete('token');
        window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
        return token;
    }

    // Config API
    async function loadConfig() {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            saveInterval = Math.max(100, data.saveInterval || 1000);
        } catch (err) {
            console.error('[App] Failed to load config:', err.message);
        }
    }

    // Note API
    async function loadNote() {
        try {
            const response = await fetch(`/api/${noteId}`, {
                headers: noteToken ? { 'X-Note-Token': noteToken } : {}
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            editor.value = data.content || '';
            lastContent = editor.value;
            isReadonly = Boolean(data.readonly);
            version = Number(data.version) || 0;

            if (isReadonly) {
                editor.readOnly = true;
                editor.setAttribute('aria-readonly', 'true');
            } else {
                editor.focus();
            }
            editor.classList.add('ready');
        } catch (err) {
            console.error('[App] Failed to load note:', err.message);
            editor.value = '';
            lastContent = '';
            editor.classList.add('ready');
        }
    }

    // Save note
    async function saveNote() {
        if (isReadonly) {
            return;
        }

        if (isSaving) {
            saveAgain = true;
            return;
        }

        const content = editor.value;
        if (content === lastContent) {
            return;
        }

        isSaving = true;
        saveAgain = false;
        try {
            const response = await fetch(`/api/${noteId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain',
                    'If-Match': String(version),
                    ...(noteToken ? { 'X-Note-Token': noteToken } : {})
                },
                body: content
            });
            if (response.ok) {
                const data = await response.json();
                lastContent = content;
                version = Number(data.version) || version;
            } else if (response.status === 409) {
                console.error('[App] Save conflict: remote note changed');
            } else {
                console.error('[App] Save failed:', response.status);
            }
        } catch (err) {
            console.error('[App] Failed to save note:', err.message);
        } finally {
            isSaving = false;
            if (saveAgain || editor.value !== lastContent) {
                saveNote();
            }
        }
    }

    // Auto-save: poll for changes
    function startAutoSave() {
        stopAutoSave();
        if (!isReadonly) {
            saveTimer = setInterval(saveNote, saveInterval);
        }
    }

    function stopAutoSave() {
        if (saveTimer) {
            clearInterval(saveTimer);
            saveTimer = null;
        }
    }

    // Initialize
    async function init() {
        if (!noteId) {
            window.location.href = '/';
            return;
        }
        noteToken = consumeTokenFromUrl();
        await loadConfig();
        await loadNote();
        startAutoSave();
    }

    // Event: save before page unload
    function saveOnExit() {
        if (isReadonly) {
            return;
        }

        const content = editor.value;
        if (content !== lastContent) {
            fetch(`/api/${noteId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain',
                    'If-Match': String(version),
                    ...(noteToken ? { 'X-Note-Token': noteToken } : {})
                },
                body: content,
                keepalive: true
            }).catch(() => {});
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            saveOnExit();
        }
    });

    window.addEventListener('beforeunload', () => {
        saveOnExit();
    });

    // Public API
    window.setSaveInterval = function(ms) {
        const parsed = parseInt(ms, 10);
        if (parsed > 0) {
            saveInterval = parsed;
            startAutoSave();
        }
    };

    // Start
    init();
})();

const { escapeHtml } = require('../../markdown');

function renderPage(title, body) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/theme.css">
    <style>
        body { margin: 0; background: var(--color-bg-editor); color: var(--color-text-primary); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        main { max-width: 1100px; margin: 0 auto; padding: 32px 20px; }
        a { color: var(--color-text-link); }
        input, textarea, button { font: inherit; }
        input, textarea { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid var(--color-border-default); background: var(--color-bg-primary); color: var(--color-text-primary); border-radius: 6px; }
        textarea { min-height: 360px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
        button { padding: 8px 12px; border: 1px solid var(--color-border-default); border-radius: 6px; background: var(--color-bg-secondary); color: var(--color-text-primary); cursor: pointer; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border-bottom: 1px solid var(--color-border-default); padding: 8px; text-align: left; vertical-align: top; }
        .bar { display: flex; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 20px; }
        .actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .danger { color: #b42318; }
        .token { word-break: break-all; padding: 12px; border: 1px solid var(--color-border-default); background: var(--color-bg-primary); border-radius: 6px; }
        .muted { color: var(--color-text-secondary); }
    </style>
</head>
<body><main>${body}</main></body>
</html>`;
}

function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '-';
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

function formatBeijingTime(iso) {
    if (!iso) return '-';
    return new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    }).format(new Date(iso));
}

module.exports = { renderPage, formatDuration, formatBeijingTime };

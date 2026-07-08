const { escapeHtml } = require('./markdown');

const FAVICON_SVG = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📝</text></svg>";

function escapeHtmlForAttribute(content) {
    return content
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '&#10;')
        .replace(/\r/g, '&#13;');
}

function buildMarkdownView(id, html) {
    const safeId = escapeHtml(id);
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeId} - Markdown View</title>
    <link rel="icon" href="${FAVICON_SVG}">
    <link rel="stylesheet" href="/theme.css">
    <link rel="stylesheet" href="/markdown.css">
    <link rel="stylesheet" href="/vendor/highlight.js/styles/github.min.css" media="(prefers-color-scheme: light)">
    <link rel="stylesheet" href="/vendor/highlight.js/styles/github-dark.min.css" media="(prefers-color-scheme: dark)">
    <script src="/vendor/mermaid/mermaid.min.js" defer><\/script>
    <script src="/markdown-view.js" defer><\/script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: var(--color-bg-editor); padding: 0; }
        .markdown-body {
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px 56px;
            background: transparent;
            color: var(--color-text-primary);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
        }
        .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6 { color: var(--color-text-primary); border-bottom-color: var(--color-border-default); }
        .markdown-body pre { background: var(--color-bg-code) !important; }
        .markdown-body code { background: var(--color-bg-inline-code) !important; color: var(--color-text-primary); }
        .markdown-body pre code { background: transparent !important; }
        .markdown-body table th, .markdown-body table td { border-color: var(--color-border-default); }
        .markdown-body table th { background: var(--color-bg-secondary); }
        .markdown-body table tr:nth-child(2n) { background: var(--color-bg-secondary) !important; }
        .markdown-body table tr:nth-child(2n+1) { background: transparent !important; }
        .markdown-body blockquote { border-left-color: var(--color-border-default); color: var(--color-text-secondary); }
        .markdown-body hr { background: var(--color-border-default); }
        .markdown-body a { color: var(--color-text-link); }
        @media (max-width: 768px) { .markdown-body { padding: 20px 16px 52px; } }
    </style>
</head>
<body>
    <article class="markdown-body">${html}</article>
</body>
</html>`;
}

function buildHtmlView(id, content) {
    const safeId = escapeHtml(id);
    const escapedContent = escapeHtmlForAttribute(content);
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeId} - HTML View</title>
    <link rel="icon" href="${FAVICON_SVG}">
    <link rel="stylesheet" href="/theme.css">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; }
        body { background: var(--color-bg-editor); }
        iframe { width: 100%; height: 100%; border: none; }
    </style>
</head>
<body>
    <iframe sandbox srcdoc="${escapedContent}"></iframe>
</body>
</html>`;
}

function buildIllegalNoteView(id, content, retentionDays) {
    const safeId = escapeHtml(id);
    const safeContent = escapeHtml(content);
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeId} - Special Notice</title>
    <link rel="icon" href="${FAVICON_SVG}">
    <link rel="stylesheet" href="/theme.css">
    <style>
        body { margin: 0; background: var(--color-bg-editor); color: var(--color-text-primary); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        main { max-width: 860px; margin: 0 auto; padding: 32px 20px; }
        .notice { border: 1px solid #d92d20; background: rgba(217, 45, 32, 0.08); padding: 16px; border-radius: 8px; margin-bottom: 24px; }
        textarea { width: 100%; min-height: 420px; box-sizing: border-box; padding: 16px; background: var(--color-bg-primary); color: var(--color-text-primary); border: 1px solid var(--color-border-default); border-radius: 8px; font: 14px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace; }
    </style>
</head>
<body>
    <main>
        <section class="notice">
            <h1>特殊提示</h1>
            <p>这篇笔记使用了受限制的 ID，且不是由管理员创建。它已被标记为非法文章。</p>
            <p>从首次被标记开始，它最多保留 ${Number(retentionDays)} 天。</p>
        </section>
        <h2>${safeId}</h2>
        <textarea readonly>${safeContent}</textarea>
    </main>
</body>
</html>`;
}

module.exports = { buildMarkdownView, buildHtmlView, buildIllegalNoteView };

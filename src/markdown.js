const { Marked } = require('marked');
const { markedHighlight } = require('marked-highlight');
const hljs = require('highlight.js');
const sanitizeHtml = require('sanitize-html');

const marked = new Marked(
    markedHighlight({
        langPrefix: 'hljs language-',
        highlight(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        }
    })
);

function escapeHtml(content) {
    return content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderMarkdown(content) {
    const rawHtml = marked.parse(content);
    return sanitizeHtml(rawHtml, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat([
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'del'
        ]),
        allowedAttributes: {
            a: ['href', 'name', 'id', 'title', 'target', 'rel'],
            img: ['src', 'alt', 'title', 'width', 'height'],
            code: ['class'],
            pre: ['class'],
            th: ['align'],
            td: ['align'],
            h1: ['id'],
            h2: ['id'],
            h3: ['id'],
            h4: ['id'],
            h5: ['id'],
            h6: ['id']
        },
        allowedClasses: {
            code: [/^language-/, /^hljs$/],
            pre: [/^language-/, /^hljs$/],
            span: [/^hljs-/]
        },
        allowedSchemes: ['http', 'https', 'mailto'],
        allowedSchemesByTag: {
            img: ['http', 'https', 'data']
        },
        transformTags: {
            a(tagName, attribs) {
                if (attribs.target === '_blank') {
                    return {
                        tagName,
                        attribs: { ...attribs, rel: 'noopener noreferrer' }
                    };
                }
                return { tagName, attribs };
            }
        }
    });
}

module.exports = { renderMarkdown, escapeHtml };

function safeDecodeURIComponent(str) {
    try {
        return decodeURIComponent(str);
    } catch {
        return str;
    }
}

function parseCookies(header) {
    return Object.fromEntries(String(header || '').split(';').map((part) => {
        const index = part.indexOf('=');
        if (index === -1) {
            return ['', ''];
        }
        return [part.slice(0, index).trim(), safeDecodeURIComponent(part.slice(index + 1).trim())];
    }).filter(([key]) => key));
}

module.exports = { parseCookies, safeDecodeURIComponent };

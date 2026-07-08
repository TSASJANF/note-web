(function() {
    'use strict';

    function renderMermaid() {
        if (!window.mermaid) {
            return;
        }

        window.mermaid.initialize({
            startOnLoad: false,
            theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default'
        });

        document.querySelectorAll('code.language-mermaid').forEach(function(el) {
            var container = document.createElement('div');
            container.className = 'mermaid';
            container.textContent = el.textContent;
            el.parentNode.replaceWith(container);
        });

        window.mermaid.run();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderMermaid);
    } else {
        renderMermaid();
    }
})();

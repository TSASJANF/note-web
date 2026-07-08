const { createApp } = require('./src/app');
const { loadConfig } = require('./src/config');

async function main() {
    const config = loadConfig();
    const app = await createApp({ config });

    const server = app.listen(config.port, () => {
        console.log(`[SERVER] Note server running at http://localhost:${config.port}`);
    });

    function shutdown(signal) {
        console.log(`[SERVER] Received ${signal}, shutting down gracefully...`);
        server.close(async () => {
            console.log('[SERVER] HTTP server closed');
            if (app.store && typeof app.store.close === 'function') {
                await app.store.close();
            }
            process.exit(0);
        });
        setTimeout(() => {
            console.error('[SERVER] Forced shutdown after timeout');
            process.exit(1);
        }, 10_000);
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
    console.error('[SERVER] Failed to start:', err);
    process.exit(1);
});

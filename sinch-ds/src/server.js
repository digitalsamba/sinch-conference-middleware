// Entry point: load and validate config, then serve. `npm start` loads ./.env if present.
import { ConfigError, loadConfig } from './config.js';
import { createApp } from './app.js';

let config;
try {
    config = loadConfig();
} catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(`Refusing to start, configuration problems:\n- ${err.message.split('\n').join('\n- ')}`);
    process.exit(1);
}
if (config.insecureDev && !config.ds.webhookSecret) {
    console.warn('ALLOW_INSECURE_DEV=true and no DIGITAL_SAMBA_WEBHOOK_SECRET: anyone can call /DigitalSambaListener. Local use only.');
}

const app = createApp(config);
const server = app.listen(config.port, () => {
    console.log(`Listening on :${config.port} with ${config.pins.size} PIN(s), ${config.rooms.size} Digital Samba room(s)`);
});

// Docker stops with SIGTERM; Node as PID 1 would otherwise ignore it until SIGKILL.
const shutdown = (signal) => {
    console.log(`${signal}: shutting down`);
    server.close();
    app.locals.flow.settled().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

import { buildApp, initializeAppData } from './appFactory';

async function main(): Promise<void> {
  if (process.env.TABERNACLE_EMBEDDED === '1') {
    console.error('[Tabernacle] Mode embarqué : utilisez dist/embedded.js');
    process.exit(1);
  }

  const { app, host, port } = await buildApp();
  await initializeAppData(app);
  await app.listen({ port, host });
  console.log(`Tabernacle Finance API: http://${host}:${port}/api/v1`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

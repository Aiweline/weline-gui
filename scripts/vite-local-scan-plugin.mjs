import { scanLocalProjects } from './local-project-scan.mjs';

/**
 * Dev-only: same local project scan as desktop Tauri / weline-agent,
 * exposed at GET /api/v1/projects/scan so browser and desktop share one UI path.
 */
export function viteLocalScanPlugin() {
  return {
    name: 'weline-local-project-scan',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (req.method !== 'GET' || url !== '/api/v1/projects/scan') {
          next();
          return;
        }
        try {
          const projects = scanLocalProjects(server.config.root);
          const body = JSON.stringify(projects);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(body);
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
    },
  };
}

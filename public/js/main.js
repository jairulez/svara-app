import { startRouter } from './core.js';
import { routes as publicRoutes } from './pages-public.js';

async function load(path) {
  try { const m = await import(path); return m.routes || []; }
  catch (e) { console.warn('SVARA: could not load', path, e); return []; }
}

const [appRoutes, proRoutes] = await Promise.all([load('./pages-app.js'), load('./pages-pro.js')]);
// Public routes first so '/', '/learn/:slug' etc. win; app/pro routes follow.
startRouter([...publicRoutes, ...appRoutes, ...proRoutes]);

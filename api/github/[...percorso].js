import { preflight, autorizzata, rispondi, cors } from '../_comune.js';

/**
 * GET /api/github/<percorso> — proxy in sola lettura verso api.github.com.
 * Serve all'ufficio per seguire il lavoro della sessione: rami, commit, pull
 * request e MEMORIA.md. Con GITHUB_TOKEN legge anche i repository privati e
 * non finisce nel limite anonimo. Solo GET, solo percorsi di lettura.
 */
const CONSENTITI = /^repos\/[\w.-]+\/[\w.-]+\/(branches|commits|pulls|contents|compare)(\/|$|\?)/;

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (!autorizzata(req, res)) return;
  if (req.method !== 'GET') { rispondi(res, 405, { errore: 'solo lettura' }); return; }

  const pezzi = [].concat(req.query.percorso || []);
  const url = new URL(req.url, 'http://x');
  url.searchParams.delete('chiave');
  const percorso = `${pezzi.map(encodeURIComponent).join('/')}${url.search}`;
  if (!CONSENTITI.test(percorso)) { rispondi(res, 403, { errore: 'percorso non consentito' }); return; }

  const testate = { accept: 'application/vnd.github+json', 'user-agent': 'agent-office-relay' };
  if (process.env.GITHUB_TOKEN) testate.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  let r;
  try { r = await fetch(`https://api.github.com/${percorso}`, { headers: testate }); } catch (err) {
    rispondi(res, 502, { errore: `GitHub non risponde: ${err.message}` });
    return;
  }
  const testo = await r.text();
  cors(res);
  for (const h of ['x-ratelimit-remaining', 'x-ratelimit-reset', 'content-type']) {
    const v = r.headers.get(h);
    if (v) res.setHeader(h, v);
  }
  res.status(r.status).send(testo);
}

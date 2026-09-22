import { preflight, autorizzata, rispondi, cors } from './_comune.js';

/**
 * GET /api/github/<percorso> — proxy in sola lettura verso api.github.com.
 * Serve all'ufficio per seguire il lavoro della sessione: rami, commit, pull
 * request e MEMORIA.md. Con GITHUB_TOKEN legge anche i repository privati e
 * non finisce nel limite anonimo. Solo GET, solo percorsi di lettura.
 *
 * L'instradamento arriva da vercel.json: /api/github/(.*) → /api/github?percorso=$1
 * (una riscrittura esplicita è più affidabile del nome-file dinamico).
 */
const CONSENTITI = /^repos\/[\w.-]+\/[\w.-]+\/(branches|commits|pulls|contents|compare)(\/|$)/;

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (!autorizzata(req, res)) return;
  if (req.method !== 'GET') { rispondi(res, 405, { errore: 'solo lettura' }); return; }

  const { percorso = '', chiave, ...resto } = req.query || {};
  const pulito = String(Array.isArray(percorso) ? percorso.join('/') : percorso).replace(/^\/+|\/+$/g, '');
  if (!CONSENTITI.test(pulito)) { rispondi(res, 403, { errore: 'percorso non consentito', percorso: pulito }); return; }

  const parametri = new URLSearchParams();
  for (const [k, v] of Object.entries(resto)) parametri.set(k, Array.isArray(v) ? v[0] : String(v));
  const coda = parametri.toString();

  const testate = { accept: 'application/vnd.github+json', 'user-agent': 'agent-office-relay' };
  if (process.env.GITHUB_TOKEN) testate.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  let r;
  try { r = await fetch(`https://api.github.com/${pulito}${coda ? `?${coda}` : ''}`, { headers: testate }); } catch (err) {
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

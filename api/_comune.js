/**
 * api/_comune.js — Pezzi condivisi dalle funzioni serverless (Vercel, Node).
 *
 * Il relè esiste per un motivo solo: l'endpoint /fire delle Routine di Claude
 * Code non espone intestazioni CORS, quindi il browser non può chiamarlo. Qui
 * la chiamata la fa il server, che tiene il token nelle variabili d'ambiente.
 * Sul telefono non arriva mai nessun segreto.
 *
 * Variabili d'ambiente (Vercel → Settings → Environment Variables):
 *   ROUTINE_FIRE_URL    l'URL mostrato dalla Routine quando aggiungi il trigger API
 *   ROUTINE_FIRE_TOKEN  il token generato lì (si vede una volta sola)
 *   GITHUB_REPO         repository su cui lavora la routine, es. bombertronick/agent-office
 *   GITHUB_TOKEN        facoltativo: token GitHub in sola lettura per repository privati
 *                       e per non finire nel limite anonimo di 60 richieste/ora
 *   CHIAVE_APP          facoltativo: parola d'ordine che l'app deve mandare (x-chiave)
 */

export function cors(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type, x-chiave');
  res.setHeader('cache-control', 'no-store');
}

export function rispondi(res, stato, dati) {
  cors(res);
  res.status(stato).json(dati);
}

/** true se la richiesta può passare; altrimenti ha già risposto 401. */
export function autorizzata(req, res) {
  const attesa = process.env.CHIAVE_APP;
  if (!attesa) return true;
  const ricevuta = req.headers['x-chiave'] || new URL(req.url, 'http://x').searchParams.get('chiave');
  if (ricevuta === attesa) return true;
  rispondi(res, 401, { errore: 'chiave mancante o errata' });
  return false;
}

export function preflight(req, res) {
  if (req.method !== 'OPTIONS') return false;
  cors(res);
  res.status(204).end();
  return true;
}

export const configurazione = () => ({
  routine: Boolean(process.env.ROUTINE_FIRE_URL && process.env.ROUTINE_FIRE_TOKEN),
  repo: process.env.GITHUB_REPO || null,
  github: Boolean(process.env.GITHUB_TOKEN),
  chiaveRichiesta: Boolean(process.env.CHIAVE_APP),
});

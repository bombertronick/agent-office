import { preflight, autorizzata, rispondi, configurazione } from './_comune.js';

/** GET /api/salute — stato del relè, usato dal pulsante «Prova connessione». */
export default function handler(req, res) {
  if (preflight(req, res)) return;
  if (!autorizzata(req, res)) return;
  const conf = configurazione();
  rispondi(res, 200, {
    ok: conf.routine,
    ponte: 'agent-office-cloud',
    modo: 'cloud',
    ...conf,
    nota: conf.routine
      ? null
      : 'mancano ROUTINE_FIRE_URL e/o ROUTINE_FIRE_TOKEN nelle variabili d\'ambiente del relè',
  });
}

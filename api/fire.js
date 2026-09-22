import { preflight, autorizzata, rispondi } from './_comune.js';

/**
 * POST /api/fire { text } — avvia una sessione Claude Code nel cloud tramite la
 * Routine configurata. Restituisce id e link della sessione.
 * L'endpoint a valle è sperimentale (beta experimental-cc-routine-2026-04-01).
 */
export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (!autorizzata(req, res)) return;
  if (req.method !== 'POST') { rispondi(res, 405, { errore: 'metodo non consentito' }); return; }

  const url = process.env.ROUTINE_FIRE_URL;
  const token = process.env.ROUTINE_FIRE_TOKEN;
  if (!url || !token) { rispondi(res, 503, { errore: 'relè non configurato: mancano ROUTINE_FIRE_URL / ROUTINE_FIRE_TOKEN' }); return; }

  const corpo = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
  const text = String(corpo.text || '').slice(0, 65000);
  if (!text.trim()) { rispondi(res, 400, { errore: 'testo dell\'incarico mancante' }); return; }

  let risposta;
  try {
    risposta = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'experimental-cc-routine-2026-04-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    rispondi(res, 502, { errore: `la Routine non risponde: ${err.message}` });
    return;
  }

  const dati = await risposta.json().catch(() => ({}));
  if (!risposta.ok) {
    const motivi = {
      400: 'richiesta rifiutata: la Routine è in pausa o il testo è troppo lungo',
      401: 'token della Routine non valido: rigeneralo su claude.ai/code/routines',
      403: 'l\'account non ha accesso alle Routine via API',
      404: 'Routine non trovata: controlla ROUTINE_FIRE_URL',
      429: 'limite giornaliero di esecuzioni raggiunto',
      503: 'servizio momentaneamente sovraccarico: riprova fra poco',
    };
    rispondi(res, risposta.status, {
      errore: motivi[risposta.status] || dati?.error?.message || `HTTP ${risposta.status}`,
      riprovaDopo: risposta.headers.get('retry-after'),
    });
    return;
  }

  rispondi(res, 200, {
    sessionId: dati.claude_code_session_id,
    sessionUrl: dati.claude_code_session_url,
  });
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }

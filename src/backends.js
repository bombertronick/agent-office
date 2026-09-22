/**
 * backends.js — Da dove arriva il "lavoro" degli agenti.
 *
 * Due implementazioni con la stessa interfaccia:
 *   • SimulatedBackend — tutto locale, deterministico quanto basta, sempre disponibile.
 *   • EndpointBackend  — inoltra l'incarico a un tuo servizio (es. un proxy che parla
 *     con l'API di Claude o con il Claude Agent SDK) e ne mostra i progressi reali.
 *
 * Interfaccia:
 *   start(task, agent)          -> Promise<void>       apre la lavorazione
 *   progress(task, agent, dt)   -> Promise<{ delta, line?, done?, blocked? }>
 *   finish(task, agent)         -> Promise<void>
 */

import { SIM, TASK_TYPES } from './config.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (a, b) => a + Math.random() * (b - a);

/* ------------------------------------------------------------------ *
 * Righe di log verosimili, per dare "consistenza tecnica" alla scena
 * ------------------------------------------------------------------ */

const FILES = {
  feature: ['src/app/router.ts', 'src/ui/Form.tsx', 'src/api/client.ts', 'src/store/session.ts'],
  bug: ['src/db/quota.ts', 'src/ui/SaveButton.tsx', 'src/lib/storage.ts'],
  refactor: ['src/core/engine.ts', 'src/lib/utils.ts', 'src/ui/panels/'],
  test: ['tests/cart.spec.ts', 'tests/auth.spec.ts', 'tests/e2e/checkout.ts'],
  design: ['design/tokens.json', 'src/styles/theme.css', 'design/flow.fig'],
  infra: ['.github/workflows/ci.yml', 'infra/deploy.tf', 'Dockerfile'],
  ricerca: ['docs/ricerca/opzioni.md', 'docs/adr/0007.md'],
  docs: ['README.md', 'docs/guida-utente.md', 'docs/api.md'],
};

const ACTIONS = {
  feature: ['implemento', 'collego', 'estraggo il componente in', 'aggiungo lo stato a'],
  bug: ['riproduco il caso in', 'correggo il ramo di errore in', 'aggiungo la guardia in'],
  refactor: ['semplifico', 'rimuovo la duplicazione in', 'rinomino i simboli in'],
  test: ['scrivo i casi in', 'copro i limiti in', 'stabilizzo'],
  design: ['definisco spaziature in', 'aggiorno i token in', 'rifinisco gli stati di'],
  infra: ['aggiorno la pipeline in', 'metto in cache le dipendenze in', 'riduco l\'immagine di'],
  ricerca: ['confronto le opzioni in', 'annoto i vincoli in', 'verifico le fonti di'],
  docs: ['documento', 'aggiungo esempi a', 'riscrivo la sezione di'],
};

const CHECKS = [
  () => `test: ${Math.floor(rand(8, 64))} passati, 0 falliti`,
  () => `build ✓ in ${rand(0.8, 4.2).toFixed(1)}s`,
  () => `lint pulito su ${Math.floor(rand(3, 22))} file`,
  () => `diff +${Math.floor(rand(12, 140))} −${Math.floor(rand(2, 60))}`,
  () => `copertura ${Math.floor(rand(71, 97))}%`,
];

export function techLine(task) {
  const type = TASK_TYPES[task.type] ? task.type : 'feature';
  if (Math.random() < 0.35) return pick(CHECKS)();
  return `${pick(ACTIONS[type])} ${pick(FILES[type])}`;
}

/* ------------------------------------------------------------------ *
 * Backend simulato
 * ------------------------------------------------------------------ */

export class SimulatedBackend {
  constructor() { this.id = 'simulazione'; this.label = 'Simulazione locale'; }

  async start() { /* niente da preparare */ }

  /**
   * @param {object} task
   * @param {object} agent
   * @param {number} dt secondi simulati trascorsi
   * @param {number} rate punti di lavoro al secondo già pesati per affinità/energia
   */
  async progress(task, agent, dt, rate) {
    const delta = rate * dt;
    const out = { delta };
    // Una riga di log ogni ~2.5 secondi di lavoro effettivo.
    if (Math.random() < dt / 2.5) out.line = techLine(task);
    if (Math.random() < SIM.blockChancePerSecond * dt) out.blocked = true;
    return out;
  }

  async finish() { /* nulla */ }
}

/* ------------------------------------------------------------------ *
 * Backend su endpoint HTTP (agenti veri)
 * ------------------------------------------------------------------ */

/**
 * Contratto atteso dal servizio (lo implementa già `ponte/server.mjs`):
 *   GET  {endpoint}/salute                     -> { ok, cli, cartellaLavoro, modello, … }
 *   POST {endpoint}/start     { task, agent }  -> { runId }
 *   POST {endpoint}/progress  { runId }        -> { progress: 0..1, lines: string[], done: bool, blocked?: string }
 *   POST {endpoint}/finish    { runId }        -> {}
 *
 * Nota di sicurezza: l'endpoint deve stare su un tuo server. Non inserire mai
 * chiavi API nel browser: è il tuo servizio a custodirle.
 */
export class EndpointBackend {
  constructor(baseUrl) {
    this.id = 'endpoint';
    this.label = 'Endpoint remoto';
    this.base = new URL(baseUrl);                      // può contenere ?chiave=…
    this.base.pathname = this.base.pathname.replace(/\/+$/, '');
    this.runs = new Map();
  }

  /** Indirizzo completo di una rotta, conservando gli eventuali parametri. */
  #rotta(coda) {
    const url = new URL(this.base.toString());
    url.pathname = `${url.pathname}${coda}`;
    return url.toString();
  }

  #intestazioni() {
    const testate = { 'content-type': 'application/json' };
    const chiave = this.base.searchParams.get('chiave');
    if (chiave) testate['x-chiave'] = chiave;
    return testate;
  }

  async #chiama(coda, corpo, metodo = 'POST') {
    const res = await fetch(this.#rotta(coda), {
      method: metodo,
      headers: this.#intestazioni(),
      body: metodo === 'GET' ? undefined : JSON.stringify(corpo || {}),
    });
    const testo = await res.text();
    let dati = {};
    try { dati = testo ? JSON.parse(testo) : {}; } catch { /* risposta non JSON */ }
    if (!res.ok) throw new Error(dati.errore || `HTTP ${res.status}`);
    return dati;
  }

  /** Usata dal pulsante «Prova connessione» nelle impostazioni. */
  salute() { return this.#chiama('/salute', null, 'GET'); }

  /** MEMORIA.md del progetto su cui lavorano gli agenti. */
  memoria() { return this.#chiama('/memoria', null, 'GET'); }

  async start(task, agent) {
    const dati = await this.#chiama('/start', { task, agent });
    this.runs.set(task.id, { runId: dati.runId || task.id, last: 0, cooldown: 0 });
  }

  async progress(task, agent, dt) {
    const run = this.runs.get(task.id);
    if (!run) return { delta: 0 };
    run.cooldown -= dt;
    if (run.cooldown > 0) return { delta: 0 };
    run.cooldown = 1.2;                                // ~una richiesta al secondo
    try {
      const dati = await this.#chiama('/progress', { runId: run.runId });
      const pct = Math.max(0, Math.min(1, Number(dati.progress) || 0));
      const delta = Math.max(0, pct - run.last) * task.workTotal;
      run.last = pct;
      return {
        delta,
        lines: Array.isArray(dati.lines) ? dati.lines : undefined,
        done: Boolean(dati.done),
        blocked: dati.blocked ? String(dati.blocked) : false,
      };
    } catch (err) {
      return { delta: 0, blocked: `ponte non raggiungibile (${err.message})` };
    }
  }

  async finish(task) {
    const run = this.runs.get(task.id);
    if (!run) return;
    this.runs.delete(task.id);
    try { await this.#chiama('/finish', { runId: run.runId }); } catch { /* best effort */ }
  }
}

/* ------------------------------------------------------------------ *
 * Backend cloud: Routine di Claude Code + relè Vercel
 * ------------------------------------------------------------------ */

const slug = (testo) => String(testo).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'incarico';

/** Il testo che la Routine riceve nel blocco routine-fire-payload. */
function testoIncarico(task, agent, ramo, repo, ruoloLabel, tratti) {
  return [
    'INCARICO DA AGENT OFFICE',
    `Titolo: ${task.title}`,
    `Tipo: ${task.type} · Priorità: ${task.priority} · Dimensione: ${task.size}`,
    `Ruolo assegnato: ${ruoloLabel}${agent?.name ? ` (${agent.name})` : ''}${tratti ? ` — ${tratti}` : ''}`,
    repo ? `Repository: ${repo}` : '',
    `Ramo da creare e usare, esattamente: ${ramo}`,
    '',
    'Descrizione:',
    task.brief || '(nessuna descrizione aggiuntiva: agisci sul titolo)',
    '',
    'Regole: usa esattamente il ramo indicato; commit piccoli e frequenti con messaggi in',
    'italiano (sono il registro che l\'ufficio mostra in tempo reale); esegui test e linter se',
    'esistono; se c\'è MEMORIA.md aggiorna «Stato adesso» e il «Diario» prima di chiudere; alla',
    'fine apri una pull request verso il ramo principale con il riepilogo; se non puoi procedere',
    'apri la pull request in bozza spiegando in una riga cosa ti serve, e fermati.',
  ].filter((r) => r !== '').join('\n');
}

/**
 * Ogni incarico diventa una sessione Claude Code nel cloud, avviata tramite la
 * Routine collegata. Il relè (api/fire.js) fa la chiamata al posto del browser,
 * che non potrebbe farla (niente CORS) e non deve tenere il token.
 * L'avanzamento si legge da GitHub: i commit sul ramo sono il registro, la pull
 * request è la consegna. Nessun PC acceso, niente chiavi sul telefono.
 */
export class CloudBackend {
  constructor({ relay, repo, chiave = '' } = {}) {
    this.id = 'cloud';
    this.label = 'Cloud (Routine)';
    this.relay = String(relay || '').replace(/\/+$/, '');
    this.repo = String(repo || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/+$/, '');
    this.chiave = chiave;
    this.runs = new Map();
  }

  #testate(json = true) {
    const t = {};
    if (json) t['content-type'] = 'application/json';
    if (this.chiave) t['x-chiave'] = this.chiave;
    return t;
  }

  async #chiama(percorso, { method = 'GET', body } = {}) {
    if (!this.relay) throw new Error('indirizzo del relè mancante');
    const res = await fetch(`${this.relay}${percorso}`, {
      method, headers: this.#testate(method !== 'GET'), body: body ? JSON.stringify(body) : undefined,
    });
    const testo = await res.text();
    let dati = {};
    try { dati = testo ? JSON.parse(testo) : {}; } catch { /* non JSON */ }
    if (!res.ok) {
      const err = new Error(dati.errore || dati.message || `HTTP ${res.status}`);
      err.stato = res.status;
      err.resetLimite = Number(res.headers.get('x-ratelimit-reset')) || 0;
      throw err;
    }
    return dati;
  }

  salute() { return this.#chiama('/salute'); }

  /** MEMORIA.md letta dal ramo principale del repository, tramite il relè. */
  async memoria() {
    if (!this.repo) return { esiste: false, testo: '', aggiornato: null, caratteri: 0 };
    try {
      const dati = await this.#chiama(`/github/repos/${this.repo}/contents/MEMORIA.md`);
      const testo = decodeURIComponent(escape(atob((dati.content || '').replace(/\n/g, ''))));
      const data = /\(aggiornato:\s*(\d{4}-\d{2}-\d{2})\)/.exec(testo);
      return { esiste: true, testo, aggiornato: data?.[1] || null, caratteri: testo.length };
    } catch (err) {
      if (err.stato === 404) return { esiste: false, testo: '', aggiornato: null, caratteri: 0 };
      throw err;
    }
  }

  async start(task, agent, extra = {}) {
    if (!this.repo) throw new Error('repository non impostato nelle impostazioni');
    const ramo = `claude/ufficio-${slug(task.title)}-${String(task.id).slice(-4)}`;
    const text = testoIncarico(task, agent, ramo, this.repo, extra.ruoloLabel || agent?.roleLabel || 'sviluppatore', extra.tratti);
    const dati = await this.#chiama('/fire', { method: 'POST', body: { text } });
    this.runs.set(task.id, {
      ramo, sessionUrl: dati.sessionUrl, avvio: Date.now(), prossimo: Date.now() + 40000,
      sha: new Set(), commit: 0, last: 0, avvisato: false, giro: 0, pr: null,
    });
    task.sessionUrl = dati.sessionUrl;
    task.ramo = ramo;
    return { lines: [`sessione cloud avviata → ${dati.sessionUrl}`, `lavorerà sul ramo ${ramo}`] };
  }

  async progress(task) {
    const run = this.runs.get(task.id);
    if (!run) return { delta: 0 };
    const ora = Date.now();
    if (ora < run.prossimo) return { delta: 0 };
    run.prossimo = ora + 45000;                       // GitHub: un giro ogni 45 s, tempo reale
    run.giro += 1;
    const lines = [];
    let done = false;
    let blocked = false;

    // 1) commit sul ramo: sono il registro
    try {
      const since = new Date(run.avvio - 120000).toISOString();
      const commits = await this.#chiama(`/github/repos/${this.repo}/commits?sha=${encodeURIComponent(run.ramo)}&since=${since}&per_page=30`);
      if (Array.isArray(commits)) {
        commits.slice().reverse().forEach((c) => {
          if (run.sha.has(c.sha)) return;
          run.sha.add(c.sha);
          run.commit += 1;
          lines.push(`commit: ${String(c.commit?.message || '').split('\n')[0].slice(0, 140)}`);
        });
      }
    } catch (err) {
      if (err.stato === 404 || err.stato === 422) {
        // il ramo non c'è ancora: la sessione sta leggendo o è ferma
        if (ora - run.avvio > 20 * 60000 && !run.avvisato) {
          run.avvisato = true;
          lines.push('dopo 20 minuti il ramo non esiste ancora: apri la sessione per vedere cosa succede');
        }
      } else if (err.stato === 403 || err.stato === 429) {
        const attesa = run.resetLimite ? Math.max(60000, err.resetLimite * 1000 - ora) : 5 * 60000;
        run.prossimo = ora + attesa;
        if (run.giro % 5 === 1) lines.push('GitHub limita le letture anonime: aggiungi GITHUB_TOKEN al relè per seguire il lavoro in tempo reale');
      } else {
        lines.push(`lettura di GitHub fallita: ${err.message}`);
      }
    }

    // 2) pull request: è la consegna (ogni due giri, per non sprecare richieste)
    if (run.giro % 2 === 1 && run.commit > 0) {
      try {
        const owner = this.repo.split('/')[0];
        const pulls = await this.#chiama(`/github/repos/${this.repo}/pulls?head=${encodeURIComponent(`${owner}:${run.ramo}`)}&state=all&per_page=5`);
        const pr = Array.isArray(pulls) ? pulls[0] : null;
        if (pr && !run.pr) {
          run.pr = pr.html_url;
          task.prUrl = pr.html_url;
          lines.push(`${pr.draft ? 'pull request in bozza' : 'pull request aperta'} → ${pr.html_url}`);
          if (pr.draft) blocked = `la sessione si è fermata: leggi la pull request in bozza (${pr.html_url})`;
          else done = true;
        }
      } catch { /* la prossima volta */ }
    }

    const obiettivo = done ? 1 : Math.min(0.85, 0.12 + run.commit * 0.09);
    const delta = Math.max(0, obiettivo - run.last) * task.workTotal;
    run.last = Math.max(run.last, obiettivo);
    return { delta, lines: lines.length ? lines : undefined, done, blocked };
  }

  async finish(task) { this.runs.delete(task.id); }
}

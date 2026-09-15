#!/usr/bin/env node
/**
 * ponte/server.mjs — Il ponte fra l'ufficio 3D e gli agenti veri.
 *
 * Fa due cose:
 *   1. serve l'app (così ufficio e API stanno sulla stessa origine: niente CORS,
 *      niente contenuti misti);
 *   2. espone /api/start, /api/progress, /api/finish — il contratto che
 *      l'ufficio già parla — eseguendo per ogni incarico un vero agente
 *      Claude Code in modalità headless dentro la cartella di lavoro.
 *
 * Zero dipendenze: solo Node (>= 18) e la CLI `claude` già installata e
 * autenticata (`claude auth login`). Nessuna chiave API nel browser.
 *
 *   node ponte/server.mjs --cartella ~/progetti/mia-app
 *
 * Opzioni: --porta 4444 · --host 127.0.0.1 · --modello opus · --chiave <token>
 *          --permessi acceptEdits · --max-turni 40 · --budget 1.50
 *          --strumenti "Bash(npm test),Bash(npm run *)"   (comandi senza approvazione)
 */

import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const RADICE = path.resolve(QUI, '..');           // la cartella dell'app
const FILE_CONFIG = path.join(QUI, 'config.json');

/* ------------------------------------------------------------------ *
 * Configurazione
 * ------------------------------------------------------------------ */

const PREDEFINITA = {
  porta: 4444,
  host: '127.0.0.1',
  cartellaLavoro: process.cwd(),
  modello: 'opus',
  permessi: 'acceptEdits',   // acceptEdits | default | plan | bypassPermissions
  maxTurni: 40,
  budgetUsd: 1.5,
  chiave: '',                // se valorizzata, va passata come ?chiave=… dall'app
  strumentiConsentiti: [],   // es. ["Bash(npm test)", "Bash(npm run *)"] — eseguiti senza chiedere
  memoria: true,             // a fine incarico committa e spinge MEMORIA.md se è cambiata
  sessioniCloud: {},         // { "nome-corto": "session_0123…" }
};

function leggiArgomenti(argv) {
  const out = {};
  const mappa = {
    '--porta': 'porta', '--host': 'host', '--cartella': 'cartellaLavoro',
    '--modello': 'modello', '--permessi': 'permessi', '--max-turni': 'maxTurni',
    '--budget': 'budgetUsd', '--chiave': 'chiave', '--strumenti': 'strumentiConsentiti',
    '--memoria': 'memoria',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const chiave = mappa[argv[i]];
    if (!chiave) continue;
    const valore = argv[i + 1];
    if (valore === undefined || valore.startsWith('--')) continue;
    if (['porta', 'maxTurni'].includes(chiave)) out[chiave] = Number(valore);
    else if (chiave === 'budgetUsd') out[chiave] = Number(valore);
    else if (chiave === 'strumentiConsentiti') out[chiave] = valore.split(',').map((v) => v.trim()).filter(Boolean);
    else if (chiave === 'memoria') out[chiave] = !['no', 'off', 'false', '0'].includes(valore.toLowerCase());
    else out[chiave] = valore;
    i += 1;
  }
  return out;
}

async function caricaConfig() {
  let salvata = {};
  try { salvata = JSON.parse(await readFile(FILE_CONFIG, 'utf8')); } catch { /* prima esecuzione */ }
  const config = { ...PREDEFINITA, ...salvata, ...leggiArgomenti(process.argv) };
  config.cartellaLavoro = path.resolve(config.cartellaLavoro.replace(/^~(?=$|\/)/, os.homedir()));
  try { await writeFile(FILE_CONFIG, `${JSON.stringify(config, null, 2)}\n`); } catch { /* sola lettura: pazienza */ }
  return config;
}

const config = await caricaConfig();

/* ------------------------------------------------------------------ *
 * Controlli d'avvio
 * ------------------------------------------------------------------ */

function trovaCli() {
  const prova = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  if (prova.error || prova.status !== 0) return null;
  return prova.stdout.trim();
}

const versioneCli = trovaCli();

if (!existsSync(config.cartellaLavoro) || !statSync(config.cartellaLavoro).isDirectory()) {
  console.error(`\n✖ La cartella di lavoro non esiste: ${config.cartellaLavoro}`);
  console.error('  Indicane una con --cartella /percorso/del/progetto\n');
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * Registro delle lavorazioni in corso
 * ------------------------------------------------------------------ */

/** runId -> { proc, righe[], eventi, avanzamento, finito, bloccato, costo, … } */
const lavori = new Map();

const RUOLI = {
  architetto: 'architetta di sistema: privilegia struttura chiara, confini netti fra moduli e scelte documentate',
  frontend: 'sviluppatrice frontend: cura interfaccia, accessibilità e stati di caricamento/errore',
  backend: 'sviluppatore backend: cura dati, validazione, casi limite e prestazioni',
  qa: 'tester QA: scrivi test che coprono davvero i casi limite e verifica che passino',
  reviewer: 'revisore del codice: privilegia leggibilità, nomi chiari e rimozione di duplicazioni',
  devops: 'ingegnere DevOps: cura build, script, configurazione e riproducibilità',
  designer: 'designer di prodotto: cura gerarchia visiva, spaziature e coerenza dei componenti',
  ricercatore: 'ricercatore: verifica le fonti nel codice prima di concludere e annota quello che trovi',
};

const TIPI = {
  feature: 'implementa la funzionalità',
  bug: 'trova la causa e correggi il difetto',
  refactor: 'riordina il codice senza cambiarne il comportamento',
  test: 'scrivi ed esegui i test',
  design: 'migliora l\'interfaccia',
  infra: 'sistema build, script o configurazione',
  ricerca: 'studia il codice e riporta le conclusioni',
  docs: 'aggiorna la documentazione',
};

function costruisciPrompt(task, agent) {
  const ruolo = RUOLI[agent?.role] || 'sviluppatore';
  const tipo = TIPI[task.type] || 'porta a termine il lavoro';
  return [
    `Sei ${agent?.name || 'un agente'}, ${ruolo}.`,
    '',
    `INCARICO (${task.type}, priorità ${task.priority}): ${task.title}`,
    task.brief ? `\nDettagli forniti dalla direzione:\n${task.brief}` : '',
    '',
    `Nella cartella corrente, ${tipo}.`,
    '',
    'Regole di lavoro:',
    '- lavora in autonomia fino a consegnare: non chiedere conferme per ogni passo;',
    '- se il progetto ha test o linter, eseguili prima di considerare finito il lavoro;',
    '- non fare commit e non spingere niente: lascia le modifiche nella cartella di lavoro;',
    '- se nella cartella esiste MEMORIA.md, prima di chiudere aggiorna «Stato adesso» e',
    '  aggiungi una riga in cima al «Diario» (data · cosa hai fatto): è l\'unica memoria',
    '  che sopravvive a questa sessione; non toccare le altre sezioni se non serve;',
    '- quando hai finito, chiudi con una riga che riassume cosa hai cambiato;',
    '- se davvero non puoi procedere (informazione mancante, decisione di prodotto,',
    '  credenziali assenti), fermati e spiega in una riga cosa ti serve.',
  ].filter(Boolean).join('\n');
}

/** Sintetizza una riga di registro leggibile da un evento dello stream. */
function rigaDaEvento(evento) {
  if (!evento || typeof evento !== 'object') return null;

  if (evento.type === 'system' && evento.subtype === 'task_summary' && evento.detail) {
    return String(evento.detail).slice(0, 160);
  }

  if (evento.type === 'assistant') {
    const blocchi = evento.message?.content || [];
    for (const blocco of blocchi) {
      if (blocco.type === 'tool_use') {
        const nome = blocco.name || 'strumento';
        const input = blocco.input || {};
        const file = input.file_path || input.path || input.notebook_path;
        if (file) return `${nome} ${path.relative(config.cartellaLavoro, file) || path.basename(file)}`;
        if (input.command) return `$ ${String(input.command).slice(0, 120)}`;
        if (input.pattern) return `${nome} «${String(input.pattern).slice(0, 60)}»`;
        if (input.description) return `${nome}: ${String(input.description).slice(0, 120)}`;
        return nome;
      }
      if (blocco.type === 'text' && blocco.text?.trim()) {
        return blocco.text.trim().replace(/\s+/g, ' ').slice(0, 160);
      }
    }
  }
  return null;
}

/** L'agente si è fermato per chiedere qualcosa? Diventa un blocco nell'ufficio. */
function bloccoDaEvento(evento) {
  if (evento?.type === 'system' && evento.subtype === 'post_turn_summary') {
    if (evento.status_category === 'need_input' && evento.needs_action) {
      return String(evento.needs_action).slice(0, 200);
    }
  }
  return null;
}

function avvia(task, agent) {
  const runId = randomUUID();
  const argomenti = [
    '-p', costruisciPrompt(task, agent),
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', config.permessi,
    '--max-turns', String(config.maxTurni),
    '--model', config.modello,
  ];
  if (Number.isFinite(config.budgetUsd) && config.budgetUsd > 0) {
    argomenti.push('--max-budget-usd', String(config.budgetUsd));
  }
  // Comandi che l'agente può eseguire senza che nessuno approvi: in headless
  // non c'è nessuno a rispondere, quindi senza questi i test non partono.
  if (Array.isArray(config.strumentiConsentiti) && config.strumentiConsentiti.length) {
    argomenti.push('--allowedTools', ...config.strumentiConsentiti);
  }

  const proc = spawn('claude', argomenti, {
    cwd: config.cartellaLavoro,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const lavoro = {
    runId,
    proc,
    titolo: task.title,
    agente: agent?.name || '—',
    righe: [`avvio agente su ${path.basename(config.cartellaLavoro)}`],
    consegnate: 0,
    eventi: 0,
    finito: false,
    bloccato: null,
    esito: null,
    costo: 0,
    sessione: null,
    iniziato: Date.now(),
  };
  lavori.set(runId, lavoro);

  let resto = '';
  proc.stdout.on('data', (pezzo) => {
    resto += pezzo.toString();
    const linee = resto.split('\n');
    resto = linee.pop() || '';
    for (const linea of linee) {
      if (!linea.trim()) continue;
      let evento;
      try { evento = JSON.parse(linea); } catch { continue; }

      lavoro.eventi += 1;
      if (evento.session_id && !lavoro.sessione) lavoro.sessione = evento.session_id;
      if (typeof evento.total_cost_usd === 'number') lavoro.costo = evento.total_cost_usd;

      const riga = rigaDaEvento(evento);
      if (riga) lavoro.righe.push(riga);

      const blocco = bloccoDaEvento(evento);
      if (blocco) lavoro.bloccato = blocco;
    }
  });

  const errori = [];
  proc.stderr.on('data', (pezzo) => errori.push(pezzo.toString()));

  proc.on('close', (codice) => {
    lavoro.finito = true;
    lavoro.esito = codice;
    if (codice !== 0 && !lavoro.bloccato) {
      const dettaglio = errori.join('').trim().split('\n').slice(-2).join(' ').slice(0, 200);
      lavoro.bloccato = dettaglio || `l'agente è uscito con codice ${codice}`;
    }
    const durata = Math.round((Date.now() - lavoro.iniziato) / 1000);
    lavoro.righe.push(`agente concluso in ${durata}s · costo $${lavoro.costo.toFixed(3)}`);
    if (config.memoria) lavoro.righe.push(...salvaMemoria(task.title));
    console.log(`  ↳ [${lavoro.agente}] «${lavoro.titolo}» ${lavoro.bloccato ? 'FERMO' : 'fatto'} (${durata}s, $${lavoro.costo.toFixed(3)})`);
  });

  console.log(`▶ [${lavoro.agente}] «${task.title}» → ${config.cartellaLavoro}`);
  return lavoro;
}

/**
 * Memoria fra sessioni: se l'agente ha toccato MEMORIA.md, il ponte la committa e
 * la spinge da solo. È l'unica eccezione alla regola «gli agenti non committano»:
 * una memoria che resta solo nella cartella è una memoria persa.
 */
function salvaMemoria(titolo) {
  const git = (...args) => spawnSync('git', args, { cwd: config.cartellaLavoro, encoding: 'utf8' });
  if (!existsSync(path.join(config.cartellaLavoro, 'MEMORIA.md'))) return [];
  if (git('rev-parse', '--is-inside-work-tree').status !== 0) return ['MEMORIA.md aggiornata (cartella senza git: non spinta)'];
  const diff = git('status', '--porcelain', '--', 'MEMORIA.md');
  if (!diff.stdout.trim()) return ['MEMORIA.md non toccata dall\'agente'];
  git('add', 'MEMORIA.md');
  const commit = git('commit', '-m', `memoria: ${titolo.slice(0, 60)}`, '--', 'MEMORIA.md');
  if (commit.status !== 0) return [`memoria: commit fallito (${(commit.stderr || '').trim().split('\n')[0]})`];
  if (!git('remote').stdout.trim()) return ['memoria: commit locale (nessun remoto)'];
  const ramo = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim();
  const push = git('push', '-u', 'origin', ramo);
  return [push.status === 0
    ? `memoria: commit e push su ${ramo} ✓`
    : `memoria: commit fatto, push fallito (${(push.stderr || '').trim().split('\n').slice(-1)[0]})`];
}

/**
 * Avanzamento: l'agente non sa quanto manca, quindi lo stimiamo dagli eventi
 * con una curva che si avvicina al 92% e si chiude solo alla fine davvero.
 */
function avanzamento(lavoro) {
  if (lavoro.finito) return 1;
  return Math.min(0.92, 1 - Math.exp(-lavoro.eventi / 22));
}

/* ------------------------------------------------------------------ *
 * Inoltro a una sessione Claude Code già esistente (cloud)
 * ------------------------------------------------------------------ */

function inoltraASessione(idSessione, testo) {
  return new Promise((risolvi) => {
    const proc = spawn('claude', ['-p', testo, '--cloud', idSessione, '--output-format', 'json'], {
      env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    proc.stdout.on('data', (p) => { out += p.toString(); });
    proc.on('close', () => {
      try { risolvi(JSON.parse(out)); } catch { risolvi({ ok: false, error: out.trim().slice(0, 200) }); }
    });
  });
}

/* ------------------------------------------------------------------ *
 * Server HTTP: file statici + API
 * ------------------------------------------------------------------ */

const TIPI_MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
};

function corpo(req) {
  return new Promise((risolvi) => {
    let dati = '';
    req.on('data', (pezzo) => { dati += pezzo; if (dati.length > 1e6) req.destroy(); });
    req.on('end', () => { try { risolvi(JSON.parse(dati || '{}')); } catch { risolvi({}); } });
  });
}

const rispondi = (res, stato, dati) => {
  res.writeHead(stato, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, x-chiave',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(dati));
};

function chiaveValida(req, url) {
  if (!config.chiave) return true;
  return url.searchParams.get('chiave') === config.chiave || req.headers['x-chiave'] === config.chiave;
}

async function serviStatico(res, percorso) {
  const relativo = percorso === '/' ? '/index.html' : percorso;
  const file = path.resolve(RADICE, `.${relativo}`);
  if (!file.startsWith(RADICE)) { res.writeHead(403).end('vietato'); return; }
  try {
    const dati = await readFile(file);
    res.writeHead(200, {
      'content-type': TIPI_MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(dati);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('non trovato');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-chiave',
    });
    res.end();
    return;
  }

  if (!url.pathname.startsWith('/api/')) { await serviStatico(res, url.pathname); return; }

  if (!chiaveValida(req, url)) { rispondi(res, 401, { errore: 'chiave mancante o errata' }); return; }

  // stato del ponte — usato dal pulsante «Prova connessione»
  if (url.pathname === '/api/salute') {
    rispondi(res, 200, {
      ok: Boolean(versioneCli),
      ponte: 'agent-office',
      cli: versioneCli || null,
      cartellaLavoro: config.cartellaLavoro,
      modello: config.modello,
      permessi: config.permessi,
      strumentiConsentiti: config.strumentiConsentiti || [],
      memoria: Boolean(config.memoria) && existsSync(path.join(config.cartellaLavoro, 'MEMORIA.md')),
      budgetUsd: config.budgetUsd,
      inCorso: [...lavori.values()].filter((l) => !l.finito).length,
      sessioniCloud: Object.keys(config.sessioniCloud || {}),
    });
    return;
  }

  // la memoria del progetto, così l'ufficio la mostra senza passare da git
  if (url.pathname === '/api/memoria') {
    const percorso = path.join(config.cartellaLavoro, 'MEMORIA.md');
    try {
      const testo = await readFile(percorso, 'utf8');
      const data = /\(aggiornato:\s*(\d{4}-\d{2}-\d{2})\)/.exec(testo);
      rispondi(res, 200, { esiste: true, testo, aggiornato: data?.[1] || null, caratteri: testo.length });
    } catch {
      rispondi(res, 200, { esiste: false, testo: '', aggiornato: null, caratteri: 0 });
    }
    return;
  }

  if (req.method !== 'POST') { rispondi(res, 405, { errore: 'metodo non consentito' }); return; }
  const dati = await corpo(req);

  if (url.pathname === '/api/start') {
    if (!versioneCli) {
      rispondi(res, 503, { errore: 'la CLI `claude` non è installata o non è nel PATH' });
      return;
    }
    const { task, agent } = dati;
    if (!task?.title) { rispondi(res, 400, { errore: 'incarico mancante' }); return; }

    // «@sessione <nome|id>» nella descrizione inoltra il lavoro a una sessione già aperta
    const inoltro = /@sessione\s+(\S+)/.exec(task.brief || '');
    if (inoltro) {
      const riferimento = inoltro[1];
      const idSessione = config.sessioniCloud?.[riferimento] || riferimento;
      const esito = await inoltraASessione(idSessione, `${task.title}\n\n${(task.brief || '').replace(/@sessione\s+\S+/, '').trim()}`);
      const runId = randomUUID();
      lavori.set(runId, {
        runId, titolo: task.title, agente: agent?.name || '—',
        righe: esito?.ok === false
          ? [`invio alla sessione fallito: ${esito.error || 'motivo sconosciuto'}`]
          : [`inoltrato alla sessione ${idSessione}`, esito?.url ? `apri: ${esito.url}` : 'segui la risposta su claude.ai/code'],
        consegnate: 0, eventi: 6, finito: true, esito: 0, costo: 0,
        bloccato: esito?.ok === false ? (esito.error || 'invio non riuscito') : null,
        iniziato: Date.now(),
      });
      rispondi(res, 200, { runId });
      return;
    }

    const lavoro = avvia(task, agent);
    rispondi(res, 200, { runId: lavoro.runId });
    return;
  }

  if (url.pathname === '/api/progress') {
    const lavoro = lavori.get(dati.runId);
    if (!lavoro) { rispondi(res, 404, { errore: 'lavorazione sconosciuta' }); return; }
    const nuove = lavoro.righe.slice(lavoro.consegnate);
    lavoro.consegnate = lavoro.righe.length;
    rispondi(res, 200, {
      progress: avanzamento(lavoro),
      lines: nuove,
      done: lavoro.finito && !lavoro.bloccato,
      blocked: lavoro.bloccato || false,
      costo: lavoro.costo,
    });
    return;
  }

  if (url.pathname === '/api/finish') {
    const lavoro = lavori.get(dati.runId);
    if (lavoro && !lavoro.finito) { try { lavoro.proc?.kill('SIGTERM'); } catch { /* già uscito */ } }
    lavori.delete(dati.runId);
    rispondi(res, 200, { ok: true });
    return;
  }

  rispondi(res, 404, { errore: 'rotta sconosciuta' });
});

server.listen(config.porta, config.host, () => {
  const indirizzo = `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.porta}`;
  const chiave = config.chiave ? `?chiave=${config.chiave}` : '';
  console.log('\n🏢  Agent Office — ponte agenti veri');
  console.log('────────────────────────────────────────────');
  console.log(`  ufficio           ${indirizzo}/`);
  console.log(`  endpoint          ${indirizzo}/api${chiave}`);
  console.log(`  cartella lavoro   ${config.cartellaLavoro}`);
  console.log(`  modello           ${config.modello}   permessi: ${config.permessi}`);
  if (config.strumentiConsentiti?.length) {
    console.log(`  senza chiedere    ${config.strumentiConsentiti.join(' · ')}`);
  } else if (config.permessi === 'acceptEdits') {
    console.log('  nota              può scrivere file ma NON eseguire comandi (niente test).');
    console.log('                    Per farglieli eseguire: --strumenti "Bash(npm test),Bash(npm run *)"');
  }
  console.log(`  tetto di spesa    $${config.budgetUsd} per incarico`);
  console.log(`  memoria           ${existsSync(path.join(config.cartellaLavoro, 'MEMORIA.md'))
    ? (config.memoria ? 'MEMORIA.md trovata: la committo e spingo a fine incarico' : 'MEMORIA.md trovata (commit automatico spento)')
    : 'nessuna MEMORIA.md nella cartella — crea la memoria con: node strumenti/memoria.mjs nuovo "Nome"'}`);
  console.log(`  CLI claude        ${versioneCli || '✖ non trovata — installa Claude Code e fai `claude auth login`'}`);
  if (config.host === '0.0.0.0' && !config.chiave) {
    console.log('\n  ⚠ in ascolto su tutta la rete senza chiave: chiunque sia in rete può far');
    console.log('    eseguire agenti nella tua cartella. Riavvia con --chiave <parola segreta>.');
  }
  console.log('\n  Nell\'ufficio: ⚙️ Impostazioni → Endpoint → incolla l\'indirizzo qui sopra.\n');
});

for (const segnale of ['SIGINT', 'SIGTERM']) {
  process.on(segnale, () => {
    console.log('\nChiudo il ponte, fermo gli agenti in corso…');
    lavori.forEach((l) => { try { l.proc?.kill('SIGTERM'); } catch { /* ok */ } });
    process.exit(0);
  });
}

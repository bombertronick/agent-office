#!/usr/bin/env node
/**
 * strumenti/memoria.mjs — Tiene in ordine MEMORIA.md, la memoria fra sessioni.
 *
 *   node strumenti/memoria.mjs                 controlla il file e riassume lo stato
 *   node strumenti/memoria.mjs chiudi "testo"  riga di diario + data + commit + push
 *   node strumenti/memoria.mjs nuovo "Nome"    crea MEMORIA.md e CLAUDE.md dai modelli
 *
 * Opzioni: --file <percorso> · --no-push · --cartella <repo>
 * Zero dipendenze: solo Node.
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opzione = (nome, predefinito) => {
  const i = argv.indexOf(nome);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : predefinito;
};
const cartella = path.resolve(opzione('--cartella', process.cwd()));
const file = path.resolve(cartella, opzione('--file', 'MEMORIA.md'));
const comando = argv.find((a) => !a.startsWith('--') && a !== opzione('--file') && a !== opzione('--cartella')) || 'controlla';

const SEZIONI = [
  'Stato adesso', 'Dove sta il lavoro', 'Decisioni prese', 'In sospeso',
  'Prossimi passi', 'Vincoli che non si toccano', 'Diario',
];
const LIMITE_CARATTERI = 6000;
const LIMITE_DIARIO = 10;
const GIORNI_STANTIA = 10;

const oggi = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */

function analizza(testo) {
  const problemi = [];
  const avvisi = [];

  for (const sezione of SEZIONI) {
    if (!new RegExp(`^## ${sezione}`, 'm').test(testo)) problemi.push(`manca la sezione «${sezione}»`);
  }

  if (testo.length > LIMITE_CARATTERI) {
    problemi.push(`${testo.length} caratteri: oltre il limite di ${LIMITE_CARATTERI}. Sposta i dettagli in docs/ e lascia qui il puntatore.`);
  }

  const segnaposto = testo.match(/<[^>\n]{3,60}>/g) || [];
  const veri = segnaposto.filter((s) => !/^<https?:/.test(s));
  if (veri.length) problemi.push(`segnaposto non compilati: ${veri.slice(0, 3).join(', ')}${veri.length > 3 ? '…' : ''}`);

  const data = /\(aggiornato:\s*(\d{4}-\d{2}-\d{2})\)/.exec(testo);
  if (!data) problemi.push('manca «(aggiornato: AAAA-MM-GG)» nel titolo di «Stato adesso»');
  else {
    const giorni = Math.floor((Date.now() - new Date(data[1]).getTime()) / 86400000);
    if (Number.isNaN(giorni)) problemi.push(`data non valida: ${data[1]}`);
    else if (giorni > GIORNI_STANTIA) avvisi.push(`stato aggiornato ${giorni} giorni fa: prima di fidarti, verifica`);
  }

  const diario = sezione(testo, 'Diario');
  const righeDiario = diario.split('\n').filter((r) => /^- \d{4}-\d{2}-\d{2}/.test(r));
  if (righeDiario.length > LIMITE_DIARIO) avvisi.push(`diario con ${righeDiario.length} righe: tienine ${LIMITE_DIARIO}, il resto va in docs/`);

  return { problemi, avvisi, data: data?.[1] || null, righeDiario };
}

function sezione(testo, nome) {
  const m = new RegExp(`^## ${nome}[^\\n]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm').exec(testo);
  return m ? m[1].trim() : '';
}

function git(...args) {
  const r = spawnSync('git', args, { cwd: cartella, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

/* ------------------------------------------------------------------ */

async function controlla({ silenzioso = false } = {}) {
  let testo;
  try { testo = await readFile(file, 'utf8'); } catch {
    console.error(`✖ ${path.relative(cartella, file)} non esiste. Crealo con: node strumenti/memoria.mjs nuovo "Nome progetto"`);
    process.exit(2);
  }
  const esito = analizza(testo);
  if (!silenzioso) {
    console.log(`📓 ${path.relative(cartella, file)} — ${testo.length} caratteri, aggiornato ${esito.data || '?'}`);
    const stato = sezione(testo, 'Stato adesso');
    if (stato) console.log(`\n${stato.split('\n').slice(0, 4).join('\n')}`);
    const prossimi = sezione(testo, 'Prossimi passi');
    if (prossimi) console.log(`\nProssimi passi:\n${prossimi.split('\n').slice(0, 3).join('\n')}`);
    const sospeso = sezione(testo, 'In sospeso');
    if (sospeso && !/^-?\s*(nessuna|niente|—)/i.test(sospeso)) console.log(`\nIn sospeso:\n${sospeso.split('\n').slice(0, 4).join('\n')}`);
    console.log('');
    esito.avvisi.forEach((a) => console.log(`⚠ ${a}`));
    esito.problemi.forEach((p) => console.log(`✖ ${p}`));
    if (!esito.problemi.length) console.log('✓ memoria in ordine');
    else process.exitCode = 1;            // utile nei controlli automatici
  }
  return { testo, ...esito };
}

async function chiudi() {
  const riga = argv.filter((a) => !a.startsWith('--') && a !== 'chiudi' && a !== opzione('--file') && a !== opzione('--cartella')).join(' ').trim();
  if (!riga) { console.error('✖ Serve il testo della riga di diario: chiudi "cosa ho fatto"'); process.exit(2); }

  let { testo } = await controlla({ silenzioso: true });
  testo = testo.replace(/\(aggiornato:\s*\d{4}-\d{2}-\d{2}\)/, `(aggiornato: ${oggi()})`);
  testo = testo.replace(/(^## Diario[^\n]*\n)/m, `$1- ${oggi()} · ${riga}\n`);

  // pota il diario: le righe oltre il limite finiscono fuori
  const righe = testo.split('\n');
  let viste = 0;
  testo = righe.filter((r, i) => {
    const dentroDiario = righe.slice(0, i).some((x) => /^## Diario/.test(x));
    if (dentroDiario && /^- \d{4}-\d{2}-\d{2}/.test(r)) { viste += 1; return viste <= LIMITE_DIARIO; }
    return true;
  }).join('\n');

  const esito = analizza(testo);
  if (esito.problemi.length) {
    console.error('✖ Non chiudo: la memoria ha problemi da sistemare prima.');
    esito.problemi.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }
  await writeFile(file, testo);
  console.log(`✓ diario: ${riga}`);

  if (!git('rev-parse', '--is-inside-work-tree').ok) { console.log('ℹ non è un repository git: salvato solo il file'); return; }
  const relativo = path.relative(cartella, file);
  git('add', relativo);
  const commit = git('commit', '-m', `memoria: ${riga.slice(0, 60)}`, '--', relativo);
  if (!commit.ok) { console.log(`ℹ niente da committare (${commit.err.split('\n')[0] || 'nessuna modifica'})`); return; }
  console.log('✓ commit');
  if (argv.includes('--no-push')) return;
  if (!git('remote').out) { console.log('ℹ nessun remoto: commit locale'); return; }
  const ramo = git('rev-parse', '--abbrev-ref', 'HEAD').out;
  const push = git('push', '-u', 'origin', ramo);
  console.log(push.ok ? `✓ push su ${ramo}` : `✖ push fallito: ${push.err.split('\n').slice(-1)[0]}`);
  if (!push.ok) process.exit(1);
}

async function nuovo() {
  const nome = argv.filter((a) => !a.startsWith('--') && a !== 'nuovo').join(' ').trim() || path.basename(cartella);
  const modelli = path.resolve(QUI, '..', 'modelli');
  for (const [sorgente, destinazione] of [['MEMORIA.md', file], ['CLAUDE.md', path.resolve(cartella, 'CLAUDE.md')]]) {
    let esiste = true;
    try { await access(destinazione); } catch { esiste = false; }
    if (esiste) { console.log(`ℹ ${path.relative(cartella, destinazione)} esiste già: non lo tocco`); continue; }
    let contenuto = await readFile(path.join(modelli, sorgente), 'utf8');
    contenuto = contenuto.replace(/<nome del progetto>/g, nome).replace(/AAAA-MM-GG/g, oggi());
    await writeFile(destinazione, contenuto);
    console.log(`✓ creato ${path.relative(cartella, destinazione)}`);
  }
  console.log('\nOra compila le sezioni fra < > e chiudi con: node strumenti/memoria.mjs chiudi "prima memoria"');
}

const azioni = { controlla, chiudi, nuovo };
if (!azioni[comando]) { console.error(`comando sconosciuto: ${comando}`); process.exit(2); }
await azioni[comando]();

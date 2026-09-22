/**
 * main.js — Avvio dell'applicazione: stato, mondo 3D, interfaccia, ciclo.
 */

import { state, load, save, seedOffice, log } from './store.js';
import { createWorld } from './three/world.js';
import { initUI } from './ui.js';
import * as orch from './orchestrator.js';
import { DIRECTOR_LINES } from './config.js';

function boot() {
  const canvas = document.getElementById('scena');
  const labels = document.getElementById('targhette');

  const ripristinato = load();
  if (!ripristinato) {
    seedOffice();
    log({ kind: 'direttrice', who: 'Claude', text: 'Studio aperto. Squadra iniziale al lavoro: dammi pure altri incarichi.' });
  } else {
    log({ kind: 'direttrice', who: 'Claude', text: 'Bentornato: ho ripreso in mano la bacheca dove l\'avevamo lasciata.' });
  }
  if (state.mode === 'endpoint' && state.endpoint) orch.setBackend('endpoint', state.endpoint);
  if (state.mode === 'cloud' && state.cloud?.relay) orch.setBackend('cloud', state.cloud);

  const world = createWorld(canvas, labels);
  initUI(world);
  scopriRele();

  scorciatoie(world);

  // Il primo fotogramma dopo un attimo: dà tempo alla scena di comporsi.
  let last = performance.now();
  let avviato = false;

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.08);
    last = now;
    orch.tick(dt);
    world.update(dt);
    if (!avviato) {
      avviato = true;
      requestAnimationFrame(() => {
        document.getElementById('caricamento').classList.add('via');
        setTimeout(() => { document.getElementById('caricamento').style.display = 'none'; }, 600);
      });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Salva quando si lascia la pagina e ogni tanto durante il lavoro.
  window.addEventListener('beforeunload', () => save());
  setInterval(() => save(), 12000);

  document.addEventListener('visibilitychange', () => { last = performance.now(); });

  window.ufficio = { state, orch, world };   // comodo per esplorare dalla console
}

/**
 * Se l'app è servita insieme al relè (Vercel), il motore cloud si configura da solo:
 * niente indirizzi da copiare sul telefono. Resta da digitare solo la chiave, se c'è.
 */
async function scopriRele() {
  if (state.cloud?.relay || state.mode !== 'simulazione') return;          // già configurata a mano
  if (!location.protocol.startsWith('http') || location.hostname.endsWith('github.io')) return;
  const relay = `${location.origin}/api`;
  let dati = null;
  let chiaveRichiesta = false;
  try {
    const res = await fetch(`${relay}/salute`, { signal: AbortSignal.timeout(6000) });
    if (res.status === 401) chiaveRichiesta = true;
    else if (res.ok) dati = await res.json();
    else return;
  } catch { return; }                                                       // nessun relè: simulazione
  if (dati && dati.ponte !== 'agent-office-cloud') return;

  state.cloud = { relay, repo: dati?.repo || '', chiave: '' };
  if (chiaveRichiesta || dati?.chiaveRichiesta) {
    log({ kind: 'direttrice', who: 'Claude', text: 'Ho trovato il relè cloud accanto all\'app: mi serve solo la chiave. Apri ⚙️ Impostazioni → Cloud e digitala.' });
    save();
    document.dispatchEvent(new CustomEvent('apri-impostazioni'));
    return;
  }
  if (dati?.routine) {
    orch.setBackend('cloud', state.cloud);
    log({ kind: 'direttrice', who: 'Claude', text: `Relè cloud trovato: gli incarichi partono nel cloud su ${state.cloud.repo || 'il repository della Routine'}.` });
  } else {
    save();
    log({ kind: 'allarme', who: 'Claude', text: 'Relè cloud presente ma senza Routine collegata: mancano ROUTINE_FIRE_URL / ROUTINE_FIRE_TOKEN su Vercel. Resto in simulazione.' });
  }
}

function scorciatoie(world) {
  document.addEventListener('keydown', (ev) => {
    if (ev.target.matches('input, textarea, select')) return;
    if (ev.code === 'Space') {
      ev.preventDefault();
      const nuova = state.speed === 0 ? 1 : 0;
      orch.setSpeed(nuova);
      document.querySelectorAll('#velocita button').forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === nuova));
    }
    const viste = { Digit1: 'panoramica', Digit2: 'scrivanie', Digit3: 'riunione', Digit4: 'direzione', Digit5: 'lavagna' };
    if (viste[ev.code]) world.setView(viste[ev.code]);
    if (ev.key === 'r' || ev.key === 'R') { orch.standup(); world.setView('riunione'); }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

export { DIRECTOR_LINES };

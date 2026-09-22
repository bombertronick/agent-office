# Memoria di progetto — Agent Office

> Questa pagina viene letta all'avvio di **ogni** sessione (la importa `CLAUDE.md`).
> Va aggiornata e **spinta** alla fine di ogni tappa: quello che non è scritto qui,
> la prossima sessione non lo sa. Massimo 6.000 caratteri: i dettagli vanno in
> `README.md` / `ponte/README.md` e qui resta il puntatore.

## Stato adesso (aggiornato: 2026-09-22)
Ufficio 3D online su GitHub Pages; ponte locale provato sul serio; memoria fra
sessioni attiva. Nuovo: **motore cloud** — ogni incarico avvia una sessione Claude
Code via Routine (trigger API) passando da un relè serverless in `api/` su Vercel.
Codice pronto e sintatticamente verificato; **non ancora provato end-to-end**: serve
la Routine creata da Valerio (token visibile una volta sola) e le variabili su Vercel.

## Dove sta il lavoro
- codice: `bombertronick/agent-office`, ramo `main` (si lavora direttamente su main:
  progetto di una persona sola, ogni push è un rilascio su Pages)
- online: https://bombertronick.github.io/agent-office/ (Pages da `main`/root)
- rami aperti non ancora uniti: nessuno
- residuo da pulire: su `bombertronick/Nuovo` esiste ancora il ramo
  `claude/agentic-orchestration-app-3d-4bbgvu` (copia vecchia, mai unito a main):
  da cancellare dall'interfaccia GitHub — il proxy delle sessioni rifiuta i `push --delete`

## Decisioni prese (e perché)
- 2026-09-22 — orchestrazione dal telefono = Routine di Claude Code con trigger API +
  relè Vercel nello stesso repository. L'endpoint /fire non ha CORS (verificato: il
  preflight risponde 405 senza Access-Control-*), quindi il browser non può chiamarlo;
  il relè tiene il token. Avanzamento letto da GitHub (commit = registro, PR = consegna)
  perché non esiste un'API per leggere le sessioni.
- 2026-09-13 — repository dedicato, app alla radice: `Nuovo` ospita il gestionale
  cantieri; mescolare le due app avrebbe complicato Pages e la storia.
- 2026-09-13 — three.js incluso in `vendor/`, niente CDN: le sessioni cloud non
  raggiungono i CDN e l'app deve funzionare offline (PWA).
- 2026-09-13 — il ponte usa la CLI `claude` headless, non l'API: usa il login che
  Valerio ha già, zero chiavi nel browser, zero dipendenze npm.
- 2026-09-13 — gli agenti del ponte NON fanno commit del codice: le modifiche restano
  nella cartella e le guarda Valerio con `git diff`. Eccezione: `MEMORIA.md`, che il
  ponte committa e spinge da solo, perché memoria non spinta = memoria persa.
- 2026-09-15 — memoria fra sessioni = file in git importato da CLAUDE.md, non la
  memoria automatica di Claude Code (locale alla macchina, non passa fra container).

## In sospeso — domande per chi decide
- Vuoi che l'ufficio mostri un pannello «Memoria» anche in simulazione (leggendo il
  file dal repository su Pages) o solo quando è collegato al ponte?
- Su Supply Chain Pro: il ramo dell'altra sessione va ancora spinto — vedi la
  memoria di quel progetto.

## Prossimi passi, in ordine
0. Provare il motore cloud end-to-end: Routine creata, variabili su Vercel, un incarico
   piccolo, verificare ramo → commit → pull request nell'ufficio.
1. Provare `node strumenti/memoria.mjs chiudi` dentro il ponte a fine incarico, con un
   agente vero (finora provato solo a mano).
2. Dipendenze fra incarichi (un agente che aspetta il lavoro di un altro):
   `src/orchestrator.js`, funzione `plan()`.
3. Ciclo giorno/notte: `src/three/world.js`, luci `sun`/`fill`.

## Vincoli che non si toccano
- Nessun passo di build, nessun framework: moduli ES nativi serviti da file statici.
- Niente chiavi API nel browser, mai: le tiene il ponte sul computer di Valerio.
- `.nojekyll` alla radice: senza, Pages ignora i file che iniziano con underscore.
- Le corsie di cammino in `world.js` (`LANE_*`, `CORRIDORS`) dipendono dalla pianta in
  `config.js`: se sposti le scrivanie, aggiornale insieme.

## Diario (le ultime dieci righe, la più recente in alto)
- 2026-09-22 · motore cloud: CloudBackend, relè api/ (fire, salute, proxy GitHub),
  impostazioni a tre motori, link a sessione e PR sugli incarichi, cloud/README.md
- 2026-09-15 · sistema di memoria fra sessioni: MEMORIA.md, CLAUDE.md che la importa,
  strumenti/memoria.mjs, il ponte che la committa a fine incarico
- 2026-09-13 · ponte agenti veri (`ponte/server.mjs`), provato end-to-end; prova di
  connessione nelle impostazioni; indicatore simulazione/agenti veri
- 2026-09-13 · repository dedicato creato da Valerio, primo push, Pages acceso e verde
- 2026-09-12 · ufficio 3D: personaggi procedurali, orchestratrice, bacheca, revisioni,
  riunioni, layout telefono, PWA offline

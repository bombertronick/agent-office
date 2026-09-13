# 🏢 Agent Office

**Studio 3D per orchestrare agenti di programmazione.** Gli agenti non sono righe
in una lista: sono *dipendenti* che vedi lavorare: siedono alle scrivanie, scrivono
codice, si alzano per far revisionare il lavoro a un collega, si bloccano, prendono
il caffè e si riuniscono attorno al tavolo. La **Direttrice — Claude** smista gli
incarichi, sceglie chi li prende in carico, apre le revisioni e va di persona a
sbloccare chi è fermo.

**App online:** <https://bombertronick.github.io/agent-office/>
(da telefono: apri e *Aggiungi a Home*).

Nessun server, nessun account, nessuna chiave API: gira tutto nel browser, i dati
restano sul dispositivo e funziona anche offline.

---

## A cosa serve

È la **plancia di comando per far costruire nuove app dagli agenti**: apri un
incarico («pagina di login con OAuth», «suite di test per il carrello»), lo affidi
alla squadra e segui a colpo d'occhio chi sta facendo cosa, dove il lavoro si è
fermato e cosa è già passato in revisione.

Di serie il motore è **simulato**, così puoi provare il flusso senza collegare
niente. Quando vuoi agenti veri, colleghi un tuo endpoint (vedi più sotto) e
l'ufficio si anima sugli avanzamenti reali: cambia chi fa il lavoro, non come lo
guardi.

## Cosa si vede

| Elemento | Significato |
|---|---|
| 🧑‍💻 **Personaggio alla scrivania** | un agente: il ruolo si legge da colore, capigliatura e accessori |
| 💍 **Anello sotto i piedi** | stato dell'incarico in corso (verde lavora, viola revisione, rosso bloccato) |
| 💬 **Nuvoletta** | quello che l'agente "sta pensando" in quel momento |
| 🔵 **Bollino sopra la testa** | ⚙️ lavora · 🔍 revisiona · ⛔ bloccato · ☕ pausa · 💬 riunione · ⏳ attesa |
| 📋 **Post-it sulla lavagna** | un incarico aperto, col colore del tipo di lavoro |
| 🖥️ **Schermi accesi** | righe di codice che scorrono mentre l'agente lavora davvero |
| 👑 **Personaggio arancione** | la Direttrice: cammina fino alla scrivania di chi è bloccato |

## Come si usa

- **＋ Incarico** — titolo, descrizione, tipo, priorità e dimensione. L'incarico
  finisce in bacheca e sulla lavagna; la Direttrice lo assegna da sola all'agente
  con l'affinità più alta (oppure scegli tu con *Assegna*).
- **＋ Assumi** — otto ruoli disponibili (architettura, frontend, backend, QA,
  revisione, DevOps, design, ricerca). Il nuovo arrivato entra dalla porta e va
  alla sua scrivania. Le scrivanie sono 8: oltre non si va.
- **Clic su un personaggio** (o sulla scheda a sinistra) — apre il fascicolo:
  consegne, revisioni, bug trovati, energia, morale, specialità. Da lì gli assegni
  un incarico, lo inquadri, gli fai i complimenti (alza il morale), lo mandi in
  pausa caffè o lo saluti.
- **📣 Convoca riunione** — tutti si alzano e si radunano al tavolo; al rientro
  energia e morale sono più alti.
- **Velocità** ⏸ / 1× / 2× / 4× — vale per tutto, anche per le camminate.
- **Inquadrature** Panoramica · Scrivanie · Riunione · Direzione · Lavagna;
  trascina per ruotare, rotellina o pizzico per avvicinarti.

**Tasti rapidi:** `spazio` pausa · `1…5` inquadrature · `R` riunione.

## Il ciclo di un incarico

```
bacheca → assegnato → in lavorazione ──► in revisione ──► completato
                            ▲                  │
                            └──── bug trovato ─┘
                     (bloccato → la Direttrice arriva e sblocca)
```

L'affinità che decide l'assegnazione combina **ruolo × tipo di incarico**,
**energia** e **morale**. Chi revisiona non è mai chi ha scritto il codice, e un
revisore severo rimanda indietro il lavoro se trova un caso limite (al massimo due
giri, poi si chiude).

## Collegare agenti veri

In *Impostazioni* puoi passare da simulazione a **endpoint**: un tuo servizio che
esegue gli agenti — per esempio un proxy che parla con l'API di Claude o con il
Claude Agent SDK.

```
POST {endpoint}/start      { task, agent }  →  { runId }
POST {endpoint}/progress   { runId }        →  { progress: 0..1, lines: [], done: bool, blocked?: "motivo" }
POST {endpoint}/finish     { runId }        →  { }
```

`progress` è l'avanzamento da 0 a 1, `lines` le righe da mostrare nel registro.
L'adattatore sta in [`src/backends.js`](src/backends.js).

> ⚠️ L'endpoint deve stare su un tuo server: **le chiavi API non vanno mai messe
> nel browser**, è il servizio a custodirle.

## Com'è fatto

Niente framework, niente passo di build: moduli ES nativi e
[three.js](https://threejs.org) incluso nel repository (`vendor/`, licenza MIT).

```
.
├─ index.html            guscio dell'app + import map
├─ assets/ui.css         interfaccia "cartoon"
├─ src/
│  ├─ config.js          ruoli, tipi di incarico, palette, pianta dell'ufficio
│  ├─ store.js           stato, eventi, salvataggio locale
│  ├─ orchestrator.js    la Direttrice: assegnazioni, revisioni, blocchi, riunioni
│  ├─ backends.js        motore simulato + adattatore HTTP
│  ├─ ui.js              pannelli, bacheca, registro, finestre
│  ├─ main.js            avvio e ciclo di disegno
│  └─ three/
│     ├─ world.js        camera, luci, spostamenti, targhette
│     ├─ office.js       stanza, scrivanie, lavagna, sala riunioni
│     ├─ character.js    personaggi e animazioni procedurali
│     └─ utils.js        geometrie arrotondate, toon shading, contorni, texture
└─ sw.js                 cache offline
```

Tutta la grafica è **generata dal codice**: nessun modello 3D, nessuna texture
scaricata. Lo stile cartone viene da tre scelte: volumi arrotondati
(`roundedBox`), ombreggiatura a fasce (`MeshToonMaterial` con rampa a 4 gradini) e
contorno scuro ottenuto duplicando la mesh ingrossata e vista da dentro.
Le animazioni non sono clip registrate ma pose calcolate a ogni fotogramma e
smorzate: camminata, digitazione, pensiero, festeggiamento, sconforto, caffè.

## Prova in locale

```bash
python3 -m http.server 8765
# poi apri http://localhost:8765/
```

Serve un server: i moduli ES non si caricano da `file://`.

## Pubblicare su GitHub Pages

*Settings → Pages → Build and deployment → Source: Deploy from a branch →
Branch: `main` / `root` → Save.* Dopo un minuto l'app è su
`https://bombertronick.github.io/agent-office/`.

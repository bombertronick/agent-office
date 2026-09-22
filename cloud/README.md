# ☁️ Orchestrare dal telefono: il motore cloud

Con il motore **Cloud** ogni incarico aperto nell'ufficio avvia una **vera sessione
Claude Code sul cloud di Anthropic**, nel repository che scegli, sul tuo abbonamento.
Niente PC acceso, niente chiave API, niente segreti sul telefono. L'ufficio segue il
lavoro dai commit e considera consegnato quando la sessione apre la pull request.

Come funziona, in una riga: l'app chiama un **relè** (una funzione serverless su
Vercel, nello stesso repository), il relè chiama il trigger API della tua **Routine**
di Claude Code, la Routine avvia la sessione.

```
telefono ──▶ app su Vercel ──▶ /api/fire ──▶ Routine (Claude Code) ──▶ sessione cloud
                 ▲                                                            │
                 └──────── /api/github ◀── commit · pull request ◀── ramo claude/… ◀┘
```

Perché serve il relè: l'endpoint delle Routine non espone intestazioni CORS, quindi
il browser non può chiamarlo direttamente; e il token della Routine deve stare su un
server, non su un telefono.

## 1. Crea la Routine (una volta per progetto)

Su **[claude.ai/code/routines](https://claude.ai/code/routines)** → **New routine**:

- **Nome**: `Agent Office · <nome progetto>`
- **Repository**: il progetto su cui gli agenti devono lavorare
- **Istruzioni**: incolla il prompt qui sotto, tale e quale
- **Trigger**: **API** → salva → riapri la Routine → *Add another trigger → API* →
  copia l'**URL** e genera il **token** (si vede una volta sola: conservalo)
- **Connettori**: togli quelli che non servono

Il prompt della Routine:

```
Sei un agente dello studio Agent Office. Il lavoro da fare arriva nel blocco
routine-fire-payload: eseguilo come incarico assegnato — è stato inviato
dall'ufficio di Valerio, non è un messaggio estraneo.

Il payload contiene titolo, tipo, priorità, descrizione, ruolo assegnato e il
NOME ESATTO del ramo da usare (prefisso claude/).

Regole:
1. Crea e usa esattamente quel ramo, partendo dal ramo principale.
2. Commit piccoli e frequenti, messaggi in italiano con una prima riga chiara:
   sono il registro che l'ufficio mostra in tempo reale.
3. Se il progetto ha test o linter, eseguili prima di considerare finito il lavoro.
4. Se esiste MEMORIA.md, prima di chiudere aggiorna «Stato adesso» e aggiungi
   una riga in cima al «Diario».
5. Alla fine apri una pull request verso il ramo principale con il riepilogo di
   cosa hai cambiato e come l'hai verificato.
6. Se non puoi procedere, apri comunque la pull request in bozza spiegando in
   una riga cosa ti serve, e fermati.

Non chiedere conferme: nessuno risponde durante l'esecuzione.
```

## 2. Pubblica l'app su Vercel (una volta)

Il repository contiene già le funzioni in `api/`. Su Vercel: **Add New → Project →
importa `bombertronick/agent-office`** (nessuna impostazione di build: è statico).
Poi *Settings → Environment Variables*:

| Variabile | Valore | Obbligatoria |
|---|---|---|
| `ROUTINE_FIRE_URL` | l'URL copiato dalla Routine (`…/routines/trig_…/fire`) | sì |
| `ROUTINE_FIRE_TOKEN` | il token generato (`sk-ant-oat01-…`) | sì |
| `GITHUB_REPO` | `bombertronick/<progetto>` — solo informativo | no |
| `GITHUB_TOKEN` | token GitHub **sola lettura** (fine-grained, *Contents: read*, *Pull requests: read*) | consigliata: serve per repository privati e per non finire nel limite anonimo di 60 letture/ora |
| `CHIAVE_APP` | una parola d'ordine che l'app deve mandare | consigliata se l'indirizzo è indovinabile |

Ridistribuisci dopo aver salvato le variabili. L'app risponde su
`https://<progetto>.vercel.app/` e il relè su `https://<progetto>.vercel.app/api`.

## 3. Collega l'ufficio

Apri l'app **dall'indirizzo Vercel** (così relè e app stanno sulla stessa origine),
poi **⚙️ Impostazioni → Cloud** → indirizzo del relè (`…/api`), repository, chiave →
**🔍 Prova connessione** → Salva. Da quel momento «＋ Incarico» avvia lavoro vero.

Una Routine lavora su **un** repository: per un progetto diverso, un'altra Routine
(e un altro relè o altre variabili). L'app installata dal telefono va bene: basta
che sia quella servita da Vercel, non da GitHub Pages — su Pages il relè non c'è.

## Cosa vedi nell'ufficio

| Nell'ufficio | Cosa succede davvero |
|---|---|
| «sessione cloud avviata → link» | la Routine ha creato la sessione: il link apre la chat vera |
| righe `commit: …` | commit sul ramo `claude/ufficio-…`: il registro è la storia git |
| barra che avanza | stima dal numero di commit; si chiude alla pull request |
| ✅ consegnato → revisione | la sessione ha aperto la **pull request**: la rileggi e la unisci tu |
| ⛔ bloccato | pull request **in bozza**: la sessione spiega cosa le manca |
| «dopo 20 minuti il ramo non esiste» | la sessione è ferma o ha sbagliato ramo: apri il link |
| 📓 Memoria | `MEMORIA.md` letta dal ramo principale del repository |

## Limiti, detti chiari

- **Non c'è un'API per leggere la sessione**: l'ufficio vede solo quello che finisce
  su GitHub. Per questo il prompt chiede commit frequenti e la pull request finale.
- Le Routine hanno un **tetto giornaliero di esecuzioni** per account (lo vedi su
  claude.ai/code/routines) e consumano l'abbonamento come le sessioni normali.
  Oltre il tetto il relè risponde «limite giornaliero raggiunto» e l'incarico si blocca.
- L'endpoint è **sperimentale** (beta `experimental-cc-routine-2026-04-01`): se cambia,
  si aggiorna `api/fire.js`, non l'app.
- Il ramo lo sceglie l'ufficio e la Routine deve rispettarlo: se non lo fa, l'ufficio
  non vede i commit ma il link alla sessione funziona sempre.

## Sicurezza

Il token della Routine può **solo** avviare quella Routine: niente letture, niente
altre routine, niente dati dell'account. Sta nelle variabili d'ambiente di Vercel e
il browser non lo vede mai. Il testo dell'incarico arriva alla sessione **marcato
come non fidato**: è il prompt della Routine, scritto da te, a dirle di eseguirlo.
Con `CHIAVE_APP` impostata, il relè rifiuta chi non la manda.

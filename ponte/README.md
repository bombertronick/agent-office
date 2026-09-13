# 🔌 Il ponte: agenti veri nell'ufficio

Di serie Agent Office è una **simulazione**: bella da vedere, ma nessuno tocca il
codice. Il ponte sostituisce il motore finto con **agenti Claude Code veri**: ogni
incarico che apri nell'ufficio fa partire un agente nella cartella che gli indichi,
e quello che vedi scorrere nel registro è il lavoro che sta realmente succedendo
sui tuoi file.

## Cosa serve

- un computer acceso (il ponte gira lì, non sul telefono)
- **Node 18+**
- **Claude Code** installato e autenticato: `claude auth login`
  → il ponte usa quel login. **Nessuna chiave API finisce nel browser.**

## Avvio

```bash
git clone https://github.com/bombertronick/agent-office
cd agent-office
node ponte/server.mjs --cartella ~/progetti/mia-app
```

Poi apri **<http://localhost:4444/>** — il ponte serve anche l'ufficio, così app e
API stanno sulla stessa origine (niente CORS, niente contenuti misti).
Dentro l'app: **⚙️ Impostazioni → Agenti veri → indirizzo `http://localhost:4444/api`
→ 🔍 Prova connessione → Salva.**

Da quel momento «＋ Incarico» avvia lavoro vero.

## Opzioni

| Opzione | Cosa fa | Predefinito |
|---|---|---|
| `--cartella <percorso>` | la cartella in cui lavorano gli agenti | cartella corrente |
| `--modello <alias>` | `opus`, `sonnet`, `haiku` | `opus` |
| `--permessi <modo>` | `acceptEdits`, `bypassPermissions`, `plan`, `default` | `acceptEdits` |
| `--strumenti "<elenco>"` | comandi eseguibili senza approvazione | nessuno |
| `--budget <dollari>` | tetto di spesa per singolo incarico | `1.5` |
| `--max-turni <n>` | quanti giri può fare l'agente | `40` |
| `--porta <n>` / `--host <ip>` | dove ascoltare | `4444` / `127.0.0.1` |
| `--chiave <parola>` | protegge le API (obbligatoria se apri il ponte alla rete) | vuota |

Le scelte finiscono in `ponte/config.json`, che puoi modificare a mano.

### Permessi: il punto che conta

Con `acceptEdits` l'agente **scrive i file ma non può eseguire comandi**: in
headless non c'è nessuno che approvi, quindi `npm test` non parte e l'agente
consegna senza aver verificato. Due modi per risolverlo:

```bash
# a) autorizzi solo quello che ti serve (consigliato)
node ponte/server.mjs --cartella ~/app --strumenti "Bash(npm test),Bash(npm run *),Bash(git diff*)"

# b) autonomia piena: l'agente esegue qualunque comando in quella cartella
node ponte/server.mjs --cartella ~/app --permessi bypassPermissions
```

`bypassPermissions` è comodo e va usato con la testa: dai a un agente la stessa
libertà che avresti tu in quella cartella. Tienilo per progetti sotto git, dove
un `git diff` ti fa vedere tutto quello che è cambiato.

## Cosa vedi nell'ufficio

| Nell'ufficio 3D | Cosa sta succedendo davvero |
|---|---|
| l'agente digita | l'agente vero sta leggendo/scrivendo file |
| riga nel registro | uno strumento usato: `Edit calcolo.js`, `$ npm test`, `Read README.md` |
| barra che avanza | stima dagli eventi: non sa quanto manca, quindi rallenta vicino alla fine |
| ⛔ bloccato | l'agente si è fermato per chiedere qualcosa, oppure il ponte è irraggiungibile |
| ✅ completato | il processo è uscito bene; poi parte la revisione |
| costo | ogni incarico chiuso riporta durata e spesa |

Gli agenti **non fanno commit e non spingono niente**: lasciano le modifiche nella
cartella, le guardi tu con `git diff` e decidi.

## Inoltrare un incarico a una sessione già aperta

Se hai una sessione Claude Code in corso altrove (claude.ai/code, app mobile) e
vuoi mandarle un'istruzione dall'ufficio, scrivi nella descrizione dell'incarico:

```
@sessione session_01ABC…        (oppure un nome breve definito in config.json)
```

Il ponte inoltra il messaggio con `claude -p "…" --cloud <id>` e nel registro
compare il collegamento. Attenzione: **è un invio, non uno specchio**. La risposta
la leggi in quella sessione: oggi non esiste un'API pubblica per rileggere lo stato
di una sessione cloud da un'app esterna, quindi l'ufficio non può mostrarne
l'avanzamento.

Per dare un nome breve alle sessioni, in `ponte/config.json`:

```json
{ "sessioniCloud": { "supply": "session_01KThhRSSktPTUzqyRQZWiUY" } }
```

## Usarlo dal telefono

Il ponte ascolta solo su `127.0.0.1`. Per raggiungerlo dal telefono:

```bash
# stessa rete di casa, con una chiave d'accesso
node ponte/server.mjs --cartella ~/app --host 0.0.0.0 --chiave unaParolaSegreta
# dal telefono: http://<ip-del-computer>:4444/  ·  endpoint .../api?chiave=unaParolaSegreta
```

Senza `--chiave` chiunque sia sulla tua rete può far eseguire agenti nella tua
cartella: il ponte te lo ricorda all'avvio.

## Quando qualcosa non va

| Sintomo | Causa |
|---|---|
| «Nessuna risposta» nella prova di connessione | ponte spento, porta diversa, o indirizzo senza `/api` finale |
| «la CLI `claude` non è installata» | manca Claude Code nel PATH del computer che ospita il ponte |
| incarico bloccato subito | cartella di lavoro inesistente, o CLI non autenticata (`claude auth login`) |
| l'agente scrive ma non esegue i test | permessi: vedi la sezione sopra |
| si ferma a metà | tetto di spesa o `--max-turni` raggiunti: alzali |

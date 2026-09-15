# Agent Office

@MEMORIA.md

## Regole di memoria
- `MEMORIA.md` è l'unica memoria che sopravvive alla sessione. È già qui sopra:
  prima di lavorare leggila; prima di chiudere una tappa aggiornala.
- Alla fine di ogni tappa: `node strumenti/memoria.mjs chiudi "cosa ho fatto"`
  — controlla il file, aggiorna la data, scrive la riga di diario, fa commit e push.
- Lavoro non spinto = lavoro perso quando il container viene riciclato. Non si
  lascia mai una sessione con modifiche solo locali.
- Le domande per Valerio vanno sotto «In sospeso», non solo nella chat.

## Come si lavora qui
- Niente build, niente dipendenze: moduli ES in `src/`, three.js in `vendor/`.
- Prova in locale: `python3 -m http.server 8765` e apri `http://localhost:8765/`.
- Controllo rapido di sintassi: `node --check ponte/server.mjs strumenti/memoria.mjs`.
- Ogni push su `main` è un rilascio (GitHub Pages).
- Italiano ovunque: interfaccia, commenti, commit.

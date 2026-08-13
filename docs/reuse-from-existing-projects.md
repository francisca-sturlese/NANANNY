# Cosa riusiamo dai progetti esistenti

Rilievo fatto il 2026-08-13 su richiesta esplicita ("usa quello che è già presente").
Niente copia-incolla cieco: sotto c'è solo ciò che è stato verificato come
pertinente a NaNanny, con il motivo.

## Da `~/athonbound-website` (Next.js 16, Tailwind v4)

**Riusato: impostazione del progetto.**

- Design token come variabili CSS su `:root` + `@theme inline` di Tailwind v4,
  invece di un `tailwind.config.js`. Stesso schema adottato in
  `src/app/globals.css`.
- Struttura `src/app` + `src/lib`, alias `@/*`.
- Client Supabase in `src/lib/supabase.ts`.

**Non riusato:** i componenti sono brandizzati AthonBound (palette, tipografia,
animazioni GSAP/three.js). NaNanny ha un brand diverso e un'altra tipologia di
prodotto.

## Da `~/Desktop/AthonBound-Code` (FastAPI/Python)

Il codice è Python e NaNanny è TypeScript: quelli qui sotto sono **pattern da
portare**, non file da copiare. Il valore sta nei bug già pagati in produzione.

### 1. Resend — `webapp/mailer.py`

- Resend limita a **2 richieste/secondo**. Un singolo evento applicativo può
  sforare (loop di notifica admin + email utente, zero delay). Il 429 è una
  risposta di routine, non un guasto.
  A luglio 2026 una welcome email reale è andata persa così, confermata dal log
  Resend. Fix: 3 tentativi, backoff 0.6s.
- **Never raise**: un invio fallito viene loggato e ingoiato. Nessun flusso di
  prodotto deve rompersi perché un'email non è partita.
- Ogni invio scrive una riga di log. In NaNanny è la tabella `email_events`.

Portato in `src/lib/email/client.ts`.

### 2. Webhook di pagamento — `webapp/server.py` (`/webhooks/stripe`)

Quattro rilievi d'audit reali, tutti applicabili al §31 della PRD
("usa i webhook, mai il frontend come fonte di verità"):

1. **Idempotenza.** Stripe non garantisce consegna exactly-once. Un retry
   ri-mandava la stessa email di conferma. Il controllo "già processato" deve
   avvenire **sotto lock della riga**, insieme alla scrittura: un controllo
   sequenziale non copre due consegne concorrenti.
   → In NaNanny: `subscription_events.provider_event_id` ha un unique index, e
   l'handler scrive evento e subscription nella stessa transazione.
2. **`customer.subscription.updated` va gestito**, non solo `.deleted`. Le
   modifiche fatte dal portale del provider (cancel-at-period-end, un-cancel,
   cambio di stato a metà ciclo) passano da lì. Senza handler la riga locale
   restava stale fino alla scadenza reale.
3. **Il piano va ri-derivato dai price item della subscription**, non letto dai
   metadata del checkout. Bug reale: chi faceva downgrade dal portale si teneva
   le feature del piano superiore *a tempo indefinito*, senza pagarle.
   → In NaNanny è il passaggio monthly → weekly.
4. **Metadata mancanti vanno loggati rumorosamente.** Un 200 OK silenzioso fa
   emergere il problema giorni dopo, come lamentela del cliente.

### 3. Deduplica delle notifiche — `webapp/nudges.py`

Ogni notifica porta una `dedupe_key`, quindi il job può girare quanto vuole
senza mai ri-notificare una condizione già notificata. Solo una condizione
genuinamente nuova o peggiorata produce una riga nuova.

Serve identico per:
- le email di engagement (famiglia inattiva 3gg / 7gg);
- **le email dei contatti gratuiti** — "hai 1 contatto rimasto" non deve
  partire due volte.

→ In NaNanny: `email_events.idempotency_key` con unique index parziale.

### 4. Upload dei documenti — `malware_scan.py`, `object_storage.py`

- Scansione ClamAV in-stream, **fail closed**: se lo scanner è irraggiungibile
  l'upload viene bloccato, non lasciato passare. Un upload che salta la
  scansione in silenzio è un guasto peggiore di uno scanner temporaneamente giù.
- Storage privato: il browser non riceve mai un URL Supabase diretto, scarica
  sempre attraverso una route dell'app che tiene in mezzo il controllo di
  proprietà.

Serve per i documenti nanny (§41: nessun documento sensibile su URL pubblico).

### 5. `docs/pentest-report-2026-07-09.md`

Da rileggere prima di chiudere la security review (Milestone 8).

## Da `~/Projects/Dubai Chambers` (FastAPI/Python)

Quasi nulla: è una pipeline di scraping ed enrichment, dominio diverso.

**L'unica cosa che vale**, da `webapp/rate_limit.py`:

- Rate limiting con strategia **moving-window**, non fixed-window. Col
  fixed-window il conteggio si azzera al cambio di minuto solare, quindi un
  burst a cavallo del minuto fa passare fino al **doppio** del limite in ~60
  secondi reali.
- Il conteggio in memoria di processo regge solo a istanza singola. Per NaNanny,
  che punta al deploy serverless, il rate limit va tenuto nel database o in un
  Redis, non in memoria.

Applicabile al §60 (rate limit su auth e messaging).

`job_lock.py` invece **non** serve: è una guardia in-process valida solo
mono-worker. Lo stesso problema in NaNanny è già risolto meglio, con
`pg_advisory_xact_lock` dentro `start_conversation()`, che regge anche
multi-istanza.

⚠️ In quel repo ci sono `.env` e CSV con dati reali del cliente Dubai Chambers.
Restano separati: niente di quel materiale entra in NaNanny.

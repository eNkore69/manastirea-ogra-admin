# Mănăstirea Ogra — admin și API

Cloudflare Worker care servește interfața de administrare și API-ul de conținut al site-ului Astro. Routerul HTTP este construit cu Hono, iar datele și imaginile rămân în D1 și R2.

## Arhitectură

- `src/index.ts`: aplicația Hono, rutele publice/admin și logica existentă D1/R2.
- `src/auth.ts`: autentificare, sesiuni, rolul de administrator, CSRF și limitarea încercărilor de autentificare.
- `src/middleware.ts`: logging structurat, limite de body, CORS și headere de securitate.
- `src/types.ts`: tipurile contextului Hono bazate pe `Env` generat de Wrangler.
- `public/`: aplicația admin neschimbată vizual; autentificarea folosește acum cookie de sesiune.
- `migrations/`: schema D1, inclusiv tabelele de sesiuni și rate limiting.

Site-ul Astro accesează Workerul prin service bindingul `CONTENT_API` și folosește rutele `/api/public/*`. Pentru fallback poate folosi și URL-ul public al Workerului.

## Bindinguri și secrete

- `DB`: D1 `manastire-main` (`9af11358-2cc8-4eba-98ad-76bee4de07b2`).
- `MEDIA`: bucketul R2 `manastirea-ogra-media`.
- `ASSETS`: fișierele statice din `public/`.
- `SITE_ORIGIN`: originea publică permisă de CORS.
- `PUBLIC_MEDIA_URL`: URL-ul public al bucketului R2.
- `USER_KEY` și `PASS_KEY`: secretele Cloudflare pentru autentificarea unicului administrator.

Tipurile bindingurilor sunt generate cu `npm run types`; nu se întreține manual o interfață paralelă pentru `Env`.

## Autentificare și securitate

- `POST /api/auth/login` verifică `USER_KEY` și `PASS_KEY` și este limitat după adresa clientului.
- `GET /api/auth/session` verifică sesiunea curentă.
- `POST /api/auth/logout` revocă sesiunea.
- Tokenul de sesiune este aleator, în D1 se păstrează numai hashul lui.
- Cookie-ul de sesiune este `HttpOnly`, `SameSite=Strict` și devine `Secure` pe HTTPS.
- Tokenul de sesiune și datele de autentificare nu sunt păstrate în `localStorage` sau `sessionStorage`.
- Orice operație admin de tip create/update/delete cere sesiune validă, rol admin, origine corectă și header CSRF.
- Răspunsurile de eroare nu includ mesaje SQL sau stack trace.
- Uploadul acceptă numai WebP și maximum 15 MB; cheia R2 rămâne generată aleator în forma `images/<an>/<uuid>.webp`.

## API păstrat

Rutele publice existente:

- `GET /api/public/content`
- `GET /api/public/posts/:slug`
- `GET /api/public/galleries/:slug`
- `GET /api/public/church-calendar/:monthDay`
- `GET /media/*`

Rutele admin existente rămân sub `/api/admin/*`, inclusiv pagini, setări, știri, program, imagini, categorii, galerii și calendar bisericesc. Structura JSON a rutelor de conținut și URL-urile consumate de Astro nu s-au schimbat.

## Dezvoltare locală

1. Copiați `.dev.vars.example` ca `.dev.vars` și completați credentialele locale.
2. Rulați `npm install`.
3. Aplicați schema locală cu `npm run migrate:local`.
4. Porniți Workerul cu `npm run dev`.
5. Verificați proiectul cu `npm run check` și `npm run dry-run`.

## Publicare

Ordinea este importantă pentru prima versiune cu sesiuni:

1. `npm run check`
2. `npm run dry-run`
3. `npm run migrate:remote`
4. `npm run deploy`

Secretele se configurează interactiv, fără a fi scrise în repository:

```text
npx wrangler secret put USER_KEY
npx wrangler secret put PASS_KEY
```

Nu există în acest proiect un formular public de contact cu trimitere și nici un endpoint Turnstile. Pagina de contact este conținut editorial; de aceea migrarea Hono nu inventează rute sau bindinguri Turnstile inexistente.

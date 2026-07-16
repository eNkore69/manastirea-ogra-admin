# Mănăstirea Ogra — admin și API

Cloudflare Worker cu interfață admin, D1 și R2. Conținutul public este disponibil la /api/public/content, iar imaginile din R2 la /media/:key.

## Conectarea resurselor

1. Baza D1 este configurată ca manastire-main cu ID-ul 9af11358-2cc8-4eba-98ad-76bee4de07b2.
2. Actualizați bucket_name dacă numele bucketului diferă de manastirea-ogra-media.
3. Setați SITE_ORIGIN la domeniul Pages. PUBLIC_MEDIA_URL este configurat la adresa publică R2.
4. Rulați npm run types după orice modificare a bindingurilor.
5. Aplicați schema cu npm run migrate:remote.
6. Configurați secretele interactiv, fără a le scrie în cod: npx wrangler secret put USER_KEY și npx wrangler secret put PASS_KEY.
7. Verificați cu npm run check și npm run dry-run, apoi publicați cu npm run deploy.

Pentru dezvoltare locală, copiați .dev.vars.example ca .dev.vars, rulați npm run migrate:local, apoi npm run dev.

## Date

- settings: date oficiale, rețele sociale și Google Maps
- pages: pagini, blocuri JSON, imagine principală și SEO
- posts: știri
- events: evenimente
- services: programul slujbelor
- media: metadatele imaginilor din R2
- gallery_items: imaginile publicate în galerie

Fișierele încărcate sunt validate, au limită de 15 MB și primesc URL-uri stabile prin Worker. USER_KEY și PASS_KEY sunt citite exclusiv din secretele mediului.

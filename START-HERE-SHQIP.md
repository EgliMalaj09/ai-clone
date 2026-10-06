# Hape PROJECT STUDIO në VS Code

## 1. Hap projektin

Çkompreso ZIP-in. Në VS Code zgjidh File → Open Folder dhe hap dosjen PROJECT-STUDIO, atë që përmban package.json. Hap Terminal → New Terminal.

Kërkohet Node.js 22.13 ose më i ri (shih package.json). Përdor versionin pnpm të projektit:

```sh
npm install -g pnpm@11.19.0
pnpm install --frozen-lockfile
```

## 2. Nisja e parë në kompjuter, pa pagesa reale

```sh
pnpm setup:demo
pnpm build
pnpm db:migrate:local
pnpm dev
```

Hap http://localhost:5173. Skripti setup:demo krijon .env dhe shfaq në terminal emailin dhe fjalëkalimin e ri të administratorit lokal. Ruaje fjalëkalimin. Mos krijo .env përpara këtij hapi; skripti nuk mbishkruan një skedar ekzistues.

Kjo mënyrë testimi vlen vetëm për kompjuterin tënd. Nuk ndryshon konfigurimin e website-it online. Databaza dhe media lokale ruhen në .wrangler/state dhe nuk sinkronizohen automatikisht me faqen online.

Herët e tjera mjafton:

```sh
pnpm dev
```

## 3. Puna me AI dhe pagesa reale

Në .env vendos DEMO_MODE=false. Lidh llogaritë e tua te /admin/connections, aktivizo ofruesin AI te /admin/providers dhe lexo docs/OPERATIONS.md për pagesat me POK, adresat publike dhe punët në sfond. localhost nuk arrihet drejtpërdrejt nga POK ose ofruesi AI. Mos aktivizo PUBLIC_SERVICE_ACCESS=true pa adresat dhe shërbimet realisht të arritshme.

Skripti setup:demo nevojitet vetëm për konfigurimin fillestar lokal; mund të ndryshosh modalitetin pas tij. Çelësat e shërbimeve online nuk përfshihen në këtë arkiv.

## 4. Ku gjenden pjesët e projektit

- app/ dhe components/: faqet dhe ndërfaqja.
- lib/server/: API-të, autentikimi, pagesat, ruajtja, workflow dhe punët në sfond.
- db/ dhe drizzle/: skema dhe migrimet e databazës.
- lib/catalog.ts: template-t fillestare.
- public/media/: posterat dhe videot preview.
- tests/: testet automatike.
- docs/ADMIN-GUIDE.md: krijimi i template-ve, promptet private dhe lidhjet API.
- docs/API.md: dokumentimi i API-ve.
- docs/OPERATIONS.md: konfigurimi për publikim dhe shërbimet reale.

## 5. Kontrollet

```sh
pnpm typecheck
pnpm build
pnpm test:integration
pnpm test:security
pnpm test:providers
pnpm test:production
```

Testet krijojnë databaza të përkohshme dhe përdorin përgjigje të simuluara për shërbimet e jashtme; nuk janë konfirmim i një pagese ose gjenerimi real.

## Çfarë përfshin ZIP-i

I gjithë kodi i versionit 4 të publikuar, imazhet/video preview, skema, migrimet, të dhënat fillestare, testet, lockfile dhe dokumentimi. Janë lënë jashtë node_modules (instalohet me pnpm), databaza dhe ngarkimet e website-it online, .env me sekretet, historiku Git dhe skedarët e përkohshëm të punës.

Stack-u real është React/TypeScript/Vinext, Cloudflare Worker, D1 (SQLite) dhe R2. Nuk është projekt PostgreSQL. Punon lokalisht me shërbimet e emuluara; publikimi në një hosting tjetër kërkon konfigurimin e këtyre shërbimeve ose përshtatjen e tyre.

Ndryshimet që bën në VS Code nuk publikohen automatikisht në website-in aktual. Për ta ruajtur punën tënde në GitHub, krijo një repository tëndin; ky ZIP nuk përmban kredenciale Git ose histori Git.

# PROJECT STUDIO — Udhëzuesi i administratorit

## Hyrja

Hap `/login?next=/admin` dhe përdor llogarinë e administratorit. Pas hyrjes, ndrysho fjalëkalimin fillestar te Account → Security. Regjistrimi i zakonshëm nuk krijon administratorë.

## Ku krijohet template

1. Hap **Admin → Templates → New template** (`/admin/templates/new`).
2. Te **Template details**, vendos emrin, përshkrimin, kategorinë, numrin e fotove, kohëzgjatjen dhe formatin.
3. Ngarko posterin dhe videon preview. Përdor një rezultat real të provuar si shembull për klientët. Të gjithë skedarët e preview-ve shfaqen te Admin → Media library, bashkë me template-t që i përdorin. Një skedar që nuk e përdor më asnjë template fshihet automatikisht; një skedar i ngarkuar por i paruajtur në template fshihet pas 24 orësh.
4. Cakto **Credit cost**: sa kredite shpenzon klienti për një video. **Estimated AI cost** përdoret vetëm për llogaritjen tënde të fitimit; paneli **Credits & economics** tregon vlerën e një videoje sipas paketave aktive dhe marzhin.
5. Hape skedën **AI workflow** dhe kliko **Use photo-to-video workflow**. Ky konfigurim kërkon fal.ai dhe mbështet video 5 ose 10 sekonda.
6. Shkruaj **Your hidden prompt**. Hapi i parë e përdor për të krijuar skenën nga fotoja; hapi i dytë animon imazhin e dalë. Klienti nuk i sheh këto fusha.
7. Ruaje draftin ose kliko **Publish template**. Ndryshimet e kostos në kredite vlejnë për videot e reja; videot që janë duke u krijuar ruajnë koston me të cilën nisën.

## Shembull: Formula Driver

Emri: Formula Driver. Një foto. Format vertikal 9:16. Video 5 sekonda. Kosto: 299 kredite.

Prompt privat për hapin e transformimit:

> Create a cinematic portrait of the person in the reference photo as a professional racing driver in an original unbranded racing suit, holding a helmet in a sunlit motorsport paddock. Preserve their recognizable identity, facial features and natural skin tone. Keep the face visible. No text, logos or watermarks.

Butoni i konfigurimit të gatshëm lidh foton me modelin. Nuk duhet të shkruash një URL fotografie brenda këtij prompti. Mos vendos çelësa API në prompt.

**Step prompt** ka përparësi ndaj promptit të përgjithshëm. Lëre bosh në hapin e transformimit nëse dëshiron të përdoret **Your hidden prompt**. Hapi i videos ka promptin e vet për lëvizjen.

## Ku vendosen API keys

Te **Admin → Connections** (`/admin/connections`):

- Stripe secret key dhe webhook signing secret për pagesat.
- fal.ai API key për workflow-n e gatshëm, ose Replicate për një workflow tjetër.
- Resend key dhe një adresë dërguesi me domain të verifikuar për emailin.

Shkruaj fjalëkalimin e administratorit për të ruajtur. Çelësat ruhen të enkriptuar. Një fushë bosh ruan çelësin ekzistues; opsioni Remove e heq. Mos i dërgo çelësat në chat. Pastaj aktivizo ofruesin te **AI providers**.

## Si bëhet gjenerimi për klientin

Klienti blen më parë një paketë kreditesh te **Credits** (`/credits`); pa kredite nuk mund të ngarkojë foto. Pastaj zgjedh template, ngarkon foton dhe nis videon. Kreditet rezervohen në fillim, zbriten vetëm kur video dorëzohet dhe kthehen automatikisht nëse gjenerimi dështon. Serveri merr foton dhe workflow-n privat nga baza e të dhënave, krijon imazhin e transformuar dhe nis videon. Rezultati ruhet te **My Creations**, ku mund të shkarkohet. Klienti nuk shkruan prompt dhe nuk zgjedh model.

## Paketat e krediteve

Te **Admin → Credit packs** (`/admin/credit-packs`) krijo paketat: emri, numri i krediteve, kreditet bonus dhe çmimi për çdo monedhë. Vetëm paketat aktive shfaqen te klientët. Kreditet nuk skadojnë dhe paketat nuk rimbursohen pasi blihen.

- **Admin → Credit purchases**: të gjitha blerjet dhe statusi i tyre (Paid, Failed, Reversed). Një rimbursim ose chargeback në Stripe i heq kreditet automatikisht, edhe nëse bilanci del negativ.
- **Admin → Credit ledger**: çdo lëvizje kreditesh, me kontrollin që bilancet përputhen me librin.
- **Admin → Users → Adjust credits**: shto ose hiq kredite me arsye dhe fjalëkalimin e administratorit.
- **Admin → Settings → Credits per new account**: kreditet falas për çdo llogari të re (0 si parazgjedhje).

## Çfarë kërkohet për shitje reale

Çelësat e llogarive të tua, një dërgues emaili i verifikuar, ofruesi AI aktiv, ekzekutimi i vazhdueshëm i radhës dhe adresat e arritshme nga Stripe/AI duhet të jenë konfiguruar. Connections tregon çfarë mungon. Çelësat Stripe test nuk marrin para reale.

Faqja private mund të shfletohet dhe administrohet nga pronari. Për klientë dhe webhook-e reale duhet aktivizuar qasja publike nga pronari i hosting-ut. Gjendja Production nuk do të thotë se çelësat janë testuar ose shërbimet janë paguar. Deri në plotësimin e konfigurimit, blerja qëndron e mbyllur.

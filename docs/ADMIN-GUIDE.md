# PROJECT STUDIO — Udhëzuesi i administratorit

## Hyrja

Hap `/login?next=/admin` dhe përdor llogarinë e administratorit. Pas hyrjes, ndrysho fjalëkalimin fillestar te Account → Security. Regjistrimi i zakonshëm nuk krijon administratorë.

## Ku krijohet template

1. Hap **Admin → Templates → New template** (`/admin/templates/new`).
2. Te **Template details**, vendos emrin, përshkrimin, kategorinë, numrin e fotove, kohëzgjatjen dhe formatin.
3. Ngarko posterin dhe videon preview. Përdor një rezultat real të provuar si shembull për klientët.
4. Cakto **Selling price**. **Estimated AI cost** përdoret vetëm për llogaritjen tënde të fitimit.
5. Hape skedën **AI workflow** dhe kliko **Use photo-to-video workflow**. Ky konfigurim kërkon fal.ai dhe mbështet video 5 ose 10 sekonda.
6. Shkruaj **Your hidden prompt**. Hapi i parë e përdor për të krijuar skenën nga fotoja; hapi i dytë animon imazhin e dalë. Klienti nuk i sheh këto fusha.
7. Ruaje draftin ose kliko **Publish template**. Ndryshimet e çmimit vlejnë për porositë e reja.

## Shembull: Formula Driver

Emri: Formula Driver. Një foto. Format vertikal 9:16. Video 5 sekonda. Çmimi: $2.99.

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

Klienti zgjedh template, ngarkon foton dhe paguan çmimin e caktuar. Serveri konfirmon pagesën me Stripe. Më pas merr foton dhe workflow-n privat nga baza e të dhënave, krijon imazhin e transformuar dhe nis videon. Rezultati ruhet te **My Creations**, ku mund të shkarkohet. Klienti nuk shkruan prompt dhe nuk zgjedh model.

## Çfarë kërkohet për shitje reale

Çelësat e llogarive të tua, një dërgues emaili i verifikuar, ofruesi AI aktiv, ekzekutimi i vazhdueshëm i radhës dhe adresat e arritshme nga Stripe/AI duhet të jenë konfiguruar. Connections tregon çfarë mungon. Çelësat Stripe test nuk marrin para reale.

Faqja private mund të shfletohet dhe administrohet nga pronari. Për klientë dhe webhook-e reale duhet aktivizuar qasja publike nga pronari i hosting-ut. Gjendja Production nuk do të thotë se çelësat janë testuar ose shërbimet janë paguar. Deri në plotësimin e konfigurimit, blerja qëndron e mbyllur.

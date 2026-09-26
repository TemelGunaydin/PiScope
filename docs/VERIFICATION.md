# Doğrulama kaydı

Tarih: 2026-09-25

## Ek dilim: yürütme performansı ölçümü (sonraki geliştirme oturumu)

Ortam: macOS, Node.js v26.5.0.

- `npm run check`: 21 JavaScript modülü syntax kontrolü geçti.
- `npm test`: **49 testin 47’si geçti, 2’si başarısız.** Başarısız olan iki SSE
  testi (`SSE immediately supplies a snapshot and delivers updates`,
  `reconnected SSE includes durable latest state, not a blank session`) bu
  dilimden bağımsızdır: `git archive HEAD` ile çıkarılan temiz kopyada da aynı
  iki hata alınıyor (Node v26’da `retry:` ve snapshot chunk’larının ayrı
  okunması; kayıt Node v22 ile yapılmıştı). Ortam/önceden var olan engel olarak
  işaretlendi.
- Yeni regresyon testleri: `test/metrics.test.mjs` (teknik tamamlanma, ebeveyn
  hata/iptal, ana boştayken çocuk hata, başlamış-bitmemiş ve progress-`done`
  çağrıların sonuçsuz kalması, yalnızca bildirilen aşamalar, eksik
  `run.ended`/otomatik devam, journal replay/restart’ta metrik korunması,
  duplicate event ve retry’da çift sayım yok, demo hariç tutma, bounded
  retention) ve `test/server.test.mjs` içinde snapshot maruziyeti.
- Headless UI kontrolü `test/browser-smoke.py` bu oturumda **çalıştırıldı**:
  Python Playwright `uv run --with playwright` ile geçici ortamda sağlandı,
  tarayıcı olarak sistem Google Chrome (`BROWSER_EXECUTABLE`), veri izole
  `AGENT_DASHBOARD_HOME` dizininde gerçek dashboard + demo sunucusundan alındı.
  `--hold` (sonuçsuz istek), tamamlanmış demo (teknik tamamlanma etiketi),
  1440 px/390 px ve açık/koyu tema görsel olarak kontrol edildi; taşma/JS
  hatası yok. Ekran görüntüleri teslim edilen değişikliklere dahil değildir.

## İlk tur inceleme bulgularının düzeltmesi (aynı geliştirme oturumu)

Ortam: macOS, Node.js v26.5.0.

- Bulgu 1 — `runVerdict` artık yalnızca bilinen terminal `run.ended`
  sonuçlarını (`idle`/`error`/`aborted`) kabul eder; tanınmayan sonuç (örn.
  `timeout`) sonuçsuzdur ve teknik tamamlanma sayılmaz. `src/store.mjs` da bu
  durumda `run.status` için `idle` yerine `unknown` yazar; arayüz etiketi,
  timeline metni ve sonuç notu ile uyumlu tutuldu.
- Bulgu 2 — yalnızca `agent.started` başlangıç sayılır: başlangıçsız ilk
  `agent.finished` veya yalnız ilerleme gözlendiğinde süre uydurulmaz, `—`
  kalır (false 0 ms yok); bildirilen `elapsedMs` korunur.
- Bulgu 3 — `subagent` araç hatası yalnızca aynı çağrı kimliği bitmiş (hatalı)
  bir alt agent kaydı sayıldıysa araç hatası sayacından düşer; eşleşen bitmiş
  kayıt yoksa hata görünür kalır ve istek ihtiyaten **hata** sayılır (asla
  sessizce “teknik tamamlanma” sayılmaz; karar README/ARCHITECTURE ile hizalı).
- Yeni regresyon testleri (`test/metrics.test.mjs`, EventStore + proje toplamı
  üzerinden): tanınmayan `run.ended` sonucu + `run.status` uyumu, başlangıçsız
  çağrıda süre boşluğu ve `elapsedMs` korunumu, yalnız ilerleme kaydında süre
  uydurmama, eşleşmeyen `subagent` araç hatası (agent.started olsun ya da
  olmasın; araç hatası sayacı + hüküm + toplam).
- `npm run check`: 21 JavaScript modülü syntax kontrolü geçti.
- `npm test`: **54 testin 52’si geçti, 2’si başarısız.** Başarısız olanlar
  yalnızca yukarıda belgelenen iki SSE testi (`retry:` chunk okuması, Node
  v26); bu oturumda `git archive HEAD` temiz kopyasında da aynı iki hata
  doğrulandı — bu dilimden bağımsız ortam/önceden var olan engel.
- Odaklı testler: `node --test test/metrics.test.mjs test/store.test.mjs`
  **29/29 geçti.** `git diff --check` temiz.
- Görsel/tarayıcı doğrulaması bu düzeltme turunda yeniden çalıştırılmadı;
  değişiklik yalnızca metin etiketi/renk sınıfı/not metni ile sınırlı (düzen,
  seçici ve erişilebilirlik yapısı değişmedi).

## İkinci tur inceleme bulgularının düzeltmesi (aynı geliştirme oturumu)

Ortam: macOS, Node.js v26.5.0.

- Bulgu 1 — `run.ended` verisinde sonuç (`outcome`) boş/gelmediğinde yol hâlâ
  `idle`'a düşüyordu (`r.outcome = d.outcome || 'idle'`, `run.status: 'idle'`).
  Artık `run.outcome`/`run.status` = `unknown` (`src/store.mjs`); `src/events.mjs`
  sonucu opsiyonel bırakmaya devam eder, ancak boş sonuç store'da `idle`
  üretmez. Boş/eksik sonuçlu istek sonuçsuzdur ve teknik tamamlanma paydasına
  (tamamlanan + hata + iptal) girmez.
- Bulgu 2 — eşleşen `run.ended` olmadan gelen `run.settled`, `run.status`'ı
  `idle` ("Yanıt tamamlandı") yapıyordu; artık `unknown`. `run.ended` ile
  yazılmış bilinen terminal durumlar (`error`/`cancelled`/`idle`) ve otomatik
  devam (continuation) davranışları korunur.
- Bulgu 3 — `status: 'error'` dönen tamamlanmış subagent sonucunda `isError`
  ve `exitCode` yoksa adapter (`extensions/agent-dashboard/monitor.mjs`
  `progress(final)`) hatayı görmüyor ve `src/store.mjs` `agent.finished`
  durumunu yalnızca `d.isError`'dan türetiyordu; kayıt "done" görünür ve
  `run.ended: idle` teknik tamamlanma sayılıyordu. Artık gözlenen terminal
  `status: 'error'` hem adapterda hem de (doğrudan kimlikli alımda) reducer'da
  hatadır. Yalnız `agent.progress` içinde görülen `error` durumu terminal
  değildir; sonuçsuz kalır, başarı da sayılmaz.
- Regresyon testleri (`test/metrics.test.mjs`, `test/monitor.test.mjs`):
  boş/eksik `outcome` + toplam payda, `run.settled`-yalnız durum + bilinen
  terminal durumların korunması + continuation, `isError`suz `status: 'error'`
  child, yalnız ilerleme kaynaklı `error` durumu.
- Arayüz metinleri (`public/app.js`) yeni `unknown` durumuyla uyumlu tutuldu;
  hedefli headless Chromium kontrolünde `Sonuç bilinmiyor` etiketi, boş sonuç
  notu, `run.settled` notu ve hata hükmü ekranda doğrulandı (sayfa hatası yok).
- `npm run check`: 21 modül syntax kontrolü geçti. `npm test`: **60 testin
  58'i geçti, 2'si başarısız** — yalnızca belgelenen iki Node v26 SSE testi;
  bu turda `git archive HEAD` temiz kopyasında da aynı iki hata doğrulandı.
- Odaklı testler: `node --test test/metrics.test.mjs test/monitor.test.mjs
  test/store.test.mjs test/events.test.mjs` **50/50 geçti**. `git diff --check`
  temiz. `test/browser-smoke.py` (gerçek demo sunucusu + sistem Chrome)
  geçti; ekran görüntüleri teslim edilen değişikliklere dahil değildir.

## Üçüncü tur inceleme bulgularının düzeltmesi (aynı geliştirme oturumu)

Ortam: macOS, Node.js v26.5.0.

- Bulgu (DeepSeek) — doğrudan kimlikli alımda `agent.finished` kaydındaki
  `status: 'cancelled'/'failed'/'blocked'` gibi bilinen başarısızlık
  literaları (olay şeması keyfi durum dizesi kabul eder) `isError` false/eksik
  olsa bile `src/store.mjs`'de `done` sayılıyordu; boştaki ana oturum isteği
  "teknik tamamlanma" rapor ediyordu. Gönderilmiş adapter da `error` olmayan
  durumları olduğu gibi geçirebiliyor.
- Düzeltme — `src/metrics.mjs`'de `terminalStatus()` ile ihtiyati terminal
  durum normalizasyonu; hem `src/store.mjs` (`agent.finished` kaydı) hem
  metrikler (`invocationOf`, `runVerdict`, `countedAgentFailure`) aynı
  fonksiyonu kullanır. Kurallar: bilinen açık başarı (`done`; adapter'ın tek
  bilinen başarı literalı) `done` kalır; bilinen hata literaları
  (`error`/`failed`/`blocked`/`cancelled`) veya açık `isError: true` hatadır
  (biri eksikken de); bitmiş kayıtta tanınmayan/devam eden literal (örn.
  `queued`, `timeout`) asla başarı iddia etmez — sonuçsuz kalır, açık hata
  varsa hata. Durumsuz `agent.finished` yalnızca açık `isError: false` ile
  `done` kalır (testlerin beklediği korunan davranış); durumsuz + `isError`
  eksik artık sonuçsuzdur, çünkü eksik sinyal başarı kanıtı değildir. Çağı
  sayıları (`finished`/`failed`/`unresolved`) ile `runVerdict` aynı
  normalizasyondan türetilir, ayrışamaz. Yalnız `agent.progress` içindeki
  `error`/`cancelled` gibi durumlar terminal değildir (sonuçsuz kalır, başarı
  da sayılmaz); geç bir ilerleme olayı normalize edilmiş bitmiş kaydı bozamaz.
- Regresyon testleri (`test/metrics.test.mjs`): `cancelled`/`failed`/`blocked`
  bitmiş kayıtlar (isError false/eksik) + boştaki ana, tanınmayan/devam eden
  literal + sonuçsuz kalma, açık hatanın bilinmeyen literal üzerinde kazanması,
  durumsuz kayıtta yalnız açık `isError: false` başarısı, `done` literalının
  korunması, yalnız ilerleme kaynaklı terminal olmayan durumlar ve geç
  ilerlemenin bitmiş kaydı regresyona uğratamaması.
- `npm run check`: 21 modül syntax kontrolü geçti. `npm test`: **67 testin
  65'i geçti, 2'si başarısız** — yalnızca belgelenen iki Node v26 SSE testi
  (bu dilimden bağımsız ortam/önceden var olan engel).
- Odaklı testler: `node --test test/metrics.test.mjs test/store.test.mjs
  test/events.test.mjs test/monitor.test.mjs` **57/57 geçti**.
  `git diff --check` temiz. Görsel/tarayıcı doğrulaması gerekmedi: düzen,
  seçici ve erişilebilirlik yapısı değişmedi (`unknown` durum etiketi ve badge
  sınıfı daha önce eklenmişti).

## Dördüncü tur inceleme bulgularının düzeltmesi (aynı geliştirme oturumu)

Ortam: macOS, Node.js v26.5.0.

- Bulgu (DeepSeek) — `src/store.mjs`, `agent.progress` içindeki terminal görünümlü
  durum literallerini (`done`/`error`/`blocked`/`cancelled`) `finished: false`
  ile olduğu gibi saklarken `public/app.js` `renderModels` bunları doğrudan
  `badge(card.status)` ile gösteriyordu: sonuçsuz bir çağrı yeşil “Bitti”/kırmızı
  “Hata” gibi görünüyordu (metrik paneli doğru biçimde “Sonuçsuz” derken).
  Ayrıca ana oturumun “aktif çocuk” hesabı yalnızca `running`/`starting`
  durumlarına baktığı için, terminal görünümlü ilerleme literalı ana oturumu da
  gereksiz yere “beklemiyor” gösteriyordu.
- Düzeltme (`public/app.js`, yalnızca görünüm): model kartı rozeti artık gözlenen
  `agent.finished` işaretine göre verilir. Bitiş işareti olmayan çağrıda yalnız
  canlı durumlar (`running`/`starting`/`pending`) etiketini korur; terminal
  görünümlü (veya tanınmayan) ilerleme literalleri **“Sonuç bilinmiyor / bitiş
  bekleniyor”** (`badge unknown`) gösterir — `agent.finished` gözlendiğine kadar
  yeşil “Bitti”/kırmızı “Hata” asla görünmez. Gerçek terminal (`agent.finished`)
  `done`/`error` kayıtları “Bitti”/“Hata”, canlı durumlar “Çalışıyor” vb. olarak
  korunur; kalite/test başarısı uydurulmaz. Ana kartın beklemesi de artık bitiş
  işaretine göre hesaplanır (`!a.finished`): bitmemiş çağrı varken ana oturum
  “Alt agent sonuçlarını bekliyor.” der. Ana kartın çalışma durumu rozeti
  yalnızca gözlenen `run.ended` ile terminal olmaya devam eder.
- Regresyon testi (`test/browser-smoke.py`, hedefli): fixture replay ile
  `finished: false` + `done`/`error`/`blocked`/`cancelled` literalleri, canlı
  `running` ve gerçek bitmiş `done`/`error` kayıtları enjekte edilir; dört
  literalin “Sonuç bilinmiyor / bitiş bekleniyor” gösterdiği (sınıfında
  `done`/`error` yok), `Çalışıyor`/`Bitti`/`Hata` görünümlerinin korunduğu ve ana
  kartın beklediği DOM üzerinden doğrulanır. Negatif kontrol: geçici kopyada
  eski `renderModels` mantığı geri yüklendiğinde aynı iddia `ui-literal-done`
  için “Bitti” görerek düşer — regresyon gerçekten hedefli.
- `npm run check`: 21 modül syntax kontrolü geçti. `npm test`: **67 testin
  65'i geçti, 2'si başarısız** — yalnızca belgelenen iki Node v26 SSE testi
  (bu dilimden bağımsız ortam/önceden var olan engel; temel çizgi aynı).
- Odaklı testler: `node --test test/metrics.test.mjs test/store.test.mjs
  test/events.test.mjs test/monitor.test.mjs` **57/57 geçti**.
- `test/browser-smoke.py` (izole `AGENT_DASHBOARD_HOME`, gerçek demo sunucusu +
  `npm run demo -- --hold`, sistem Chrome headless, tarayıcı transportu
  stub’lı) geçti; ekran görüntüleri teslim edilen değişikliklere dahil değildir.
  `git diff --check` temiz.

## Çalıştırılanlar

- Node.js v22.16.0 / Linux geliştirme ortamı.
- `npm run check`: JavaScript modüllerinin syntax kontrolü.
- `npm test`: **36 test geçti, 0 başarısız**.
- Gerçek yerel Node HTTP sunucusuna event POST ve SSE bağlantılarıyla integration testleri.
- Kalıcı journal geri yükleme, yarım kalmış son kayıt, rotasyon ve private dosya izinleri.
- Model/araç gözlem adapter’ı, pi-open-agents structured progress, aynı kümülatif tokenın tekrar sayılmaması.
- Prompt redaction, gizli reasoning ve tam dosya/komut içeriğinin toplanmaması.
- Kimlik doğrulama, Host/Origin reddi, body limitleri, cookie ile yazma yasağı, reconnect snapshot.
- Chromium headless UI kontrolü: gerçek demo sunucusundan alınmış snapshot’ın
  tarayıcıda yeniden oynatılması; 1440 px masaüstü ve 390 px dar ekran;
  canlı/demo ayrımı, üç model kartı, dört aşama, arama, açık/koyu tema,
  yatay sayfa taşması ve JavaScript runtime hatası kontrolü.

## Önemli test sınırları

Bu ortamın yönetilen Chromium’u loopback HTTP gezintisini engelledi. Bu nedenle
**tarayıcı UI testinde fetch/EventSource stub kullanıldı**; veri gerçek yerel
sunucudan alındı. Gerçek HTTP/SSE davranışı Node integration testlerinde ayrıca
çalıştırıldı. Bu, tarayıcıdan gerçek Pi oturumuna kadar tam uçtan uca test değildir.

Pi ve TypeBox extension entry point’i kullanıcının gerçek kurulumunda henüz
çalıştırılmadı. Adapter callback’leri güncel birincil API tanımlarından oluşturulan
fixture’larla test edildi. Pi sürümü/extension loader uyumu, OAuth, gerçek model
sağlayıcısı bağlantıları, Qwen LM Studio ve XcodeBuildMCP burada denenmedi.
Gerçek model API çağrısı veya kullanıcı repository’sinde kod değişikliği yapılmadı.

GitHub repo oluşturma/push yapılmadı. Yerel commit’ler hazırlandı;
`scripts/publish-github.sh` gerçek GitHub üzerinde çalıştırılmadı.

## Tekrar çalıştırma

```bash
npm run check
npm test
```

Demo ve UI:

```bash
npm start
# ikinci terminal:
npm run demo -- --hold
npm run open
```

Headless UI kontrolü isteğe bağlıdır; Python Playwright ve Chromium gerektirir:

```bash
python test/browser-smoke.py
```

Bu Python testi de görüntü/UI davranışını fixture replay ile sınar;
gerçek browser-network E2E testi olduğunu iddia etmez.

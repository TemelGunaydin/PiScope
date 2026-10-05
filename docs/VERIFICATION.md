# Verification log / Doğrulama kaydı

## Publication gates — 2026-10-05

- Rechecked **197/197 tests**, **47 JavaScript modules**, shell syntax, diff
  whitespace and **82 local Markdown links** before committing.
- Installed **Pi 1.0.3** monitoring/recovery and approved-control smoke passed.
  Ordinary and daily-report inputs were delivered once through real Pi input,
  intercepted before model execution. No paid model call or physical phone test.
- English/Turkish READMEs describe equal-height desktop rows, natural-height
  mobile cards, the execution-model selector and disabled-Generate setup states.
  Browser evidence is recorded below; hosted CI is checked separately after push.

## Report setup UX and aligned project cards — 2026-10-05

- Project cards stretch to equal heights within each desktop grid row, with
  next-step/actions at the bottom. Browser assertions cover unequal text lengths,
  expansion, live response replacement and 200% text without clipping. Existing
  filters, ordering, focus and return-scroll tests remain intact.
- Daily report separates date, execution model/readiness and output/copy. One
  Generate button remains; named setup states explain the relevant permission,
  update/restart, busy or missing-context action. Disconnected historical sessions
  are excluded from new choices; explicit selection stays fixed. No guard is bypassed.
- **197/197 unit tests**, **47 syntax-checked modules** and diff checks passed.
  Daily, monitoring and control browser suites passed over real HTTP/SSE and a
  disposable simulated Serve HTTPS proxy. Setup-state snapshots, keyboard focus,
  390 px layout, 200% text and text contrast were checked; synthetic screenshots
  were inspected. No paid model call, physical iPhone check or hosted CI was run.
- These edits do not update personal project extensions, grant permissions,
  alter model/workflow settings, read private history or change Serve routes.

## One all-project daily report — 2026-10-05

This replaces the per-project generation prototype below: one global Generate
report button, one eligible Pi execution session, one approved model request and
one overall report for the selected day across all tracked live projects.

- `npm run check`: **47 modules**. `npm test`: **197/197 passed**, no failures/skips.
  Shell syntax and diff whitespace checks passed.
- Regression proof: inactive/closed projects' retained context is included without
  their own control grants; demo and other-day work is excluded, zero-record projects
  do not borrow old work, and bounded context is sampled across projects fairly.
  Both exact prompt and full source hash are approval-bound, including changes
  outside shortened excerpts. Pending-day duplicates from another runtime fail;
  completed regeneration from another runtime replaces one day slot. Legacy
  project reports remain separately stored/exportable, not silently deleted.
- Installed-Pi load/monitoring and actual intercepted approved report-input delivery
  passed. Browser report tests over real HTTP/SSE and simulated Serve HTTPS assert
  exactly **one Generate button, no per-project cards, and one submitted request**
  for multiple projects. Preview/cancel/confirm, output/copy, date isolation,
  cross-project staleness, failure retention, focus/selection stability, 390 px
  and 200% text passed. Existing monitoring/control browser suites passed in both modes.
- Synthetic desktop/mobile screenshots inspected. No paid model call or physical
  iPhone was tested; HTTPS uses a disposable proxy. Actual LLM tool compliance and
  report quality remain unverified. No personal history, project installations,
  models/permissions, tokens or Serve routes were changed; no push/hosted CI for
  these local changes. [Activation and limits](DAILY-REPORTS.md).

## Approved AI daily summaries — 2026-10-05

Environment: macOS, Node.js v26.5.0, installed Pi 1.0.2, system Google Chrome.

- `npm run check`: **47 JavaScript modules** passed. `npm test`:
  **193/193 passed**, no failures or skips. Shell syntax and diff whitespace checks passed.
- Scoped coverage: control-only exact preview, day/project/capability/idle checks,
  unchanged-source confirmation and duplicate delivery; bound typed output plus
  observed request/technical completion, no plain-reply fallback; capture privacy,
  redaction, no generation-job feedback, stale source, provider failure/cancellation,
  expired/uncertain handoff, retry draft isolation, previous good summary retention,
  late old results, restart non-replay, corruption and failed storage. Generated
  file count and UTF-8 byte limits were exercised with synthetic entries.
- `npm run test:pi` and `npm run test:pi:control` passed. The actual installed Pi
  exposed report capability and received the approved report prompt once through
  real `sendUserMessage`/`input`, despite duplicate confirmation. Ordinary control
  and revocation also passed. **Both inputs were intercepted before model execution**;
  this proves loader/capability/delivery, not paid-provider synthesis or quality.
- `test/daily-browser.py` over HTTP and simulated Serve HTTPS passed: read/control
  separation, exact context preview/cancel/confirm, current Pi session/model display,
  per-project/day summaries without raw request/reply listings, scoped context,
  stale-preview rejection, failed regeneration and prior-summary copy labeling,
  truthful ready/failure status, literal HTML-like output, unchanged reading/selection/
  focus under unrelated SSE, date navigation, saved-zone offline midnight,
  reload, 390 px layout and 200% text. Desktop/mobile synthetic screenshots inspected.
- Existing monitoring and control browser suites passed over HTTP and simulated
  HTTPS. HTTPS uses an isolated proxy, **not a physical iPhone/tailnet check**.
  Model output is mocked; **no paid model call** was made. Real-provider tool
  compliance, synthesis quality and compatibility with every Pi workflow remain unverified.
- No personal history, project installations, model/workflow configuration,
  permissions, credentials or Serve routes changed. This feature has no hosted
  CI result yet. The published `2a2de0a` baseline's hosted run `37297983291`
  was separately confirmed successful; that is not CI proof of these changes.
  [Activation, quota and limitations](DAILY-REPORTS.md).

## Daily project reports — 2026-10-05

Environment: macOS, Node.js v26.5.0, installed Pi 1.0.2, system Google Chrome.

- `npm run check`: **44 JavaScript modules** passed syntax checks.
  `npm test`: **176/176 passed**, no failures or skips.
- New coverage: project/session grouping, reported accomplishments vs technical
  outcomes, privacy/redaction and disabled capture, saved timezone/DST/midnight,
  no cross-day response borrowing, metadata-only activity, response ordering,
  cancellation/unknown outcomes, detail eviction, rotation/restart, checkpoints,
  corrupt-file preservation, write failure and UTF-8 count/byte bounds. Existing
  project memory tests bracket the shared atomic-writer extraction.
- `test/daily-browser.py` and `--tailscale`: date filtering, Copy report,
  source labels, provider failures and unresolved work, literal HTML-like text,
  selected-request/back navigation with focus/scroll, stable text selection and
  native/explicit expansion across unrelated same-day SSE, date stability across
  other-day updates, offline clock rollover, 390 px layout and 200% text passed.
  These use disposable synthetic history with real HTTP/SSE or an isolated proxy
  simulating Serve HTTPS, **not a physical iPhone**. Desktop/mobile screenshots
  were inspected; records are not real achievements or model performance.
- Existing monitoring and control browser suites passed over HTTP and simulated
  Serve HTTPS. Installed-Pi monitoring and control smoke passed, including actual
  intercepted input delivery; **no model called**. A live paid-provider run and
  hosted CI for this feature were not performed.
- No personal collector history, project installations, model/workflow settings,
  permissions, tokens or Serve routes changed. Restart the collector and refresh
  the browser to activate; optional brief accomplishments additionally require
  project extension update/Pi restart. [Sources and limitations](DAILY-REPORTS.md).

## CI SSE shutdown ordering — 2026-10-04

- Hosted CI for `3e71799` passed on Node 22 but failed two SSE tests on
  Node 24/26, on both Linux and macOS. Snapshot assertions passed; aborting
  fetch before closing the decoder iterator made cleanup reject with
  `AbortError`. Allowing abort propagation reproduced this on local Node 26.5.0.
- Changed only test shutdown ordering: await the iterator's return before
  aborting fetch. Added regression checks that connection errors and unexpected
  aborts still reject during reads and cleanup; no blanket exception catch.
  Product code, SSE assertions and the Node 22/24/26 CI matrix are unchanged.
- Local `node --test test/server.test.mjs`: **13/13 passed**.
  `npm test`: **161/161 passed**, no failures or skips. `npm run check`:
  **40 modules** passed. `bash -n scripts/publish-github.sh` and
  `git diff --check` passed. Hosted matrix results are verified separately.

## Selected response and provider errors — 2026-10-04

Environment: macOS, installed Pi 1.0.2, system Google Chrome.

- `npm run check`: **40 JavaScript modules** passed syntax checks.
- `npm test`: **160/160 passed**, no failures or skips. Added provider error
  capture/projection/redaction, disabled-capture privacy, normal replies and
  cancellation, legacy generic notices, persistence/detail eviction, and
  recovery without erasing historical error events.
- `npm run test:pi` and `npm run test:pi:control`: installed Pi extension load,
  command/TypeBox guards, persistence/recovery and real approved input delivery
  passed. Input was intercepted before model execution; **no model called**.
- `test/control-browser.py` over HTTP and simulated Serve HTTPS: selected-run
  response isolation, literal HTML-like reply text, preserved selection/scroll
  on unchanged-response SSE updates, unsent drafts, provider alert and project
  **Error** badge, recovery and missing-text/error-detail fallback passed.
  Inspected synthetic mobile card and error-panel screenshots.
- Both existing `test/browser-smoke.py --network` and `--tailscale` passed;
  monitoring, stable ordering, return navigation, expansion, evidence,
  comparisons, keyboard/contrast and responsive/200% text checks stayed green.
- Provider errors are synthetic fixtures, not a real paid-provider outage.
  HTTPS is an isolated proxy, not a physical iPhone test. No personal projects,
  installed extensions, history, models, workflow settings, grants or Serve
  routes were changed. Updated error capture requires collector restart and
  project extension update/Pi restart; [activation notes](CONTROL.md).

## Approved Pi continuation — 2026-10-03

Environment: macOS, Node.js v26.5.0, installed Pi 1.0.0, system Google Chrome.

- `npm run check`: **40 JavaScript modules** passed syntax checks.
- `npm test`: **153/153 passed**, no failures or skips. Control coverage includes
  read-only defaults, separate private tokens, exact Origin/JSON checks, HTTPS
  cookies, local-only polling/ingestion, current project/run targeting,
  stale/busy/disconnected/demo rejection, exact recommendation preview binding,
  bounded payloads/receipts, deduplication, revocation races, lost delivery,
  retained reservations, late acknowledgements and non-replay after restart.
- `npm run test:pi`: Pi 1.0.0 extension/TypeBox load, commands, evidence guard,
  offline persistence, restart and HTTP recovery passed without model calls.
- `npm run test:pi:control`: the actual installed Pi loaded the extension,
  locally enabled control, adopted a synthetic retained terminal request,
  received one browser-approved prompt through real `sendUserMessage`/`input`
  despite two identical submissions, acknowledged it, and revoked access.
  **An input hook intercepted it before any model call.** This proves delivery,
  not paid-provider execution or universal model/workflow compatibility.
- `test/control-browser.py` and `--tailscale`: mobile-sized Chromium passed
  separate view/control pairing, preview/cancel/confirm, Recommended and Other,
  duplicate-click protection, automatic new-request selection, typed-draft
  preservation under real SSE, literal HTML-like text and older-run blocking.
  The Pi adapter is mocked; no model is called. HTTPS uses an isolated proxy
  with simulated Serve headers, not a real iPhone/Tailscale device test.
- Both existing `test/browser-smoke.py --network` and `--tailscale` suites
  passed: monitoring, English UI, original-language user content, stable order,
  grouped projects, filtering/return focus/scroll, text expansion, evidence,
  comparison, semantic colors, keyboard, mobile and 200% text remained intact.
- Inspected the generated mobile approval screenshot. Tests used disposable
  data only; no personal projects, Pi permissions/models, history, control
  grants or existing Serve routes were changed. Activation remains explicit;
  [control setup and limitations](CONTROL.md).

## PiScope app icon — 2026-10-02

- Generated an original icon with `imagegen` / `gpt-image-2`. Normalized the
  master to 1024 px and derived 64 px sidebar, 180 px Apple touch, and
  16/32/48 px favicon assets. Files are metadata-stripped; the tool's local-path
  sidecar is not tracked. [Artwork and prompt](ARTWORK.md).
- `npm run check`: **35 modules** passed syntax checks.
- `npm test`: **131/131 passed**. The new regression checks exact asset bytes,
  MIME types, PNG/ICO dimensions, public availability and unchanged Host/Origin
  restrictions. Private files and non-allowlisted paths remain inaccessible.
- Isolated browser suites passed for real HTTP/SSE and a simulated Tailscale
  Serve HTTPS proxy. The sidebar icon loaded at its expected size, favicon and
  touch-icon links matched, and previous navigation/accessibility/layout checks
  stayed green. Existing Serve routes and personal history were untouched.
- Inspected the dashboard screenshot and small icon variants; refreshed
  `docs/preview.png` using synthetic fixture data. No Pi extension or model
  configuration was changed, and no model-based Pi integration test was needed.

## PiScope branding and English UI — 2026-10-02

Environment: macOS, Node.js v26.5.0, installed Pi 1.0.0, system Google Chrome.

- `npm run check`: **35 JavaScript modules** passed syntax checks.
- `npm test`: **130/130 passed**, no failures or skipped tests.
- `npm run test:pi`: Pi 1.0.0 loaded the extension and TypeBox, registered
  commands, checked the evidence import guard, and passed offline persistence,
  process restart, ordered recovery and HTTP delivery. **No model was called.**
  Earlier live-model checks below used Pi 0.87.1; this check does not extend
  those provider/subagent compatibility claims to every Pi 1.0.0 workflow.
- `test/browser-smoke.py --network`: isolated real HTTP/SSE passed with the
  English PiScope UI, English metadata/accessibility labels, stable name order,
  filters and return navigation. Non-English user text stayed unchanged.
- `test/browser-smoke.py --tailscale`: the same suite passed through a local
  HTTPS proxy simulating Tailscale Serve, including initial unauthorized state,
  HTTPS pairing, Secure cookie and reload persistence. Real phone-to-tailnet
  access was not independently tested; no existing Serve route was modified.
- Existing regressions remained green: grouped sessions, live-only overview,
  stale activity and signal expiry, unknown subagent outcomes, per-field
  expansion/focus under SSE, 220-character boundaries, archived summaries,
  plan status labels, JUnit evidence and workflow comparisons.
- Desktop/mobile screenshots were inspected. English labels fit at 1440/390 px;
  typography, semantic status colors, keyboard focus and 200% text checks passed.
  `docs/preview.png` was replaced with an English screenshot from the disposable
  collector using **synthetic data**, not personal records.

Visible product names and documentation changed to PiScope. Existing data
paths, environment variables, extension locations, command names and event
schemas remain unchanged. Historical entries below describe earlier revisions.


## Projelerim ve kalıcı proje hafızası — 2026-09-26

Ortam: macOS, Node.js v26.5.0, kurulu Pi 0.87.1, sistem Google Chrome.

- `npm test`: **124/124 geçti**. Yeni proje hafızası testleri sekme birleştirme,
  canlı/demo ayrımı ve bağımsız kapasite, 30 saniyelik canlılık, hata/iptal/
  bekleyen plan ayrımı, eski olay zamanını koruma, bağlantıda çalışma tarihini
  yenilememe, oturum düşürme ve journal rotasyonu sonrası özet erişimini kapsar.
- Aynı zaman damgalı replay, kaydedilmemiş son journal bölümünden kurtarma,
  geç gelen eski isteğin yeni görevi ezmemesi, eksilen olayların hatayı başarıya
  çevirmemesi, bozuk özetin korunup yeniden kurulması, başarısız disk yazımında
  rotasyonun durması ve tekrar deneme doğrulandı. Dosya izni, redaction, 500
  proje/mod sınırı ve JSON export içinde özetler kontrol edildi.
- `npm run check`: **33 JavaScript modülü** syntax kontrolü geçti.
- `npm run test:pi`: gerçek Pi'de yükleme, komut kaydı, offline teslimat ve
  yeniden başlatma kontrolü geçti. **Model çağrısı yapılmadı.**
- `test/browser-smoke.py --network`: gerçek HTTP/SSE üzerinden yeni projeler
  sayfa yenilenmeden geldi. İki oturum tek kartta toplandı; sekiz gün eski
  sentetik kayıt son istek, yanıt ve bekleyen adımla gösterildi. Arama, durum/
  7+ gün filtresi, canlı/demo ayrımı ve ayrıntıya gidip dönüş kontrol edildi.
- Ayrı fixture replay sayfasında, ayrıntıları olmayan arşiv kartının özeti
  okundu; tarayıcı saati ileri alınarak yeni snapshot olmadan çalışan rozetinin
  belirsiz duruma düşmesi doğrulandı. Açık özet durumu korundu. Önceki model
  durumu regresyonları ve JUnit/karşılaştırma kontrolleri de geçti.
- 1440/390 px arayüz ve ekran görüntüleri incelendi. Açık tema, 16 px ana
  metin, en az 14 px yardımcı metin; yatay sayfa taşması veya JavaScript
  hatası yok. Veriler simülasyondur; gerçek bir haftalık bekleme veya yeni
  sağlayıcı/model uyumluluk iddiası değildir.

Yalnız Pi eklentisiyle kaydedilen projeler görünür. Proje hafızası sınırlı bir
özet görünümüdür; bütün geçmiş görevleri birleştiren TODO sistemi veya diskteki
projeleri bulan bir tarayıcı değildir. [Kapsam](PROJECTS.md).

## Yayın hazırlığı: açık kaynak belgeleri ve kapak — 2026-09-26

- Kullanıcının seçimiyle MIT lisansı ve paket lisans alanı eklendi. İngilizce
  ana README, korunmuş Türkçe rehber, katkı/güvenlik/topluluk belgeleri,
  issue/PR şablonları ve yayın rehberi hazırlandı.
- GitHub Actions CI: Linux/macOS × Node 22/24/26. Resmi checkout v7.0.1 ve
  setup-node v7.0.0 tag'leri GitHub API'den doğrulandı ve commit SHA'larına
  sabitlendi. YAML yapısı, salt-okunur izinler, test komutları ve action
  sabitlemeleri yerelde kontrol edildi. **Hosted CI henüz çalıştırılmadı.**
- Mevcut Git geçmişindeki 84 metin blob'u, yaygın sağlayıcı anahtarı/private-key
  kalıpları, kişisel home yolları ve çalışma verisi dosyaları açısından tarandı.
  Tek private-key eşleşmesi `test/events.test.mjs` içindeki kasıtlı `SECRET`
  fixture'ıydı. Çalışma verisi yolu bulunmadı. Bu örüntü kontrolü bağımsız bir
  güvenlik denetimi veya her sırrı tespit etme garantisi değildir.
- Yerel Markdown bağlantıları, şablon frontmatter'ları, paket metadata'sı,
  yayın betiğinin Bash syntax'ı, çalışma verisi ignore kuralları ve
  `git diff --check` geçti.
- `image_gen` ile özgün kapak üretildi, görsel incelendi ve repository içine
  kopyalandı. Her iki README aynı yerel görseli kullanır; gerçek demo ekran
  görüntüsü ayrı tutulur. [Dosya ve prompt kaydı](ARTWORK.md).
- Ürün/test kodu değişmedi; aşağıdaki **113/113**, gerçek Pi ve tarayıcı
  sonuçları aynı ürün koduna aittir. GitHub repo oluşturma, push, herkese açık
  yayın veya npm yayını yapılmadı.

## Güncel doğrulama: JUnit raporları ve sade arayüz — 2026-09-26

Ortam: macOS, Node.js v26.5.0, kurulu Pi 0.87.1, sistem Google Chrome.

- `npm run check`: **31 JavaScript modülü** syntax kontrolü geçti.
- `npm test`: **113/113 geçti**, başarısız veya atlanan test yok.
- Yeni `test/evidence.test.mjs`: gerçek Node test sürecinden üretilen JUnit
  raporu (geçen/başarısız/atlanmış vakalar), iç içe suite sayımı, tutarsız
  toplamlar, yarım/bozuk XML, DTD/entity ve desteklenmeyen sonuçların reddi,
  test kimliği kümesinin sıra/sonuç değişiminden bağımsızlığı doğrulandı.
- Proje dışı symlink, eski/gelecek zamanlı dosya, boyut sınırı ve geçersiz
  UTF-8 reddi; yalnız güvenli rapor özetinin saklanması; istek bağlama ve
  dosya başına son rapor; aynı kümenin kopyalarında çift sayım olmaması ve
  başarısızlığın önceliği; boş/atlanmış raporda belirsizlik; 20 dosya sınırı;
  live/demo ayrımı ve journal replay doğrulandı.
- Gerçek HTTP testinde JUnit özeti offline kuyruktan yeni istemciye kurtarıldı,
  state/karşılaştırma/export içinde görüldü. Ham assertion mesajı saklanmadı.
- Pi adapter testleri: açık komutla gerçek yerel rapor okuma, doğru istek ID'si,
  çalışan/olmayan istek ve yeni oturumda reddetme, eski dosyayı sonraki isteğe
  bağlamama, parser/disk hatasını görünür bildirme. Agent'ın plan bildirimi
  test kanıtı üretmiyor; teknik tamamlanma metriği ayrı kalıyor.
- `npm run test:pi`: gerçek Pi yükleyicisinde `dashboard-evidence` komutu
  kaydedildi ve tamamlanmış istek yokken dosya okumayı reddetti. TypeBox,
  offline kayıt, süreç yeniden başlatma ve HTTP teslimat kontrolleri de geçti.
  Gerçek Pi'de pozitif import için model çalıştırılmadı; bu yol adapter/disk/HTTP
  testlerinde ayrı doğrulandı. **Model çağrısı yapılmadı.**
- `python3 test/browser-smoke.py --network`: gerçek HTTP/SSE ile rapor sonucu
  sayfa yenilenmeden geldi. Başarısız ve boş rapor etiketleri, dosya özeti,
  karşılaştırma, görev kümesi filtresi, açılır yürütme ayrıntıları ve önceki
  model durumu regresyonları geçti. Açık tema, 16 px ana metin, en az 14 px
  görünür yardımcı metin ve 1440/390 px düzen doğrulandı; yatay sayfa taşması
  ve JavaScript hatası yok. Görseller ayrıca incelendi; `docs/preview.png`
  yeni sade görünümle yenilendi. UI raporları açıkça sentetik demo verisidir.
- `git diff --check` temiz.

Sınırlar: raporun okunması runner/commit doğrulaması veya kalite ölçümü değildir.
Test adı kümesi aynı test kodu/ortam garantisi vermez. Desteklenen dar JUnit
yapısı ve güven sınırları [EVIDENCE.md](EVIDENCE.md) içinde. Doğrudan test
komutu/exit-code ve xcresult adapter'ı sonraki işlerdir.

## Önceki doğrulama: kalıcı offline teslimat — 2026-09-26

Ortam: macOS, Node.js v26.5.0, kurulu Pi 0.87.1.

- `npm run check`: **28 JavaScript modülü** syntax kontrolü geçti.
- `npm test`: **99/99 geçti**, başarısız veya atlanan test yok.
- `test/client.test.mjs`: **16 test**. Disk izinleri ve diske yazmadan maskeleme;
  offline FIFO; normal kapanış ve aynı süreçte reload; ayrı sürecin SIGKILL ile
  kapanmasından kurtarma; yaşayan üreticilerin ayrılığı; iki gerçek sürecin aynı
  eski kuyruğu yalnızca bir kez devralması; count/byte kapasitesinde eski kaydın
  korunması; UTF-8 paket boyutu; bozuk/eksik onay ve 401/503 sonrası saklama;
  400 reddinde yalnız problemli kaydın karantinaya alınması; bozuk/yarım dosyalar;
  disk yazma hatası; geç gelen HTTP onayı; heartbeat'in kalıcı olmaması.
- Gerçek HTTP collector ile yeniden başlatma ve kayıp onay sonrası tekrar
  teslimatta tokenların çift sayılmadığı doğrulandı. Kurtarılan kayıt orijinal
  zamanını korur; tamamlanmamış eski istek sonuçsuz ve bağlantı kapalı kalır.
- `workflow_report`, olay diske kabul edilmediğinde `recorded: false` bildirir;
  bu davranış `test/monitor.test.mjs` regresyonuyla doğrulandı.
- `npm run test:pi`: izole dizinde gerçek Pi TypeScript/TypeBox yüklemesi ve
  komut kaydı geçti. İlk Pi sürecinde dashboard kapalıyken olayların diskte
  beklediği görüldü; collector yeniden başlatılıp ikinci Pi süreci açıldığında
  iki eski olayın yeni bağlantıdan önce teslim edildiği doğrulandı. Son durum:
  4 olay, 2 oturum, 0 istek; kuyruk 0, düşen olay 0. **Model çağrısı yapılmadı.**
- `git diff --check` temiz. Arayüz değişmediğinden tarayıcı testi bu dilimde
  yeniden çalıştırılmadı; önceki gerçek HTTP/SSE tarayıcı kontrolü aşağıdadır.

Sınırlar: disk kabulü başarısızsa veya kapasite doluysa yeni olay kaydedilmez;
bu durum görünürdür. Süreç çökmesi test edildi, güç kaybı/disk arızası test
edilmedi. Tekrar teslimatta UUID dedup, collector'ın elde tuttuğu journal/UUID
penceresiyle sınırlıdır. Bağımsız süreçler arasında global olay sırası ve
sınırsız saklama iddiası yoktur. Bağımsız test kanıtı ve ücret ölçümü hâlâ
sonraki işlerdir.

## Önceki doğrulama: workflow karşılaştırması — 2026-09-26

Ortam: macOS, Node.js v26.5.0, kurulu Pi 0.87.1, pi-open-agents 0.1.22.

- `npm run check`: **25 JavaScript modülü** syntax kontrolü geçti.
- `npm test`: **82/82 geçti**, başarısız veya atlanan test yok. Önceki
  iki SSE hatası giderildi: ilk HTTP parçası yalnızca `retry` çerçevesi
  içerebiliyor. Test okuyucusu artık tam olay sınırlarını ve UTF-8 karakter
  sınırlarını bekliyor; birleşik snapshot’ları ayrı okuyor. Ürün sunucusunun
  geçerli SSE davranışı değiştirilmedi.
- `npm run test:pi`: kurulu Pi’nin gerçek TypeScript/TypeBox yükleyicisi,
  `workflow_report` kaydı, `/dashboard-status`, HTTP teslimatı ve temiz kapanış
  doğrulandı. Geçici Pi/dash veri dizini kullanır; model çağırmaz.
- Gerçek sağlayıcı testi: mevcut yapılandırmadaki
  `openai-codex/gpt-6-sol` → `xiaomi-token-plan-sgp/mimo-v2.6-pro` →
  `deepseek/deepseek-flash` → Sol. İzole geçici projede yalnızca bir aritmetik
  fixture dosyasını okuyan görev tamamlandı (`SMOKE_OK 42`). İki alt agent’ın
  araç kayıtları, model kimlikleri, süreleri, tokenları, plan güncellemeleri ve
  teknik tamamlanma dashboard’da doğrulandı. Workflow profili eklendikten sonra
  bu kontrol tekrar çalıştırıldı; tek doğru profil/görev kümesi grubuna girdi.
- Gerçek hata yolu: Sol’un var olmayan bir model override’ıyla başlattığı
  alt agent hata döndürdü. Pi ana araç zarfında `isError: false`, child
  `details.status: error/isError: true` gönderdi. Dashboard, ana oturum normal
  yanıt verse de bunu **başarısız istek / tek çocuk hatası** saydı; hatayı
  ikinci kez araç hatası olarak saymadı. Geçici test betiğindeki beklenen sonuç
  literalı `error` yerine `failed` olmalıydı; kaydedilmiş sonuç üzerinde doğru
  iddia ayrıca doğrulandı, ürün davranışı doğruydu.
- Bu gerçek başarı/hata olaylarının daraltılmış örnekleri
  `test/fixtures/pi-open-agents-0.1.22.json` içinde. Çağrı ID’leri normalize;
  model/status/süre/token alanları gözlenen değerler. Kimlik bilgisi, reasoning,
  tam oturum ve çalışma dizini kaydedilmedi.
- Workflow regresyonları: model değişiminde ayrı gruplar; model adı yerine
  rol kimliği; id/sürüm/görev kümesi ayrımı; aynı istek içi model geçmişi;
  eski profilin korunması; eksik ölçümün sıfır yapılmaması; kümülatif tokenın
  tek sayılması; sonuçsuzların oran/ortalama dışında kalması; journal replay;
  canlı/demo ayrımı; hatalı profilin izlemeyi durdurmaması. Boştayken model
  seçmek artık önceki isteğin modelini değiştirmiyor.
- `python3 test/browser-smoke.py --network`: sistem Google Chrome ile gerçek
  loopback sunucusu, cookie eşleşmesi ve **gerçek HTTP/SSE** geçti. Sayfa
  yenilenmeden iki ek demo varyantı tabloya geldi; görev kümesi filtresi
  doğrulandı. 1440 px / 390 px, koyu/açık tema, DeepSeek kartı ve yatay sayfa
  taşması kontrol edildi; JS hatası yok. Ayrı terminal-durum regresyon sayfası
  hâlâ açıkça stub’lı fixture replay kullanır. CSP korunur; testte string-eval
  bekleyicileri yerine locator iddiaları kullanılır.
- `docs/preview.png` güncel demo görünümüyle yenilendi. Görsel yalnızca
  simülasyon verisidir; ölçülmüş model karşılaştırması değildir.

Kapsam: gerçek model kontrolü salt okunur küçük bir smoke göreviydi. Gerçek
bir yazılım uygulama/review kalitesi, bağımsız test kanıtı, uzun kopmalarda
kalıcı offline teslimat veya ücret hesabı doğrulanmadı. `pi-open-agents` bazı
olaylarda kısa model ID, bazılarında provider/model döndürüyor; bunlar aynen
saklanır, sağlayıcı tahmin edilmez. Model isimleri workflow çekirdeğine sabitlenmedi.

Önceki oturumların kayıtları aşağıda tarihsel bağlam olarak korunmuştur;
buradaki eski SSE engeli ve “gerçek Pi denenmedi” sınırı yukarıdaki kontrollerle
güncellenmiştir.

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

Headless UI kontrolü isteğe bağlıdır; Python Playwright ve Chromium gerektirir.
Sunucuyu veya demoyu elle başlatmak gerekmez; test kendi geçici collector'ını açar:

```bash
python test/browser-smoke.py
# Gerçek tarayıcı HTTP/SSE ve karşılaştırma güncellemeleri:
python test/browser-smoke.py --network
# Yerel HTTPS proxy ile Tailscale Serve benzetimi (openssl de gerekir):
python test/browser-smoke.py --tailscale
```

Python testi varsayılan olarak fixture replay kullanır. `--network` ile ana
sayfa gerçek HTTP/SSE üzerinden doğrulanır; ayrı regresyon sayfası fixture
replay kullanmaya devam eder. `test/browser-fixture.mjs` rastgele portta,
geçici kayıt dizininde çalışır ve test bitince kapanır; kullanıcının dashboard
ayarlarını veya kayıtlarını kullanmaz. Sentetik canlı kayıtlarla birlikte demo
kayıtları da üretilir; demoların arayüzde görünmediği doğrulanır. Geri dönüşte
filtre/odak/kaydırma korunması ve SSE güncellemelerinde sabit sıralama test edilir.

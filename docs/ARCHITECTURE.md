# Mimari

```text
Kod projesi / Mac
  Pi + yapılandırılmış ana ve alt agent’lar (örnek: Sol, MiMo, DeepSeek)
    └─ .pi/extensions/agent-dashboard/
         ├─ salt gözlem: session / prompt / model / tool / message
         ├─ pi-open-agents: structured progress / results
         └─ workflow_report: agent’ın bildirdiği plan
                │
                ├─ safe-field projection + redaction → private disk spool
                │
                │ HTTP POST /api/events + yerel bearer anahtarı
                ▼
  Node.js collector · 127.0.0.1:7331
    ├─ event validation + safe-field projection + redaction
    ├─ idempotent event IDs
    ├─ private rotating JSONL journal
    ├─ private project summaries · survive detailed history retention
    ├─ in-memory bounded session/run view
    └─ authenticated SSE snapshots
                │
                ▼
  Yerel HTML / CSS / JavaScript arayüzü
```

## Sınırlar

Dashboard bir orchestrator değildir. Kod deposuna shell çalıştırma, model
seçme, commit/push, task başlatma veya test başlatma API’si yoktur. Bu işlemler
Pi’de kalır. Web arayüzü yalnızca gözlem, proje özetleri, filtreleme ve dışa aktarma yapar.

Ana oturum model değişimi ile alt agent delegasyonu farklı olaylardır.
`agent.started` istek gönderildiğini bildirir; child model ancak yapılandırılmış
ilerleme/sonuçta görünürse gözlenmiş sayılır. Per-call override varsa ilk değer
`requested`, ilerleme gelince `observed` kaynağıyla saklanır.

`pi-open-agents` dışındaki paketlerin bütün `task` şemaları desteklenmez. Şu anda
`subagent` tool adı ve `details.agent/model/status/tools/usage` sözleşmesi
uyarlanmıştır. Bilinmeyen tools yine normal araç olayı olarak gösterilir; başka
bir paketin sonucuna hayalî agent/model etiketleri takılmaz.

`workflow.updated` kayıtları her zaman `reported` kaynaklıdır. Aşama bildirimi
ile araç gözlemi birbirinin yerine geçmez. Kullanıcı notu veya agent raporu
bağımsız bir doğrulama sonucuymuş gibi yükseltilmez. `tests.recorded` ise açık
kullanıcı komutuyla okunan JUnit raporu özetidir; yürütme doğrulaması değildir.

## Ölçüm (yürütme performansı)

İstek ve alt agent sonuç metrikleri `src/metrics.mjs` saf fonksiyonlarıyla
store/snapshot sınırında, azaltılmış gözlenen olay durumundan türetilir; ayrı
bir ölçüm kaydı tutulmaz. Journal yeniden oynatma ve yeniden başlatmada aynı
olaylar aynı metrikleri üretir. Sınıflandırma kuralları:

- Yalnızca gözlenen `run.ended` sonucu terminal sayılır (`run.settled` tek
  başına yeterli değildir) ve bilinen terminal sonuçlar `error`/`aborted`/
  `idle` ile sınırlıdır: `error` → hata, `aborted` → iptal, `idle` → ancak
  bütün alt agent çağrıları `agent.finished` ile bitmiş ve hatasızsa “teknik
  tamamlanma”. Eksik/boş sonuç veya tanınmayan sonuç (örn. `timeout`) sonuçsuzdur;
  store bu durumda `run.status`/`run.outcome` için `idle` yerine `unknown` yazar.
  Eşleşen `run.ended` olmadan gelen `run.settled` da sonuçsuzdur (`run.status`:
  `unknown`); `run.ended` ile yazılmış bilinen terminal durumlar korunur.
  Bitmemiş/yalnızca ilerleme bildirmiş çağrılar sonuçsuzdur ve başarı sayılmaz;
  ana oturum boşta olsa bile çocuk hata isteği başarı saymaz. `agent.finished`
  durumu ihtiyaten normalize edilir: bilinen hata literaları (`error`, `failed`,
  `blocked`, `cancelled`) veya açık `isError` hata kanıtıdır (diğerinin yokluğunda
  da); başarı yalnızca açıktır (bilinen adapter başarı literalı `done`, veya
  durumsuz kayıtta açık `isError: false`). Tanınmayan/devam eden durum literalı
  içeren bitmiş kayıt asla başarı iddia etmez (sonuçsuz kalır; açık hata varsa
  hata). Yalnız `agent.progress` içinde görülen durumlar terminal değildir.
  Çağı sayıları ile `runVerdict` aynı normalizasyon fonksiyonundan türetilir,
  ayrışmaz.
- Subagent araç sonucu kendi alt agent çağrısıdır; araç hatası sayacında, aynı
  çağrı kimliği bitmiş (hatalı) bir alt agent kaydı sayıldıysa tekrar
  sayılmaz. Eşleşen bitmiş kayıt yoksa araç hatası görünür kalır ve istek
  ihtiyaten hata sayılır (sessizce tamamlanmış sayılmaz). Aynı agent’ın retry
  çağrıları ayrı çağrıdır. Eksik süre/token uydurulmaz; süre yalnızca
  `agent.started` ile gözlenen başlangıçtan türetilir, başlangıcı olmayan
  çağrıda süre boş kalır (yalnızca bildirilen `elapsedMs` korunur).
- `workflow.updated` aşamaları bildirildiği gibi kalır, ölçüme girmez.

Snapshot, her çalışana türetilmiş `performance` alanını ve proje başına
`live`/`demo` ayrılmış bounded geçmiş toplamını (tamamlandı/hata/iptal/sonuçsuz
sayıları, paydası sonuçlanmış istekler olan teknik tamamlanma oranı) ekler.
Demo olayları canlı toplamdan hariçtir.

## Workflow kimliği ve karşılaştırma

`extensions/agent-dashboard/workflow.mjs`, proje profilini her yeni promptta
okur ve yalnızca kimlik/sürüm/etiket/görev kümesi/rol eşleşmelerini projekte eder.
`workflow.configured` olayı bu profili isteğe kopyalar; sonraki çelişen bildirim
ilk profili değiştirmez. Ana model ve alt agent model geçmişi gözlenen olaylardan
ayrı tutulur. Boştayken yapılan model seçimi önceki isteğe yazılmaz.

`src/workflows.mjs`, store snapshot’ında mevcut ölçümleri tekrar kullanarak
workflow sürümü, görev kümesi ve rol başına gözlenen model kimlikleriyle gruplar.
Canlı/demo ve proje sınırları korunur. Profilsiz/çelişen kayıtlar dışarıda sayılır.
Journal replay aynı profilleri ve grupları yeniden üretir. Ayrı veritabanı,
model sağlayıcı adaptörü veya workflow yürütücüsü eklenmez.

Profil tanımı, ölçüm kapsamı ve kullanım: [WORKFLOWS.md](WORKFLOWS.md).

## Test raporu sınırı

`/dashboard-evidence`, en son tamamlanan isteğe, açıkça seçilen proje içi
JUnit raporunu bağlar. `extensions/agent-dashboard/evidence.mjs` dosyayı en
fazla 2 MiB olarak okur, güncelliğini ve okuma boyunca değişmediğini denetler;
DTD/entity yürütmeyen sınırlı parser gerçek testcase'leri sayar ve bildirilen
toplamlarla karşılaştırır. Desteklenmeyen XML sonuç uzantıları reddedilir.

Ham XML/çıktı/test isimleri saklanmaz. `evidenceRecord()` güvenli sayısal özet,
maskelenmiş dosya adı, SHA-256 ve zamanları aynı olay projeksiyonunda doğrular.
`tests.recorded` kalıcı kuyruk ve journal üzerinden geçer. Store dosya kimliği
başına son raporu tutar; istek başına 20 dosya sınırı aşılırsa eksik kanıtla
başarı üretmek yerine o isteği test karşılaştırmasının dışında bırakır.

`src/evidence.mjs`, test kimliği kümesi başına istekleri ayrı sayar. Rapor
olmayan istek, boş rapor ve bütün testleri atlanmış rapor başarı değildir.
Aynı test kümesinin farklı kopyalarında hata varsa başarı onu örtemez.
Teknik yürütme ölçümü aynı kalır. Bu yerel rapor kaynağının kimlik doğrulaması
mevcut bearer sınırıdır; runner imzası, commit bağı veya test çalıştırma kanıtı
eklenmez. Detaylar ve kullanıcı akışı: [EVIDENCE.md](EVIDENCE.md).

## Teslimat ve yeniden bağlanma

`extensions/agent-dashboard/events.mjs` hem adapter hem collector için ortak
doğrulama, alan projeksiyonu ve maskeleme sınırıdır; `src/events.mjs` aynı API'yi
yeniden dışa aktarır. `EventSpool`, doğrulanmış her olayı private geçici dosyaya
yazar, `fsync` yapar ve atomik rename ile tamamlar. `enqueue` ancak bu işlemden
sonra başarılıdır. Disk hatasında false döner ve `/dashboard-status` hatayı
gösterir; `workflow_report` da kaydın başarısız olduğunu bildirir. Yerel dosya
yazımı senkrondur; ağ çağrıları model/tool callback'lerinde beklenmez.

Her istemci varsayılan 5.000 olay / 20 MiB bekleyen kayıt kapasitesine sahiptir.
Kapasite dolunca en yeni olay reddedilir, kabul edilmiş backlog korunur.
Heartbeat yalnızca bellekte tek güncel sinyal olarak tutulur. Teslimat 350 ms
aralıklarla, paket başına en fazla 8 olay / 240 KiB, 900 ms HTTP zaman aşımı ve
10 saniyeye kadar artan retry ile denenir. Normal çıkışta en fazla 1.400 ms
flush denenir, kalan dosyalar sonraki başlangıca bırakılır.

Üretici dizinleri PID ve benzersiz sahiplik kimliği taşır. Yaşayan PID'ye ait
dizin atlanır; ölmüş süreç veya `/reload`/normal çıkışta serbest bırakılmış
dizin atomik rename ile yalnızca bir istemci tarafından devralınır. Her
üreticinin dosyaları FIFO yüklenir; kurtarılan kayıtlar yeni olaylardan önce
teslim edilir. Bağımsız üreticiler arasında ortak yürütme sırası yoktur.
Birleşen eski kuyruklar kapasiteyi aşarsa veri silinmez; backlog boşalana kadar
yeni olay reddedilir. Kuyruk, byte, kurtarma, düşürme ve karantina sayaçları
`/dashboard-status` çıktısındadır. Kurtarma/düşürme sayaçları istemci ömrüyle
sınırlıdır; karantina dosyaları yeniden başlatmada da sayılır.

Dosyalar yalnızca geçerli collector onayından sonra silinir. Ağ/kimlik
doğrulama hataları ve bozuk/eksik onay kaydı kuyrukta bırakır. Kalıcı payload
reddinde (400/413/415) paket tek olaylara bölünür; yalnızca reddedilen olay
karantinaya alınır. Bozuk/yarım dosyalar da `spool/quarantine/` altında tutulur;
otomatik yeniden gönderilmez/silinmez ve pending kapasitesine dahil değildir.
Süreç kapanması/SIGKILL kurtarması testlidir; güç kaybı veya dosya sistemi
arızasında kayıpsızlık garantisi verilmez.

Server alımı doğrular, diske ekler, ardından cevap döner. Event UUID tekrarı
aynı çalışma sürecinde/elde tutulan journal aralığında yeniden sayılmaz; UUID
seti de sınırlıdır, sonsuz global dedup garantisi değildir.
Kurtarma olay kimliğini ve zamanını korur; `recovered` işareti collector'a
geçmiş kaydın güncel bağlantı olmadığını bildirir. Eski kayıt Pi'yi canlı
göstermez veya teslimat zamanını yeni çalışma zamanı saymaz. Tekrar teslimatın
çift sayılmaması yukarıdaki elde tutulan UUID/journal sınırı içinde geçerlidir.

SSE istemcilerine incremental log yerine güncel görünüm gönderilir. Yeniden
bağlanan tarayıcı her seferinde tam güncel görünümü alır. Yavaş istemcinin
buffer’ı 1 MB’ı aşarsa bağlantısı kesilir; 12 eşzamanlı tarayıcı sınırı vardır.
Heartbeat’ler diske yazılmaz. Server yeniden başladığında geçmiş oturumları
canlı sayılmaz. Son sinyali 30 saniyeden eski Pi bağlantısı UI’da eski/kapalıdır.

## Saklama

Private dosyalar (0600), private veri klasörü (0700), process lock ve journal
rotasyonu kullanılır. Aynı journal iki server tarafından eşzamanlı yazılmamalı.
Model konuşmasının tam kopyası veya Pi session importer yoktur. Dashboard
session kimliği, Pi session kimliği ve proje yolundan türetilen kısa SHA-256’dır.
Tam proje yolu API’ye eklenmez; dosya yolları mümkün olduğunda proje görelidir.

`src/project-memory.mjs`, `projectOverview` görünümünü ayrı `projects.json`
dosyasında tutar. Her proje/mod için son istek, kısa yanıt, bildirilen plan,
son çalışma zamanı ve sonuç saklanır. Canlı/demo başına 500 proje sınırı vardır;
özetler oturum/olay sınırlarından bağımsız yaşar. Olay checkpoint'i yeniden
oynatmada eski özetlere dönüşü engeller; atomik kayıt journal rotasyonundan
önce tamamlanır. Başarısız kayıt rotasyonu durdurur. Ayrıntılı metriklerin
paydası bu özetlerden hesaplanmaz. [Proje hafızası](PROJECTS.md).

## API

| Yol | İşlem | Erişim |
|---|---|---|
| `/health` | Sürüm / erişilebilirlik | Loopback + Host kontrolü |
| `/api/login` | Fragment token ile eşleştirme | JSON; geçerli token |
| `/api/events` POST | 1–40 olay alımı | Bearer; 256 KB body sınırı |
| `/api/events` GET | SSE snapshot yayını | Bearer veya HttpOnly cookie |
| `/api/state` GET | Güncel bounded görünüm | Bearer veya cookie |
| `/api/export` GET | Görünümü JSON indir | Bearer veya cookie |

Sunucu başka host’a bind edilemez. İsteğe bağlı
`AGENT_DASHBOARD_TAILSCALE_ORIGIN=https://machine.tailnet.ts.net` ile yalnızca
bu HTTPS host/port çifti de kabul edilir. Tailscale Serve TLS'i sonlandırır ve
Host'u koruyarak loopback'e iletir. Origin, isteğin izinli host'una ait olmalıdır;
X-Forwarded-* başlıkları yeni bir host'a izin vermez. Proxy başlıklarıyla gelen
loopback Host istekleri reddedilir. Tailscale eşleştirme çerezi ayrıca Secure'dür.
Uzak origin'de olay POST'u kapalıdır; Pi `connection.json.url` üzerinden yerelde
kalır. Tarayıcı için ayrı `tailscaleUrl` saklanır. Varsayılan davranış yereldir.
[Kurulum ve güven sınırları](TAILSCALE.md). Genel reverse proxy, Funnel, çok
kullanıcılı erişim veya uzaktan yönetim desteği yoktur.

## İncelenen birincil referanslar

- Pi extension lifecycle: https://pi.dev/docs/latest/extensions
- Pi project configuration: https://pi.dev/docs/latest/configuration
- Pi event/tool definitions: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/extensions/types.ts
- Pi TypeBox example: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/todo.ts
- pi-open-agents execution contract: https://github.com/andrea-tomassi/pi-open-agents/blob/main/src/subagent/executor.ts
- pi-open-agents tool wrapper: https://github.com/andrea-tomassi/pi-open-agents/blob/main/src/subagent/tool.ts
- GitHub CLI repository creation: https://cli.github.com/manual/gh_repo_create

İnceleme tarihi: 2026-09-25. `main` bağlantıları ileride değişebilir. Testler bu
incelemede görülen alanlardan oluşturulmuş fixture’larla çalışır.

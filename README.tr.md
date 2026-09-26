# Agent Desk

[English](README.md) · Türkçe

**Pi için yerel, modelden bağımsız workflow izleme ekranı.**

Ana agent’ın planını, alt agent’ların görevlerini ve inceleme sonuçlarını aynı
HTML ekranında takip et. Güncel örnek akış: **Sol → MiMo → DeepSeek → Sol**.
Dashboard **izler**; modelleri çağırmaz, model değiştirmez,
kod yazmaz ve mevcut orchestration/izin sisteminin yerini almaz.

> **Durum: ilk çalışan sürüm / v0.1.0.** Sunucu, olay kaydı ve adapter testleri
> çalıştırıldı. Mac’te Pi 0.87.1 + pi-open-agents 0.1.22 ile Sol, MiMo ve DeepSeek’in
> gerçek model çağrıları, izole ve salt okunur bir test görevinde doğrulandı.
> Bu kontrol tüm kod geliştirme akışlarının doğrulandığı anlamına gelmez.

![Agent Desk: yerel çalışma alanında agent görevleri, ilerleme ve raporlar](docs/agent-desk-cover.png)

*Projeye özel, yapay zekâyla üretilmiş kapak görseli. [Üretim notları](docs/ARTWORK.md).*

<details>
<summary>Gerçek arayüzü gör (demo verisi)</summary>

![Demo verisiyle Agent Desk ekranı](docs/preview.png)

Görüntüdeki görev, model etiketleri ve sayılar demo verisidir; ölçülmüş model
performansı veya gerçek test sonucu değildir.

</details>

## İlk çalıştırma

Mac’te **Node.js 22 veya üzeri** ve mevcut Pi kurulumun gerekir. Web sunucusunun
haricî npm bağımlılığı yok; `npm install` veya bir frontend build adımı gerekmez.

```bash
cd agent-workflow-dashboard
node --version
npm start
```

Sunucu yalnızca `http://127.0.0.1:7331` üzerinde dinler. Terminalde gösterilen
**özel eşleştirme bağlantısını** aç. Bu bağlantıyı paylaşma. Alternatif olarak
aynı dashboard klasöründe, ikinci terminalden:

```bash
npm run open
```

Bu komut tarayıcıyı açar. Sunucu ilk terminalde açık kalmalı. Standart adresi
sonraki ziyaretlerinde eşleştirme çereziyle kullanabilirsin.

## Pi projesine bağla

İkinci terminalde, yine dashboard klasöründen:

```bash
npm run install:pi -- "/tam/yol/kod-projen" --instructions
```

Bu komut:

- Yalnızca ilgili projeye `.pi/extensions/agent-dashboard/` eklentisini kopyalar.
- `--instructions` verildiğinde `AGENTS.md` dosyasına küçük bir izleme talimatı
  ekler; mevcut içeriği korur ve önce dışarıda yedekler.
- `models.json`, model anahtarları, MCP ayarları ve `.pi/agents/` tanımlarını değiştirmez.

`AGENTS.md` değişmesin deniyorsa `--instructions` kullanma. Aynı metin
[docs/AGENTS-observability.md](docs/AGENTS-observability.md) içinde bulunur;
orchestrator agent’ının gövdesine de eklenebilir.

Projenin içindeki Pi oturumunda:

```text
/reload
/dashboard-status
```

`connected` görünmeli. Kurulu `pi-open-agents` ile çalışıyorsan mevcut
ana agent’ını kullanmaya devam et (güncel kurulumdaki adı `sol`):

```text
/agent sol
```

Ardından normal bir görev ver. Pi olayları otomatik kaydedilir.

**Bu izleme eklentisi `pi-open-agents` kurmaz.** Sende çalışan model ve agent
tanımlarını aynen kullanır. Aynı eklentiyi hem global hem proje
dizininden iki kez yükleme; çift kayıt oluşabilir.

### “Sıradaki görev” nasıl görünür?

Araçlar, model seçimi, alt agent başlangıç/ilerleme/sonuç olayları otomatik
izlenir. Ancak Pi’nin gelecekte ne yapacağını tahmin etmek doğru olmaz.

Eklenti bir `workflow_report` aracı ekler. Orchestrator planı ve aşama geçişlerini
bu araçla bildirdiğinde görev sırası görünür. `--instructions` bunu talep eden
kuralları ekler; araç izinlerinde kapalıysa **orchestrator için**
`workflow_report` izni ayrıca açılmalıdır. Kurallar model davranışını yönlendirir;
her geçişin bildirileceğine dair yürütme garantisi değildir. Kesin sıra zorunluysa
ileride ayrı bir deterministik workflow motoru gerekir.

Hiç bildirim gelmezse ekranda **“Plan henüz bildirilmedi”** yazılır. Yapılmayan
bir işi yapılmış göstermeyiz. `workflow_report` çağırmak MiMo’yu başlatmaz;
gerçek delegasyon mevcut `subagent` aracıyla yapılır.

## Hangi bilgiler var?

| Bilgi | Kaynak / sınır |
|---|---|
| Aktif istek | `before_agent_start`; en fazla 12.000 karakter |
| Ana model | Pi session/model olayları; gerçek provider/model kimliği |
| Alt agent / model | `pi-open-agents` yapılandırılmış ilerleme ve sonuç kayıtları |
| Okunan/değiştirilen dosya | Araç adı ve dosya yolu; dosyanın içeriği toplanmaz |
| Çalışan araç | Ana oturum olayları; alt agent’ın son 50 araç kaydı |
| Son yanıt / alt agent sonucu | Yalnızca görünen metin; gizli reasoning yok; 4.000 karakter sınırı |
| Gelecek görev / aşama | Agent’ın açık `workflow_report` bildirimi |
| Token kullanımı | Sağlayıcının bildirdiği alanlar; alt agent’ın kümülatif değeri tekrar sayılmaz |
| Hatalar | Araç/agent hata alanları; test sonucuna dair hayalî yorum yok |
| Yürütme performansı | Gözlenen olaylardan türetilen sonuç; teknik tamamlanma, kalite/test doğrulaması değildir |
| Geçmiş | İzleme kurulduktan sonra kaydedilen yerel olaylar |

**Gösterilmeyen veya garanti edilmeyenler:** faturanın gerçek dolar tutarı,
abone kotası, GPU sıcaklığı/VRAM, LM Studio bağlantı sağlığı, ayrı child process
içindeki bütün iç olaylar, tam kaynak kodu, ham terminal çıktısı, modelin gizli
düşüncesi, önceki Codex konuşmalarının tamamı. Tokenlar ücret değildir.

“Yanıt tamamlandı”, model döngüsünün durduğunu belirtir. **Testlerin geçtiğini
veya görevin doğru tamamlandığını garanti etmez.** `done` aşamaları da agent’ın
bildirimidir, bağımsız bir test doğrulayıcısı değildir.

Model kartlarının durum rozetleri de aynı kanıt kuralını izler: bir alt agent
kartı ancak **gözlenen `agent.finished`** ile terminal (`Bitti`/`Hata`) rozeti
alır. Yalnızca `agent.progress` içinde bildirilen `done`/`error`/`blocked`/
`cancelled` gibi terminal görünümlü durumlar sonuç kanıtı değildir; kart
**“Sonuç bilinmiyor / bitiş bekleniyor”** der ve ana oturum, bitiş işareti
gözlendiğine kadar bitmemiş çağrıyı beklemeye devam eder.

## Yürütme performansı ölçümü

Seçili istek için **Yürütme performansı** paneli, seçili proje için **Proje
yürütme geçmişi** görünür. Bu ölçüm yalnızca gözlenen olay durumundan,
store/snapshot sınırında türetilir ve journal yeniden oynatma/yeniden
başlatmada korunur. Kapsamı yürütme kanıtıdır; kalite doğrulaması değildir:

- **Teknik tamamlanma**: gözlenen `run.ended` sonucu `idle` olduğunda ve
  `agent.finished` ile bitmiş, hatasız alt agent çağrıları olduğunda. Etiket her zaman **“kalite/testler
  doğrulanmadı”** uyarısıyla gelir. Normal bir model yanıtı, `workflow_report`
  ile bildirilen `done` aşama veya bir subagent araç sonucu görev doğruluğu
  kanıtı olarak yükseltilmez; bildirilen aşamalar ölçüme girmez, “Görev
  akışı” bölümünde ayrı gösterilir.
- **Hata**: `run.ended` sonucu `error` ise; ya da ana oturum yanıtı bitmiş olsa
  bile en az bir alt agent çağrısı hata döndürdüyse (çocuk hata; bilinen hata
  durumları `error`/`failed`/`blocked`/`cancelled` veya açık `isError: true` da
  diğerinin yokluğunda hata sayılır; ana yanıt
  boşta olsa bile istek başarı sayılmaz); ya da eşleşen bitmiş (hatalı) alt
  agent kaydı olmadan bir `subagent` araç hatası gözlenmişse (kanıtlanmış hata
  gizlenmez, bu durum ihtiyaten hata sayılır).
- **İptal**: `run.ended` sonucu `aborted`.
- **Sonuçsuz / bilinmiyor**: `run.ended` gözlenmediyse (devam eden istek,
  kopma, düşen kayıt), `run.ended` sonucu boşsa veya bilinen bir terminal
  sonuç değilse (yalnızca `idle`/`error`/`aborted` terminal sayılır; örn.
  `timeout`), yalnızca `run.settled` gözlendiyse veya başlamış ama bitmemiş
  alt agent çağrısı varsa. `agent.finished` kaydındaki tanınmayan/devam eden
  durum literalı (örn. `queued`, `timeout`) veya hiç durum içermeyen bitmiş
  kayıt (açık `isError: false` olmadan) da sonuçsuzdur; başarı kanıtı sayılmaz.
  `agent.progress` içinde bildirilen `done` veya `error` durumu terminal
  sayılmaz; yalnızca `agent.finished` bitiştir. Bunlar başarı sayılmaz ve
  ayrı gösterilir.
- Aynı agent’ın tekrar (retry) çağrıları ayrı çağrı sayılır. Çağrı bazlı
  geçen süre (bildirilen `elapsedMs` veya `agent.started` ile gözlenen
  başlangıç/bitiş) ve varsa bildirilen token gösterilir. Başlangıç olayı
  olmayan çağrıda süre `—` kalır, 0 ms uydurulmaz. Eksik veri `—` kalır; sıfır
  token/maliyet uydurulmaz, keyfi kalite puanı üretilmez.
- Gözlenen araç hataları ayrı sayılır; bir subagent çağrısının hatası, aynı
  çağrı kimliği bitmiş (hatalı) bir alt agent kaydı olarak sayıldıysa tekrar
  sayılmaz. Eşleşen bitmiş kayıt yoksa araç hatası görünür kalır ve istek
  başarı sayılmaz.
- **Proje geçmişi** yalnızca kayıtlı/elde tutulan isteklerden hesaplanır
  (oturum başına en fazla 30 istek; journal rotasyonu eskilerini düşürebilir).
  Oran tanımı açıktır: **payda = sonuçlanmış istekler (tamamlanan + hata +
  iptal)**; sonuçsuz istekler paydada ve başarıda yer almaz. Demo verileri
  canlı toplamdan hariçtir; Demo sekmesi kendi örnek toplamını gösterir.
- Sınırlar: görev doğrulama ve maliyet/ücret hesabı yapılmaz. JUnit raporları
  aşağıdaki ayrı akışla içe aktarılır; teknik tamamlanma oranını değiştirmez.

## Workflow karşılaştırması

Modeller değişebilir; dashboard Sol/MiMo/DeepSeek adlarına bağlı değildir.
Kod projesindeki `.pi/agent-dashboard.workflow.json` dosyasında workflow
kimliğini, sürümünü ve rol → agent eşleşmesini tanımla.
[Örnek profil](examples/workflow-profile.json) ve [kullanım rehberi](docs/WORKFLOWS.md).

Her istek kendi profilini ve gözlenen modellerini saklar. Karşılaştırma tablosu
aynı projenin workflow sürümlerini/model dağılımlarını ayrı gruplarda gösterir:
teknik tamamlanma, süre, bildirilen token ve ölçüm sayısı. Ortak görevleri
karşılaştırmak için `taskSet` etiketi ve görev kümesi filtresi vardır. Model
değişiklikleri eski sonuçları yeniden etiketlemez. Kalite veya ücret puanı üretilmez.

## Test raporu ekleme

Pi'deki istek bittikten sonra, aynı oturumda proje içindeki güncel JUnit XML
raporunu seç:

```text
/dashboard-evidence reports/junit.xml
```

Dashboard, rapordaki geçen/başarısız/hatalı/atlanmış testleri ve dosya özetini
ilgili isteğe bağlar. Workflow karşılaştırmasında farklı test kümeleri ayrı
gösterilir. Boş rapor veya “testler geçti” diyen agent mesajı başarı sayılmaz.
Komut test çalıştırmaz; yalnızca seçilen raporu okur. Eski ve proje dışındaki
raporlar reddedilir. Kullanım, desteklenen XML yapısı ve güven sınırları:
[EVIDENCE.md](docs/EVIDENCE.md).

Web arayüzü açık temalıdır; ana metin 16 px, yardımcı metinler en az 14 px'tir.
Görev akışı ve çalışan modeller önde, yürütme ayrıntıları açılır bölümde kalır.

## Farklı sağlayıcılar ve yerel modeller

Dashboard ve izleme eklentisi **Pi’nin çalıştığı Mac’e** kurulur. Belirli bir
model veya Windows/LM Studio kurulumu gerektirmez. Model kimliklerini Pi ve
alt agent olaylarından alır; sağlayıcı yönlendirmesini değiştirmez. Başka bir
cihazdaki yerel modeli kullanıyorsan o cihaza ayrıca dashboard kurman gerekmez.
Mevcut Pi workflow’unun API/abonelik kullanımı normal şekilde devam eder.

## Demo

Sunucu açıkken ikinci terminalde:

```bash
npm run demo
```

Tarayıcıda **Demo** sekmesine geç. Varsayılan Canlı görünümü örnek verilerle
doldurulmaz. Demo bir model çağırmaz, repository dosyalarına dokunmaz.

```bash
npm run demo -- --hold     # DeepSeek inceleme aşamasında bırak
npm run demo -- --error    # Başarısız uygulama / engellenen inceleme örneği
npm run demo -- --fast     # Bekleme olmadan örnek olay gönder
```

## Günlük kullanım ve kayıtlar

Her gün dashboard klasöründe `npm start`, kod projesinde normal Pi oturumun
çalışır. Sayfanın kapanması kaydı durdurmaz. Sunucu kapalıyken Pi eklentisi
olayları yerel diskte bekletir; bağlantı gelince yeniden gönderir. Pi kapanır
veya çökerse teslim edilmemiş kayıtlar sonraki Pi başlangıcında ya da `/reload`
ile kurtarılır. Teslimat için dashboard ile izleme eklentisinin yüklü olduğu
en az bir Pi süreci çalışmalıdır.

Her izleme istemcisinin varsayılan bekleyen kayıt sınırı **5.000 olay / 20 MiB**.
Sınır dolunca yeni olay reddedilir; kabul edilmiş eski kayıtlar silinmez.
`/dashboard-status`, bekleyen olay/byte, kurtarılan, reddedilen ve karantinadaki
kayıt sayılarını ve disk hatalarını gösterir. Disk yazılamazsa olayın kaydedildiği
iddia edilmez. Bu sınırlar kuyruk içindir; teslim edilmiş journal ayrı tutulur.

Kayıtlar repository’ye değil şu dizine gider:

```text
~/.agent-workflow-dashboard/
├── auth.token             # Sadece bu yerel dashboard’a erişim anahtarı
├── connection.json        # Pi eklentisinin bağlantı bilgisi
├── events.jsonl           # Güncel kayıt
├── events.1.jsonl          # Döndürülmüş kayıt
├── events.2.jsonl          # Döndürülmüş kayıt
├── spool/                 # Pi'nin henüz teslim edilmemiş olayları
│   ├── <üretici dizinleri>/ # Sürece ait, sıralı olay dosyaları
│   └── quarantine/        # Bozuk/yarım veya collector'ın reddettiği kayıtlar
└── backups/               # İsteğe bağlı kurulum/güncelleme yedekleri
```

Kuyruk dosyaları diske yazılmadan önce güvenli alanlara indirgenir ve maskelenir;
dosyalar `0600`, dizinler `0700` izinleriyle tutulur. Her üreticinin olay sırası
korunur; bağımsız Pi süreçleri arasında ortak yürütme sırası varsayılmaz.
Yaşayan süreçlerin kuyrukları devralınmaz. Birden fazla eski kuyruk kurtarılırsa
toplam geçici olarak sınırı aşabilir; yeni kayıtlar ancak yer açılınca kabul edilir.
Heartbeat'ler kalıcı değildir, kurtarılan geçmiş Pi'yi canlı göstermez.
Karantina kayıtları otomatik yeniden gönderilmez veya silinmez; bekleyen kuyruk
sınırına dahil değildir. Ayrıntılar: [teslimat mimarisi](docs/ARCHITECTURE.md#teslimat-ve-yeniden-bağlanma).

Güncel dosya 20 MB sınırında döndürülür; iki eski dosya saklanır. Dashboard
belleğinde oturum başına son 30 istek ve istek başına son 350 zaman çizelgesi
olayı tutulur. Dosya kaydı ile ekranda tutulan görünüm aynı sonsuz arşiv değildir.
Dışa aktarma **ekranda tutulan durumun** JSON çıktısıdır.

Portu değiştirmek için `PORT=7441 npm start`. Kayıt dizinini değiştirmek için
`AGENT_DASHBOARD_HOME=/güvenli/klasör` kullan; bu değişkeni hem dashboard’a hem
Pi’ye ver. Kayıt dizinini Git deposunun içine koyma.

### Gizlilik

Sunucu yalnızca IPv4 loopback’e bağlıdır; başka cihazlardan erişim kapalıdır.
Host/Origin kontrolleri, bearer anahtarlı olay alımı, HttpOnly/SameSite çerezi,
sıkı Content Security Policy ve payload limitleri vardır. İçerik HTML olarak
yürütülmez, metin olarak gösterilir. Dış CDN/telemetri kullanılmaz.

Bu bir güvenlik sandbox’ı değildir. Aynı kullanıcı hesabıyla çalışan uygulamalar
kayıtları okuyabilir. Promptların içinde hassas bilgi bulunabilir; yaygın anahtar
kalıplarını maskeleme **eksiksiz bir veri sızıntısı önleme sistemi değildir**.
Model anahtar dosyaları okunmaz; ham araç argümanları ve reasoning kaydedilmez.
Prompt/yanıt/görev metnini toplamayı kapatmak için Pi’yi şöyle aç:

```bash
AGENT_DASHBOARD_CAPTURE_PROMPTS=0 pi --continue
```

Dosya isimleri, agent adları ve workflow aşamaları yine kaydedilebilir. Anahtarları
ve sırları `workflow_report` içine koyma. Paylaşmadan önce dışa aktarılan dosyayı
incele. Eşleştirme bağlantısını da gizli tut.

## Güncelleme / kaldırma

Eklenti kodunu geliştirdikten sonra proje kopyasını güncelle:

```bash
npm run install:pi -- "/tam/yol/kod-projen" --update
```

Eski eklenti önce `backups/` altına kopyalanır. Sonra Pi’de `/reload` kullan.
Kaldırmak için yalnızca projedeki `.pi/extensions/agent-dashboard/` klasörünü
kaldır ve Pi’yi yeniden yükle. Eklediysen işaretli `AGENTS.md` bölümünü de
kaldırabilirsin. Eski kayıtlar otomatik silinmez.

## Testler

```bash
npm run check
npm test
```

Kurulu Pi ile model çağrısı yapmadan eklenti/TypeBox yüklemesini, sunucu
kapalıyken kaydı, süreç yeniden başlatıldıktan sonra sıralı teslimatı ve temiz
kapanışı izole geçici dizinde doğrulamak için:

```bash
npm run test:pi
```

Pi `PATH` üzerinde değilse `PI_BIN=/tam/yol/pi npm run test:pi` kullan.

Geliştirme ortamındaki doğrulama ve test kapsamı:
[docs/VERIFICATION.md](docs/VERIFICATION.md).

## GitHub’da yayınlama

Bu pakette `.git` ve yerel commit’ler bulunur. Henüz uzak repo oluşturulmadı.
Mac’te GitHub CLI kurulu ve hesabınla giriş yapılmış olmalı (`gh auth login`).
Aşağıdaki betik mevcut dosya değişikliği, origin veya aynı isimde repo varsa
durur; hiçbir repository’yi ezmez.

```bash
bash scripts/publish-github.sh
```

Kimliği doğrulanmış hesabında **özel** `agent-workflow-dashboard` deposu oluşturur
ve mevcut commit’leri gönderir. Başka isim için betiğe tek argüman ver.
Bu işlem otomatik olarak çalıştırılmaz. Sonraki geliştirmelerde normal
`git add`, `git commit`, `git push` kullanılır.

## Katkı ve lisans

[Katkı rehberi](CONTRIBUTING.md) · [Güvenlik bildirimleri](SECURITY.md) ·
[MIT lisansı](LICENSE) · [Yayın hazırlığı](docs/RELEASING.md)

## Mimari ve yol haritası

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/ROADMAP.md](docs/ROADMAP.md)

Pi ve `pi-open-agents` bağımsız projelerdir. Bu ilk sürümün API referansları
25 Eylül 2026’da incelendi; ileride event şemaları değişirse adapter güncellemesi
gerekebilir. Bu proje OpenAI, Pi veya model sağlayıcılarının resmî ürünü değildir.

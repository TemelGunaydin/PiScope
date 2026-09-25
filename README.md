# Agent Desk

**Pi için yerel, modelden bağımsız workflow izleme ekranı.**

Sol’un planını, Qwen’e devredilen araştırmayı ve MiMo’nun uygulama görevini aynı
HTML ekranında takip et. Dashboard **izler**; modelleri çağırmaz, model değiştirmez,
kod yazmaz ve mevcut orchestration/izin sisteminin yerini almaz.

> **Durum: ilk çalışan sürüm / v0.1.0.** Sunucu, olay kaydı ve adapter testleri
> çalıştırıldı. Gerçek Mac + kurulu Pi + model sağlayıcılarıyla uçtan uca doğrulama
> henüz yapılmadı. GitHub’da repo oluşturma/push bu geliştirme oturumunda mümkün
> olmadı; pakette yerel Git geçmişi ve isteğe bağlı yayınlama betiği var.

![Demo verisiyle Agent Desk ekranı](docs/preview.png)

*Görüntüdeki görev, model etiketleri ve sayılar demo verisidir; ölçülmüş model
performansı veya gerçek test sonucu değildir.*

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
`orchestrator` agent’ını kullanmaya devam et:

```text
/agent orchestrator
```

Ardından normal bir görev ver. Pi olayları otomatik kaydedilir.

**Bu izleme eklentisi `pi-open-agents` kurmaz.** Sende çalışan Qwen/MiMo/Sol
model ve agent tanımlarını aynen kullanır. Aynı eklentiyi hem global hem proje
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
| Geçmiş | İzleme kurulduktan sonra kaydedilen yerel olaylar |

**Gösterilmeyen veya garanti edilmeyenler:** faturanın gerçek dolar tutarı,
abone kotası, GPU sıcaklığı/VRAM, LM Studio bağlantı sağlığı, ayrı child process
içindeki bütün iç olaylar, tam kaynak kodu, ham terminal çıktısı, modelin gizli
düşüncesi, önceki Codex konuşmalarının tamamı. Tokenlar ücret değildir.

“Yanıt tamamlandı”, model döngüsünün durduğunu belirtir. **Testlerin geçtiğini
veya görevin doğru tamamlandığını garanti etmez.** `done` aşamaları da agent’ın
bildirimidir, bağımsız bir test doğrulayıcısı değildir.

## Windows’taki Qwen için

Dashboard ve izleme eklentisi **Pi’nin çalıştığı Mac’e** kurulur. Qwen yine
Windows’taki LM Studio üzerinden çalışır. Dashboard için Windows’a ikinci bir
sunucu veya ajan kurman gerekmez; mevcut Pi → LM Studio bağlantın değişmez.
Dashboard model API çağrısı yapmaz; mevcut Pi workflow’unun API/abonelik
kullanımı normal şekilde devam eder.

## Demo

Sunucu açıkken ikinci terminalde:

```bash
npm run demo
```

Tarayıcıda **Demo** sekmesine geç. Varsayılan Canlı görünümü örnek verilerle
doldurulmaz. Demo bir model çağırmaz, repository dosyalarına dokunmaz.

```bash
npm run demo -- --hold     # MiMo çalışma aşamasında bırak
npm run demo -- --error    # Başarısız uygulama / engellenen inceleme örneği
npm run demo -- --fast     # Bekleme olmadan örnek olay gönder
```

## Günlük kullanım ve kayıtlar

Her gün dashboard klasöründe `npm start`, kod projesinde normal Pi oturumun
çalışır. Sayfanın kapanması kaydı durdurmaz; **sunucunun durması** kaydı durdurur.
Pi eklentisi kısa kopmalarda en fazla 500 olayı bellekte tutarak yeniden dener.
Pi kapanınca teslim edilmemiş olaylar kaybolabilir; kalıcı offline kuyruk yoktur.

Kayıtlar repository’ye değil şu dizine gider:

```text
~/.agent-workflow-dashboard/
├── auth.token             # Sadece bu yerel dashboard’a erişim anahtarı
├── connection.json        # Pi eklentisinin bağlantı bilgisi
├── events.jsonl           # Güncel kayıt
├── events.1.jsonl          # Döndürülmüş kayıt
├── events.2.jsonl          # Döndürülmüş kayıt
└── backups/               # İsteğe bağlı kurulum/güncelleme yedekleri
```

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

## Mimari ve yol haritası

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/ROADMAP.md](docs/ROADMAP.md)

Pi ve `pi-open-agents` bağımsız projelerdir. Bu ilk sürümün API referansları
25 Eylül 2026’da incelendi; ileride event şemaları değişirse adapter güncellemesi
gerekebilir. Bu proje OpenAI, Pi veya model sağlayıcılarının resmî ürünü değildir.

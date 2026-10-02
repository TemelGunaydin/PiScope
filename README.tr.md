# PiScope

[English](README.md) · Türkçe kurulum rehberi

**Pi projelerin, tek bakışta — evden uzaktayken bile.**

[Pi coding agent](https://pi.dev) kullanıcıları için yerel workflow dashboard’u.
Projelerde nerede kaldığını, son isteği/yanıtı, çalışan modelleri ve alt agent
çağrılarını tek ekranda takip et. İsteğe bağlı **Tailscale Serve** ile aynı ekranı
evden uzaktayken telefonundan aç.

![Sentetik verilerle PiScope arayüzü](docs/preview.png)

*Görüntü sentetik test verisidir; gerçek kullanıcı isteği veya ölçülmüş model
performansı değildir.*

Arayüz **İngilizcedir**; proje adların, isteklerin ve yanıtların kendi dilinde
kalır. PiScope yalnızca **izler**: model çağırmaz, model değiştirmez, görev
başlatmaz/delege etmez, kod yazmaz ve test çalıştırmaz. Ek model aboneliği veya
API anahtarı gerekmez; mevcut Pi kurulumunu kullanır.

## 1. PiScope’u çalıştır

**Node.js 22+**, tarayıcı ve canlı izleme için mevcut Pi kurulumu gerekir.
Haricî npm bağımlılığı yok; `npm install` veya frontend build gerekmez.

```bash
git clone https://github.com/TemelGunaydin/PiScope.git
cd PiScope
npm start
```

Bu terminal açık kalsın. **İkinci terminalde, yine PiScope klasöründe:**

```bash
npm run open
```

Tarayıcı özel bağlantıyla eşleştirilir. `npm start` çıktısındaki bağlantıyı elle
de açabilirsin. Sonraki ziyaretlerde **http://127.0.0.1:7331** kullanılır.
`npm run open` sunucu başlatmaz; çalışan sunucuya tarayıcıyı eşleştirir.
**Eşleştirme bağlantılarını paylaşma**; parola gibi değerlendir.

macOS yerelde kontrol edildi; Linux/macOS için core CI yapılandırılmıştır.
Windows doğrulanmadı. Canlı model/alt agent uyumluluğu Pi **0.87.1** ve
pi-open-agents **0.1.22** ile kontrol edildi; diğer paketler adapter gerektirebilir.

## 2. Pi projelerini bağla

Manuel “proje ekle” formu veya disk taraması yoktur. Her projeye izleme
eklentisini kur ve Pi’de normal şekilde çalış. Python, Swift, Node.js vb.
projeler olabilir; **hedef projede `package.json` bulunması gerekmez.**

Aşağıdaki komutları hedef projede **değil, PiScope klasöründe** çalıştır:

```bash
npm run install:pi -- "/tam/yol/birinci-proje"
npm run install:pi -- "/tam/yol/ikinci-proje"
```

Yalnızca `.pi/extensions/agent-dashboard/` kopyalanır. Model anahtarları, MCP
ayarları, model/agent tanımları değiştirilmez. Eklentiyi aynı Pi oturumuna hem
global hem proje dizininden iki kez yükleme.

Sonra hedef projede Pi’yi aç:

```bash
cd /tam/yol/birinci-proje
pi
```

Pi içinde:

```text
/reload
/dashboard-status
```

**`PiScope: connected`** görünmeli. Normal bir görev ver; çalışma kaydedilince
proje kartı dashboard’da belirir. Diğer projelerde tekrarla. Açık Pi oturumun
varsa yeniden başlatmak yerine `/reload` kullanabilirsin. `/dashboard-status`
teslimatı kontrol eder, görev başlatmaz.

### Plan ve sıradaki adım — isteğe bağlı

Model/araç olayları otomatik izlenir. Plan aşamaları için agent’ın
**`workflow_report`** aracını kullanması gerekir. `AGENTS.md` dosyasına raporlama
talimatı eklemek istersen:

```bash
npm run install:pi -- "/tam/yol/proje" --update --instructions
```

`--update` yalnızca bu eklentiyi yedekleyip yeniler. `--instructions` mevcut
`AGENTS.md` içeriğini korur, önce yedekler ve talimat ekler; dosya değişmesin
istiyorsan kullanma. Orchestrator araç izinleri kısıtlıysa mevcut ayarlarında
`workflow_report` izni ver. Plan bildirimi işin gerçekten yürütüldüğünü
kanıtlamaz; bu araç görev başlatmaz veya delege etmez.

PiScope güncellendikten sonra kurulu projelerde:

```bash
npm run install:pi -- "/tam/yol/proje" --update
```

Ardından Pi’de `/reload`. Yalnız web arayüzü değiştiyse tarayıcıyı yenilemek
yeterlidir. Kaldırmak için yalnız `.pi/extensions/agent-dashboard/` dizinini
sil ve Pi’yi reload et; kayıtlı geçmiş korunur. Eski veri/eklenti yolları ve
`AGENT_DASHBOARD_*` değişkenleri uyumluluk için aynen kalır.

## 3. Evden uzaktayken telefonundan takip et

Bilgisayarında ve telefonunda **Tailscale** kurulu, aynı tailnet’e bağlı ve açık
olsun. Bilgisayar **uyanık, internete bağlı ve PiScope çalışıyor** olmalı; canlı
ilerleme için Pi oturumu da çalışmaya devam etmeli. Mobil veri veya başka Wi-Fi
üzerinden erişebilirsin. Bu yalnızca izleme içindir, telefondan yeni Pi görevi
göndermez. Public sunucu veya router port yönlendirmesi gerekmez.

Bilgisayarın Tailscale adını ve mevcut Serve yollarını kontrol et:

```bash
tailscale status --json | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>console.log(JSON.parse(s).Self.DNSName.replace(/\.$/,"")))'
tailscale serve status
```

Aşağıdaki `mac-adin.tailnet-adin.ts.net` yerine kendi bilgisayarının tam adını
yaz. Bu ad projeye değil **bilgisayara** aittir. Aynı bilgisayardaki uygulamalar
ayrı HTTPS portları kullanabilir. **8443** örneği 443’teki uygulamayı değiştirmez;
8443’ün de boş olduğunu kontrol et.

Yerel sunucuyu `Ctrl+C` ile durdurup PiScope klasöründe yeniden başlat:

```bash
AGENT_DASHBOARD_TAILSCALE_ORIGIN="https://mac-adin.tailnet-adin.ts.net:8443" npm start
```

İkinci terminalde:

```bash
tailscale serve --bg --https=8443 http://127.0.0.1:7331
tailscale serve status
```

Tailscale HTTPS’i etkinleştirmeni isterse gösterdiği kurulum bağlantısını izle.
**Serve kullan, Funnel kullanma:** Serve tailnet’e özeldir; Funnel public’tir.

Telefonunda terminaldeki **Tailscale browser pairing** bağlantısını **yeni
sekmede** aç. Bu tokenlı bağlantıyı paylaşma. Eşleştirmeden sonra düz adresi
telefonunda yer işareti yap:

```text
https://mac-adin.tailnet-adin.ts.net:8443/
```

Bilgisayarda da aynı HTTPS ekranını açmak için:

```bash
npm run open -- --tailscale  # Yalnız bilgisayarın tarayıcısını eşleştirir
npm run open                # Yerel erişim de çalışmaya devam eder
```

Telefondan her girişte `npm run open` gerekmez; bir kez eşleştir, sonra yer
işaretini kullan. Her tarayıcı/hostname ayrı eşleşir. HTTPS origin ayarı her
PiScope başlangıcında verilmelidir; ayarsız `npm start` yalnız yereldir.

Yalnız PiScope’un Serve endpoint’ini kapatmak için:

```bash
tailscale serve --https=8443 off
```

Bütün Serve ayarlarını sıfırlama veya başka uygulamanın portunu değiştirme.
Collector loopback’te kalır; `http://100.x.y.z:7331` desteklenen erişim yolu
değildir. `PORT` değişirse Serve backend hedefini de değiştir.
Eşleşmiş tarayıcı bütün kayıtlı projeleri okuyabilir/dışa aktarabilir; erişimi
tailnet grants/ACL’leriyle güvenilir cihazlarla sınırla.
[Tam rehber ve sorun giderme](docs/TAILSCALE.md).

## Nerede kalmıştım?

**My projects** görünümünde aynı projenin Pi sekmeleri tek kartta birleşir.
Son istek, son yanıt, çalışma tarihi ve bildirilen ilk bitmemiş plan adımı
saklanır. Proje/metin araması ve durum/7+ gün filtresi vardır. Kartlar proje
adına göre sabit sırada kalır; yeni olaylarla yer değiştirmez.

**Open last request** ayrıntıya, **← Back to projects** listeye döner;
filtre, kaydırma ve kart odağı korunur. 220 karakterden uzun alanlar
**Show more / Show less** ile ayrı ayrı açılır. **Last request finished**
bütün projenin tamamlandığı veya testlerin geçtiği anlamına gelmez.
Eksik sonuç **Outcome unknown** kalır. [Durum ve saklama kuralları](docs/PROJECTS.md).

## Workflow ve JUnit raporları

Workflow sürümlerini kıyaslamak için projede
`.pi/agent-dashboard.workflow.json` oluştur. [Örnek](examples/workflow-profile.json)
ve [Türkçe workflow rehberi](docs/WORKFLOWS.md). Profil modelleri seçmez; gözlenen
kimlikleri ve ölçümleri etiketler. Aynı `taskSet`, eşit girdi/koşul garantisi değildir.

İstek bittikten sonra, yenisine başlamadan aynı Pi oturumunda güncel raporu ekle:

```text
/dashboard-evidence reports/junit.xml
```

Komut yalnız raporu okur, test çalıştırmaz. Eski, geçersiz veya proje dışı
raporlar reddedilir; boş veya tamamen atlanmış testler başarı sayılmaz.
Rapor tek başına güncel kodun/test koşusunun bağımsız doğrulaması değildir.
[JUnit biçimleri ve güven sınırları](docs/EVIDENCE.md).

## Veri, güvenlik ve testler

Kayıtlar yerelde `~/.agent-workflow-dashboard/` içinde tutulur; cloud senkronizasyon,
telemetri veya model çağrısı yoktur. Özel veri dizini için **hem Pi hem PiScope’ta**
`AGENT_DASHBOARD_HOME` ayarla; repository dışında tut. Eşleştirme token’larını,
`connection.json`, kuyrukları ve kişisel geçmişi commit etme.

Sunucu kapalıyken Pi olayları diskte bekletir ve tekrar gönderir. İstemci başına
varsayılan **5.000 olay / 20 MiB** kapasite dolunca yeni olaylar reddedilir,
kabul edilmişler korunur. `/dashboard-status` ile kontrol et. Ayrıntılı geçmiş
sınırlıdır; kısa proje özetleri daha uzun saklanır (canlı/demo başına **500**).
Yalnız journal silmek bütün özetleri silmez; export sonsuz arşiv değildir.

İstek ve yanıt metinlerini kaydetmemek için Pi’yi şöyle başlat:

```bash
AGENT_DASHBOARD_CAPTURE_PROMPTS=0 pi --continue
```

Dosya adları, model kimlikleri ve plan aşamaları kalabilir. Maskeleme bütün
sırları bulma garantisi değildir. Aynı OS kullanıcısı yerel kayıtları okuyabilir.
Paylaşmadan önce export’u incele. [Güvenlik politikası](SECURITY.md).

```bash
npm run check
npm test
npm run test:pi  # Kurulu Pi ile, model çağırmadan isteğe bağlı kontrol

# Python Playwright + Chromium; HTTPS testi için openssl de gerekir.
python test/browser-smoke.py --network
python test/browser-smoke.py --tailscale
```

Tarayıcı testleri kendi geçici sunucusunu ve sentetik kayıtlarını kullanır;
kişisel geçmişi/gerçek Serve ayarlarını değiştirmez. HTTPS testi proxy
simülasyonudur; gerçek telefon erişimini kendi tailnet’inde ayrıca dene.
[Doğrulama kayıtları](docs/VERIFICATION.md) · [Katkı rehberi](CONTRIBUTING.md).

[MIT](LICENSE). PiScope bağımsız topluluk projesidir; Pi, Tailscale veya model
sağlayıcılarının resmî ürünü değildir.

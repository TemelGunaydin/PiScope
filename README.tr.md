<img src="public/icon.png" width="88" height="88" alt="PiScope icon">

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
kalır. PiScope **varsayılan olarak yalnızca izler**. İsteğe bağlı onaylı kontrol,
açık ve boşta olan Pi oturumuna prompt gönderir; Pi mevcut modeli, izinleri ve
kotasıyla dosya değiştirebilir veya araç çalıştırabilir. PiScope doğrudan model
çağırmaz veya model/sağlayıcı seçmez. Ek abonelik veya API anahtarı gerekmez.

## Bugün neler yaptım?

**Daily report** ekranında tarih seç ve tek **Generate report** düğmesine bas.
Pi oturumunu, mevcut modeli ve bütün projelerden gönderilecek bağlamı incele;
**Confirm and generate in Pi** ile onayla. Mevcut Pi modeli tanımlı/izlenen bütün
projelerin o günkü kayıtlarını **tek model isteğinde, tek genel günlük rapora**
dönüştürür. Proje başına ayrı buton/üretim veya rapor kartı yoktur; prompt ve model
yanıtları da tek tek listelenmez.

Üretim için [üç ayrı kontrol izni](docs/CONTROL.md),
açık/boşta tek bir Pi oturumu, o oturumda güncel `daily_report` aracı ve açık prompt
capture yeterlidir. Diğer projelerin Pi oturumları kapalı olabilir; kayıtlı günlük
bağlamları yine rapora dahil edilir. Yeni API anahtarı gerekmez; model değişmez veya yeni Pi süreci
başlatılmaz. **Üretim mevcut model kotasını kullanır; yalnız görüntüleme kullanmaz.**
PiScope otomatik üretim/yeniden deneme başlatmaz; Pi’nin mevcut retry ayarları korunur.

**Use the model from this Pi session**, raporu yazacak mevcut modeli seçer;
**rapora dahil edilecek projeleri filtrelemez**. Uygun oturum varsa otomatik
seçilir; senin açık seçimin korunur. Mevcut model ayrıca gösterilir; bağlantısı
kesilmiş eski oturumlar yeni hedef olarak sunulmaz. Bütün projelerin tek raporu
için yalnız bir hazır üretim oturumu yeterlidir. Onay ekranı kapsamı, günü,
modeli ve Pi oturumunu ayrı gösterir. **View exact prompt and context** tam girdiyi
açar; kota kullanımı ve izin uyarıları onay düğmesinin yanında görünür kalır.

**Generate report pasifse**, yanındaki panel nedenini ve ilgili kurulum adımlarını
gösterir; hiçbir izin kendiliğinden açılmaz:

| Durum | Yapılacak işlem |
|---|---|
| Viewing only | Bu tarayıcıda ayrı **Control pairing** bağlantısını aç. İzleme eşleştirmesi iş gönderemez. |
| Setup needed / Session needed | Collector kontrolünü etkinleştir; bitmiş isteği olan güncel Pi oturumunu aç ve o oturumda `/dashboard-control on` yaz. |
| Update needed | PiScope klasöründen yalnız seçili projenin eklentisini güncelle, Pi’yi yeniden aç ve yerel kontrolü tekrar etkinleştir. `daily_report` ve açık prompt capture gerekir; eski eklentili oturumu seçmek tek başına yeterli değildir. |
| Busy | Pi’nin bitmesini bekle veya başka hazır oturum seç. PiScope aktif işi kesmez. |
| No context | Kayıtlı çalışma metni olan bir gün seç. Yakalanmamış veya süresi dolmuş geçmiş yeniden oluşturulamaz. |

LLM tekrarları birleştirir; planları ve başarısız işleri yapılmış gibi sunmaması
istenir. **Remaining / blocked** bitmeyen işleri ayrı gösterir. Özet, bağımsız
kod/test doğrulaması değildir. Bağlam sınırlıdır ve kapsam sayısı gösterilir;
eski/atlanmış işler eksik olabilir. Yeni kayıt gelince özetin eski olduğu belirtilir.
Üretim başarısızsa önceki iyi özet korunur; hata veya sıradan model yanıtı yeni
özet gibi gösterilmez. **Previous / Next / Today** ile günü değiştir,
**Copy report** ile üretilmiş özetleri kopyala; paylaşmadan önce özel içeriği kontrol et.
Bilgisayar ve telefonda raporun gösterdiği saat dilimi kullanılır.

Güncellemeden sonra mevcut kontrol/Tailscale ayarlarını koruyarak PiScope’u
yeniden başlatıp tarayıcıyı yenile. PiScope klasöründen yalnız raporu üretecek
projenin eklentisini `npm run install:pi -- "/tam/yol/proje" --update` ile güncelle; o projedeki Pi’yi
yeniden açıp hazır olduğunda `/dashboard-control on` yaz. Aktif işi yalnız
güncelleme için kesme. Sadece izleme eşleştirmesi rapor üretemez.
[Ayrıntılar ve saklama sınırları](docs/DAILY-REPORTS.md).

## Terminal Todos proje notları

Salt okunur entegrasyonu `AGENT_DASHBOARD_TODOS=1 npm start` ile etkinleştir;
mevcut kontrol/Tailscale ayarlarını koru. **Project notes**, Terminal Todos’un
standart yerel JSON dosyasını okur; farklı konum için mutlak
`AGENT_DASHBOARD_TODOS_FILE` kullanılabilir. Varsayılan durumda kişisel not
dosyası okunmaz. PiScope’u yeniden başlatıp tarayıcıyı yenilemen yeterlidir;
sıradan prompt gönderimi için yeni bir raporlama aracı veya model anahtarı gerekmez.

**Link Terminal Todos project labels → Save link** ile etiketi doğru PiScope
projesine açıkça bağla. Aynı ad otomatik eşleştirilmez; aynı adlı projelerde karttaki
proje kimliği ve son isteği karşılaştır. Proje kartının **Project notes** düğmesi
bağlı notları filtreler. Etiketsiz/bağlanmamış not için tek kullanımlık hedef seç.
**Edit prompt**, not kartında yerel taslak açar: başına ek talimat yaz veya
kopyayı düzenle; asıl Terminal Todos notu değişmez. **Cancel edit** yalnız bu
taslağı iptal eder. **Use as prompt**, düzenlenmiş taslağı (düzenleme yoksa asıl
notu) **Other** alanına kopyalar. Orada da düzenleyebilir, **Review prompt** ile
proje/oturum/mevcut model ve tam metni inceleyip **Confirm and send to Pi** ile
onaylayabilirsin. Düzenleme/kopyalama/Cancel model işi başlatmaz; canlı güncellemeler
ve sonraki not değişiklikleri taslağı silmez. Taslak diske yazılmaz; tarayıcı
yenilemesinden sonra geri yüklenmez. Takip edilen notun onay ekranında görünür
bir request-ID başlığı eklenir; taslak aynen kalır ve 8.000 karakterlik toplam
girdi sınırı bu başlığı da içerir.
Gönderimden sonra kartta **Pending / Sent / Running / Reply ready / Error /
Unknown**, saklanan kısa yanıt ve ilgili oturum/isteği açan **View Pi request**
görünür. Bunlar gözlenen istek durumlarıdır; görevin tamamlandığının kanıtı değildir.
Sonuç bağlantısı desteklenmiyorsa o projenin eklentisini güncelleyip Pi’yi yeniden
başlatmak gerekir. Sıradan Other için not-sonuç yeteneği gerekmez, ancak
**bütün yeni gönderimler model-bağlı onay ister**: eski proje eklentisini güncelle,
Pi’yi yeniden başlat ve `/dashboard-control on` ile tekrar izin ver. İzleme açık
kalır; PiScope model değiştirmez. Terminal Todos terminalde kalır; bu görünüm
PiScope’un masaüstü tarayıcısında da çalışır, telefon isteğe bağlıdır.

Günlük raporun aksine prompt **yalnız onaylanan proje/oturuma** gider; başka
projelerin notları birleştirilmez. Aynı üç kontrol izni gerekir. Okuma kota
kullanmaz; onaylı gönderim Pi’nin mevcut modelini, kotasını ve izinlerini kullanır.
Otomatik çalışma, meşgul işe kuyruklama, model değiştirme, kaynak notu düzenleme veya
otomatik tamamlama yoktur. **Gönderildi ≠ tamamlandı.** Telefondan not ekleme ve
iki yönlü düzenleme/senkronizasyon sonraki dilime bırakıldı.
[Kurulum, gizlilik ve sınırlar](docs/TERMINAL-TODOS.md).

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
varsa `/reload` deneyebilirsin; komutlar görünmüyorsa veya eski eklenti yüklü
kalıyorsa Pi’yi kapatıp yeniden aç. `/dashboard-status` teslimatı kontrol eder,
görev başlatmaz.

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

Güncellemeden sonra o projenin Pi oturumunu kapatıp yeniden aç; `/reload` tek
başına eski modülleri yüklü tutabilir. Kontrol kullanıyorsan yeniden
`/dashboard-control on` yaz. Collector kodu değiştiyse mevcut kontrol/Tailscale
ayarlarını koruyarak PiScope’u da yeniden başlat. Yalnız web arayüzü değiştiyse
tarayıcıyı yenilemek yeterlidir. Kaldırmak için yalnız
`.pi/extensions/agent-dashboard/` dizinini sil ve Pi’yi yeniden başlat;
kayıtlı geçmiş korunur. Eski veri/eklenti yolları ve
`AGENT_DASHBOARD_*` değişkenleri uyumluluk için aynen kalır.

## 3. Evden uzaktayken telefonundan takip et

Bilgisayarında ve telefonunda **Tailscale** kurulu, aynı tailnet’e bağlı ve açık
olsun. Bilgisayar **uyanık, internete bağlı ve PiScope çalışıyor** olmalı; canlı
ilerleme için Pi oturumu da çalışmaya devam etmeli. Mobil veri veya başka Wi-Fi
üzerinden erişebilirsin. Normal eşleştirme yalnızca izleme içindir; görev göndermek
için aşağıdaki ayrı kontrol izni gerekir. Public sunucu veya router port
yönlendirmesi gerekmez.

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

## 4. İsteğe bağlı: dashboard’dan Pi’ye iş gönder

Kontrol **varsayılan olarak kapalıdır**. Açmak için:

1. PiScope’u `AGENT_DASHBOARD_CONTROL=1 npm start` ile yeniden başlat.
   Telefon kullanıyorsan mevcut `AGENT_DASHBOARD_TAILSCALE_ORIGIN` ayarını da koru.
2. PiScope klasöründe hedef eklentiyi güncelle:
   `npm run install:pi -- "/tam/yol/proje" --update`.
3. Güncel eklentinin yüklenmesi için hedef projedeki Pi’yi kapatıp yeniden aç;
   `/dashboard-control on` ve `/dashboard-status` yaz.
4. Terminaldeki ayrı **Control pairing** bağlantısını istediğin tarayıcıda aç.
   iPhone’da yeni Safari sekmesi kullan; Mac’i eşleştirmek telefonu eşleştirmez.

Son isteği aç. **Recommended → Review and start** ile agent’ın önerisini seç
veya **Other → Review prompt** alanına kendi isteğini yaz. Proje, oturum, model
ve tam prompt’u inceleyip **Confirm and send to Pi** ile onayla. Bu onay olmadan
hiçbir iş başlamaz. Öneriler `workflow_report` raporudur; otomatik üretilen karar
veya kalite kanıtı değildir. Öneri yoksa Other kullanılabilir.

**Continue this project** içinde, Recommended/Other alanlarının yanında seçili
isteğin **Last model response** metni de görünür; yalnız izleme modunda da
okunabilir. Uzun yanıt kaydırılır. İlgisiz canlı güncellemeler okuma konumunu,
metin seçimini ve gönderilmemiş Other taslağını korur.

Pi’nin bildirdiği model/sağlayıcı hataları (örneğin Codex yoğunluk hatası) ayrı
uyarı olarak gösterilir; başarılı yanıt gibi sunulmaz. Yeni deneme veya başarılı
yanıt güncel uyarıyı kaldırır; geçmiş hatalar activity feed’de kalır. PiScope bu
hataları otomatik tekrar denemez veya model değiştirmez; Pi’nin kendi tekrar
deneme ayarları geçerliliğini korur. Eski kayıtlarda yalnız genel hata bildirimi
olabilir. Ayrıntılı hata kaydı için yukarıdaki eklenti güncellemesi ve
Pi/PiScope yeniden başlatma adımları gerekir.

Kapalı, meşgul, henüz durulmamış veya eski istek hedefleri reddedilir. Çift gönderim
koruması vardır; **unknown** teslimat otomatik tekrarlanmaz, önce Pi’yi kontrol et.
**Submitted**, Pi girdisine iletildi demektir; işin başarıyla yapıldığı anlamına
gelmez. Mevcut model/workflow ve Pi izinleri korunur; iş mevcut model kotasını
kullanabilir. `/dashboard-control off` veya kontrol ayarı olmadan yeniden başlatma
yeni gönderimleri kapatır, başlamış işi durdurmaz.

[Detaylı kurulum, güvenlik, öneri şeması ve teslimat durumları](docs/CONTROL.md).

## Nerede kalmıştım?

**My projects** görünümünde aynı projenin Pi sekmeleri tek kartta birleşir.
Son istek, son yanıt, çalışma tarihi ve bildirilen ilk bitmemiş plan adımı
saklanır. Proje/metin araması ve durum/7+ gün filtresi vardır. Kartlar proje
adına göre sabit sırada kalır; yeni olaylarla yer değiştirmez.
Masaüstünde aynı satırdaki kartlar eşit yüksekliktedir; sonraki adım ve işlem
alanları alta hizalanır. Uzun metin açılınca veya yazı boyutu büyüyünce satır
birlikte uzar, içerik kesilmez. Mobilde kartlar doğal yüksekliklerini korur.

Model/sağlayıcı hatası kartta hata metniyle gösterilir. Aktif istek yoksa kırmızı
**Error** rozeti görünür; çalışma devam ediyorsa **Running** korunur.

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
telemetri veya doğrudan model çağrısı yoktur. Onaylı devam, mevcut Pi modelini kullanır. Özel veri dizini için **hem Pi hem PiScope’ta**
`AGENT_DASHBOARD_HOME` ayarla; repository dışında tut. Eşleştirme token’larını,
`connection.json`, kuyrukları ve kişisel geçmişi commit etme.

Sunucu kapalıyken Pi olayları diskte bekletir ve tekrar gönderir. İstemci başına
varsayılan **5.000 olay / 20 MiB** kapasite dolunca yeni olaylar reddedilir,
kabul edilmişler korunur. `/dashboard-status` ile kontrol et. Ayrıntılı geçmiş
sınırlıdır; kısa proje özetleri daha uzun saklanır (canlı/demo başına **500**).
Günlük bağlam mod başına en çok **1.000 gün/istek kaydı ve 12 MiB** tutar;
üretilmiş raporlar ayrı dosyada gün başına tek genel rapor olarak en çok **500
kayıt ve 2 MiB** ile saklanır. Eski proje bazlı raporlar silinmez; aynı bütçeyi paylaşır.
Ayrıntılı oturum geçmişi silinse veya PiScope yeniden başlasa da özetler bu
sınırlar dahilinde korunur. Yalnız journal silmek proje/günlük özetlerini
silmez; export sonsuz arşiv değildir.

İstek, yanıt ve ayrıntılı model/sağlayıcı hata metinlerini kaydetmemek için
Pi’yi şöyle başlat:

```bash
AGENT_DASHBOARD_CAPTURE_PROMPTS=0 pi --continue
```

Dosya adları, model kimlikleri, plan aşamaları ve genel hata bildirimi kalabilir.
Öneri ve kısa sonuç maddeleri de kaydedilmez; önceden kaydedilmiş veriler
silinmez. Bu ayarla günlük rapor üretimi de kapanır. Açık kontrol üzerinden
onaylanan Other prompt’u yine Pi’ye iletilir. Hata
metinleri sınırlanır ve maskelenir; maskeleme bütün sırları bulma garantisi değildir. Aynı OS kullanıcısı yerel kayıtları okuyabilir.
Paylaşmadan önce export’u incele. [Güvenlik politikası](SECURITY.md).

```bash
npm run check
npm test
npm run test:pi  # Kurulu Pi ile, model çağırmadan isteğe bağlı kontrol
npm run test:pi:control  # Gerçek Pi girdisi; model çağrısından önce testte durdurulur

# Python Playwright + Chromium; HTTPS testi için openssl de gerekir.
python test/browser-smoke.py --network
python test/browser-smoke.py --tailscale
python test/control-browser.py
python test/control-browser.py --tailscale
python test/daily-browser.py
python test/daily-browser.py --tailscale
```

Tarayıcı testleri kendi geçici sunucusunu ve sentetik kayıtlarını kullanır;
kişisel geçmişi/gerçek Serve ayarlarını değiştirmez. HTTPS testi proxy
simülasyonudur; gerçek telefon erişimini kendi tailnet’inde ayrıca dene.
[Doğrulama kayıtları](docs/VERIFICATION.md) · [Katkı rehberi](CONTRIBUTING.md).

[MIT](LICENSE). PiScope bağımsız topluluk projesidir; Pi, Tailscale veya model
sağlayıcılarının resmî ürünü değildir.

[Üçüncü taraf lisansları](THIRD_PARTY_NOTICES.md): kapsamlandırılmış SpinKit Flow bileşeni.

# Değişebilir modellerle workflow karşılaştırma

Workflow bir model listesi değildir. Profil, iş akışının kimliğini, sürümünü ve
rollerini tanımlar. Pi agent tanımları hangi modelin çalışacağını belirler;
dashboard yalnızca kullanılan model kimliklerini ve sonuçları kaydeder.

## Projede etkinleştirme

İzleme eklentisinin kurulu olduğu kod projesinde
`.pi/agent-dashboard.workflow.json` oluştur. Başlangıç örneği:

```json
{
  "schemaVersion": 1,
  "id": "implement-review",
  "version": "1",
  "label": "Uygulama ve bağımsız inceleme",
  "taskSet": "",
  "roles": [
    { "role": "implementation", "agent": "mimo" },
    { "role": "review", "agent": "deepseek" }
  ]
}
```

Kopyalanabilir dosya: [examples/workflow-profile.json](../examples/workflow-profile.json).
`agent` alanları Pi’deki agent adlarıyla eşleşmelidir. Bunlar model seçmez.
Agent adlarını değiştirebilirsin; aynı görevi sürdüren rolün adını sabit tut.
Ana oturum otomatik olarak `primary` rolüne kaydedilir. Bir agent birden fazla
role bağlanamaz: mevcut Pi olayları aynı agent’ın hangi rol adına çağrıldığını
ayırt edecek ayrı bir rol alanı taşımıyor. Eşleşmeyen agent’lar `unmapped:`
etiketiyle ayrıca görünür.

Profil her yeni isteğin başlangıcında okunur. Pi’yi yeniden başlatmak gerekmez.
Dosya yoksa normal izleme sürer, istek karşılaştırmaya dahil edilmez. Geçersiz
dosya izlemeyi durdurmaz; aktivite akışında uyarı oluşturur. Profil en fazla
16 KB, rol sayısı en fazla 20 olabilir. Kimlik/sürüm/rol/agent/görev kümesi
alanlarında en fazla 80 harf, rakam, nokta, alt çizgi veya tire kullan.
Dosyaya anahtar, sistem prompt’u veya sır ekleme; yalnızca belirtilen alanlar alınır.

## Model veya workflow değiştiğinde

- **Yalnızca model değişiyorsa:** Pi’de ilgili agent’ın modelini değiştir.
  Dashboard gözlenen model kimliklerini ayırır; profil sürümünü sırf model
  değiştiği için artırmak gerekmez.
- **Adımlar, rol sorumlulukları, araç izinleri veya retry politikası değişiyorsa:**
  profilin `version` alanını artır. Dashboard bunları kendisi keşfedip
  sürümleyemez. Başka bir workflow için yeni `id` kullan.
- **Aynı test görevlerini karşılaştırıyorsan:** iki varyantta aynı `taskSet`
  değerini kullan; örneğin `streaming-regression-v1`. Görevler değişince bu
  etiketi de değiştir. Boş değer serbest görevleri belirtir. Bu etiket kullanıcı
  beyanıdır; görevlerin eşitliğini veya doğruluğunu bağımsız olarak doğrulamaz.

Profil her isteğe kopyalanır; dosyayı değiştirmek eski sonuçları değiştirmez.
Aynı isteğe çelişen profil olayları gelirse ilk profil korunur ve istek
karşılaştırma dışında bırakılır. Eski, profilsiz journal kayıtlarına geriye
dönük profil veya model ataması yapılmaz.

## Tablonun anlamı

Gruplar **proje + canlı/demo ayrımı + workflow id/sürüm + görev kümesi +
rol başına gözlenen model kümesi** ile ayrılır. Agent adının değişmesi, rol ve
gözlenen model aynıysa tek başına yeni grup oluşturmaz. Bir istek içinde
ana model veya alt agent modeli değişirse gözlenen bütün kimlikler korunur;
yalnızca son model yazılarak geçmiş silinmez. Talep edilen ama hiç gözlenmeyen
model başarıyla çalışmış sayılmaz. Gözlenmeyen rol boş model kümesiyle ayrı
kalır. Model listeleri yürütme sırasını göstermez.

Model kimlikleri Pi/alt agent olaylarında bildirildiği biçimde saklanır.
Örneğin pi-open-agents 0.1.22 bazı sonuçlarda sağlayıcı öneki olmadan model ID
döndürür. Dashboard bir sağlayıcı tahmin etmez; tam ve kısa kimliği otomatik
olarak aynı modele birleştirmez.

Tablo şunları gösterir:

- İstek sayısı, hata/iptal/sonuçsuz sayıları.
- Teknik tamamlanma oranı: tamamlanan / (tamamlanan + hata + iptal).
  Sonuçsuz istekler paydada veya başarıda yer almaz.
- Ortalama süre: ilk gözlenen `run.started` ile son `run.ended` arasındaki
  süre; yalnızca sonucu bilinen ve iki zaman kaydı da bulunan istekler.
- Ortalama bildirilen token: sonuçlanmış istekte elde bulunan input/output/
  cacheRead/cacheWrite toplamı. Kümülatif alt agent değeri çağrı başına bir kez
  sayılır. Eksik alanlar tam token tüketimiymiş gibi tamamlanmaz; ölçüm sayısı
  ayrıca gösterilir. Hiç token kaydı yoksa `—`, açık sıfır bildirimi varsa `0`.
- JUnit raporu bulunan istek sayısı; her test kimliği kümesi için raporda geçen,
  başarısız ve belirsiz istek sayıları. Farklı test kümeleri aynı başarı oranında
  birleştirilmez. Aynı kümenin kopyaları istek başına bir kez sayılır; çelişen
  sonuçlarda başarısız rapor kazanır. Boş/yalnız atlanmış rapor belirsizdir.

Görev kümesi filtresi aynı iş yükünün varyantlarını yan yana incelemeyi sağlar.
Tablo JUnit dosyasında gözlenen sonuçları ayrı gösterir; testlerin çalıştırılmasını
ve güncel koda ait olmasını doğrulamaz. Kalite, fatura, abonelik kotası veya
otomatik “en iyi model” puanı üretmez. [Rapor ekleme ve sınırlar](EVIDENCE.md).
Retention nedeniyle yalnızca elde tutulan istekleri kapsar;
kalıcı, sonsuz bir benchmark arşivi değildir.

Profil dosyası ve karşılaştırma ekranı **görev başlatmaz veya model yönlendirmez**.
Yürütme ve yetkiler Pi’de, aşama ilerlemesi `workflow_report` bildirimlerinde kalır.

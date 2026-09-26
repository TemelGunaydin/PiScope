# JUnit test raporları

Dashboard, agent'ın “testler geçti” yanıtından ayrı olarak gerçek bir rapor
dosyasını okuyabilir. Bu bir **rapor içe aktarma** akışıdır: test çalıştırmaz,
shell komutu yürütmez, proje dizinini taramaz veya raporları otomatik bulmaz.

## Kullanım

1. İzleme eklentisini proje kopyasında güncelle ve Pi'de `/reload` kullan.
2. Pi'de isteğini çalıştır. Test aracının JUnit XML raporunu bu istek başladıktan
   sonra proje içindeki bir dosyaya yazmasını sağla.
3. İstek bittikten sonra, yeni bir isteğe geçmeden aynı Pi oturumunda çalıştır:

   ```text
   /dashboard-evidence reports/junit.xml
   ```

Boşluklu dosya adları da desteklenir:

```text
/dashboard-evidence "test reports/results.xml"
```

Komut yalnızca son tamamlanan isteğe rapor bağlar. `/reload`, oturum değişimi
veya Pi yeniden başlatma sonrasında eski isteğe geriye dönük bağlama yapılmaz.
Önceden eklenmiş rapor özetleri journal ve offline kuyrukta korunur.
Raporun bu istekten eski olması, proje dışına çıkması (symlink dahil), dosyanın
okunurken değişmesi, 2 MiB'ı aşması veya XML'in geçersiz olması içe aktarmayı
durdurur. Hata Pi'de gösterilir; başarılı test sonucu uydurulmaz.

Bu komut bir model aracı olarak kaydedilmez; `workflow_report` hâlâ yalnızca
plan bildirir. Komutun verilmesi belirtilen dosyanın okunmasına izin verir.
Bir isteğe en fazla 20 ayrı rapor dosyası bağlanabilir. Dashboard kapalıyken
özet kalıcı kuyruğa alınır; kuyruk veya disk yazımı başarısızsa komut bunu bildirir.

## Desteklenen raporlar

UTF-8 JUnit XML'in `testsuites` / `testsuite` / `testcase` yapısı desteklenir.
İç içe suite'ler, `failure`, `error`, `skipped`, properties ve metin/CDATA
çıktıları okunur. Sayaçlar gerçek `testcase` kayıtlarından türetilir; suite/root
üzerinde toplam verilmişse kayıtlarla uyuşması gerekir. Yalnız özet sayaçları
bulunan, testcase içermeyen pozitif toplamlı raporlar kabul edilmez.

DTD, harici entity, namespace'li farklı şemalar ve `flakyFailure` gibi
desteklenmeyen sonuç uzantıları reddedilir. Bu sürüm bütün JUnit türevlerini
desteklediğini iddia etmez. Node'un yerleşik JUnit reporter'ının gerçek başarılı,
başarısız ve atlanmış test çıktıları doğrulandı. `xcresult` ve doğrudan test
komutu/exit-code yakalama bu sürüme dahil değildir.

Ham XML, test isimleri, assertion mesajları, stack trace, stdout/stderr ve
properties içerikleri saklanmaz. Saklananlar: maskelenmiş proje-göreli dosya adı,
SHA-256 özeti, dosya boyutu/değişiklik zamanı, içe aktarma zamanı, test sayıları
ve test kimliklerinin SHA-256 özeti. Dosya kopyası dashboard'a gönderilmez.

## Sonuçların anlamı

- Hata veya failure varsa rapor başarısızdır.
- En az bir geçen test ve hiç hata/failure yoksa “Raporda geçti” görünür.
  Atlanan test sayısı ayrıca gösterilir.
- Boş veya yalnızca atlanmış test içeren rapor belirsizdir. Rapor yokluğu
  başarı veya sıfır test sonucu sayılmaz.
- Bir dosyanın yeniden içe aktarılması o dosyanın görünen özetini değiştirir;
  önceki özetler elde tutulan olay geçmişinde kalır.
- Karşılaştırmada aynı test kimliği kümesi bir istek için bir kez sayılır.
  Aynı kümenin bir kopyası geçip diğeri kalmışsa başarısız olan kazanır.
  Farklı test kümeleri ayrı satırlarda gösterilir; tek başarı oranına karıştırılmaz.

Test kümesi kimliği, sıralanmış suite adları + classname + testcase adlarından
oluşur. İsimler aynıysa kimlik aynıdır; bu **test kodunun, girdilerinin veya
ortamın aynı olduğunu kanıtlamaz**. `taskSet` de kullanıcı tanımlı bir etikettir.

Dosya özeti okunan içeriği tanımlar; dosya değiştirme zamanı eski raporların
yanlışlıkla bağlanmasını önler. Bunlar raporun güvenilir bir runner tarafından
üretildiğine, güncel commit'in test edildiğine veya görevin doğru tamamlandığına
dair imza değildir. Kimlikli API istemcileri güvenilen yerel veri üreticileridir.
Tam bağımsız yürütme doğrulaması için runner/commit bağlamı ayrıca gerekir.
Rapor sonuçları teknik tamamlanma oranını veya model kalite puanını değiştirmez.

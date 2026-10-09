# Yol haritası

Tamamlanan temel ve sonraki geliştirme adayları aşağıda ayrı gösterilir.

## Tamamlanan doğrulama ve karşılaştırma temeli

Mac / Pi 0.87.1 / pi-open-agents 0.1.22 ile Sol → MiMo → DeepSeek → Sol akışı,
izole salt okunur görevde gerçek sağlayıcı çağrılarıyla doğrulandı. Başarı ve
eksik model hatası kayıtları uyumluluk fixture’larına eklendi. Node 26 SSE
testlerinin ağ parçasını olay sanma hatası giderildi. `npm run test:pi` model
çağrısı yapmadan gerçek eklenti yükleme ve bağlantıyı doğrular.

Modelden bağımsız workflow profili, istek başına profil/model geçmişi ve
görev kümesi filtreli yürütme karşılaştırması eklendi. Kullanım:
[WORKFLOWS.md](WORKFLOWS.md). Farklı iş yüklerinin sonuçlarını kalite kıyası
saymadan önce ortak görev kümesi ve bağımsız test kanıtı gerekir.

Kalıcı offline kuyruk tamamlandı: disk üzerinde olay başına atomik kayıt,
süreç kapanması/çökmesi sonrası kurtarma, üretici başına teslimat sırası,
onaydan sonra silme, kapasite sınırları ve görünür kuyruk/karantina sayaçları.
Gerçek Pi'de dashboard kapalıyken kayıt ve sonraki Pi sürecinden teslimat
doğrulandı. Ayrıntılar: [VERIFICATION.md](VERIFICATION.md).

JUnit rapor içe aktarma tamamlandı: açık Pi komutu, güncel/proje içi dosya
kontrolü, gerçek testcase sayımı, kalıcı rapor özeti ve test kümesi başına
workflow karşılaştırması. Agent beyanlarından ve teknik tamamlanmadan ayrı
tutulur. Runner/commit doğrulaması yerine geçmez. [EVIDENCE.md](EVIDENCE.md).
Arayüz açık ve sade tasarıma geçirildi; büyük metin ve açılır yürütme ayrıntıları
masaüstü/mobil tarayıcıda doğrulandı.

Proje hafızası tamamlandı: aynı projenin sekmelerini birleştiren **My projects**,
son istek/yanıt, bildirilen bekleyen adım, son çalışma zamanı ve 7+ gün filtresi.
Kısa özetler ayrıntılı kayıtların saklama sınırından bağımsız korunur; arayüz
projenin tamamlandığını veya bildirilmemiş bir sonraki görevi tahmin etmez.
[Kapsam ve saklama kuralları](PROJECTS.md).

Terminal Todos ilk dilimi tamamlandı: opt-in salt okunur not görüntüleme, açık
etiket → proje kimliği bağı, tek kullanımlık hedef ve Other üzerinden düzenleme/
onaylı tek-proje gönderimi. Kaynak notlar değiştirilmez veya otomatik tamamlanmaz;
[kurulum ve sınırlar](TERMINAL-TODOS.md).

## Sonraki işler

Yürütme performansı ölçümünün ilk dilimi eklendi (teknik tamamlanma / sonuçsuz
ayrımı, çağrı bazlı süre, proje geçmişi toplamı). Sıradaki adımlar:

- Test runner/exit-code ve commit bağlamıyla yürütme kanıtını güçlendirme; gerekirse xcresult adapter'ı.
- Yeni Pi/alt agent sürümleri ve farklı sağlayıcı hata biçimleri için uyumluluk fixture’larını genişletme.
- Ayrı tüm-journal dışa aktarma, arama ve saklama sınırı arayüzü.
- İhtiyaç ve açık onayla telefondan not ekleme veya iki yönlü TODO düzenleme;
  mevcut Terminal Todos dilimi yalnız okuma ve düzenlenebilir/onaylı prompt gönderimidir.
- Gerekiyorsa deterministik workflow state machine; sınırlı retry ve iptal.
- Workflow karşılaştırmasına doğrulanabilir maliyet verisi ekleme.
- Ayrı testlerle OpenCode/OMP adapter’ları.

Onaylı prompt gönderimi varsayılan salt izleme davranışından ayrı, opt-in bir
güven sınırıdır. Model routing, otomatik retry ve otomatik commit kapsam dışıdır.

# Yol haritası

Bunlar mevcut özellik değil, sonraki geliştirme adaylarıdır.

## Bir sonraki doğrulama

Gerçek Mac kurulumunda `pi --version` ve `pi-open-agents` sürümünü kaydet.
Qwen → MiMo → Sol akışını gerçek bir test repository’sinde çalıştır. Her
subagent’ın model kimliğini ve araç durumunu terminalle karşılaştır. Eksik olay
varsa sağlayıcıya özel değil, harness event şemasına uygun adapter düzeltmesi yap.

## Sonraki işler

Yürütme performansı ölçümünün ilk dilimi eklendi (teknik tamamlanma / sonuçsuz
ayrımı, çağrı bazlı süre, proje geçmişi toplamı). Sıradaki adımlar:

- Gerçek subagent hatalarında ve custom provider modellerinde uyumluluk fixture’ları.
- Test komutlarını/junit/xcresult çıktısını açık izinle okuyan kanıt adapter’ı.
- Kalıcı offline spool, teslimat sırası ve geri basınç metrikleri.
- Ayrı tüm-journal dışa aktarma, arama ve saklama sınırı arayüzü.
- Proje bazlı TODO düzenleme ve açık kullanıcı onaylı görev çalıştırma.
- Gerekiyorsa deterministik workflow state machine; sınırlı retry ve iptal.
- Ölçülmüş sonuçlarla model karşılaştırma; bilinmeyen maliyeti sıfır saymama.
- Ayrı testlerle OpenCode/OMP adapter’ları.

Görev başlatma, model routing, retry politikası ve otomatik commit gibi yazıcı
özellikler, yalnızca izleyen bu sürümden ayrı bir güvenlik sınırı gerektirir.

# Doğrulama kaydı

Tarih: 2026-09-25

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

Demo ve UI:

```bash
npm start
# ikinci terminal:
npm run demo -- --hold
npm run open
```

Headless UI kontrolü isteğe bağlıdır; Python Playwright ve Chromium gerektirir:

```bash
python test/browser-smoke.py
```

Bu Python testi de görüntü/UI davranışını fixture replay ile sınar;
gerçek browser-network E2E testi olduğunu iddia etmez.

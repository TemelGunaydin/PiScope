# Mimari

```text
Kod projesi / Mac
  Pi + mevcut orchestrator, Qwen ve MiMo agent’ları
    └─ .pi/extensions/agent-dashboard/
         ├─ salt gözlem: session / prompt / model / tool / message
         ├─ pi-open-agents: structured progress / results
         └─ workflow_report: agent’ın bildirdiği plan
                │
                │ HTTP POST /api/events + yerel bearer anahtarı
                ▼
  Node.js collector · 127.0.0.1:7331
    ├─ event validation + safe-field projection + redaction
    ├─ idempotent event IDs
    ├─ private rotating JSONL journal
    ├─ in-memory bounded session/run view
    └─ authenticated SSE snapshots
                │
                ▼
  Yerel HTML / CSS / JavaScript arayüzü
```

## Sınırlar

Dashboard bir orchestrator değildir. Kod deposuna shell çalıştırma, model
seçme, commit/push, task başlatma veya test başlatma API’si yoktur. Bu işlemler
Pi’de kalır. Web arayüzü yalnızca gözlem, filtreleme, tema ve dışa aktarma yapar.

Ana oturum model değişimi ile alt agent delegasyonu farklı olaylardır.
`agent.started` istek gönderildiğini bildirir; child model ancak yapılandırılmış
ilerleme/sonuçta görünürse gözlenmiş sayılır. Per-call override varsa ilk değer
`requested`, ilerleme gelince `observed` kaynağıyla saklanır.

`pi-open-agents` dışındaki paketlerin bütün `task` şemaları desteklenmez. Şu anda
`subagent` tool adı ve `details.agent/model/status/tools/usage` sözleşmesi
uyarlanmıştır. Bilinmeyen tools yine normal araç olayı olarak gösterilir; başka
bir paketin sonucuna hayalî agent/model etiketleri takılmaz.

`workflow.updated` kayıtları her zaman `reported` kaynaklıdır. Aşama bildirimi
ile araç gözlemi birbirinin yerine geçmez. Kullanıcı notu, test kanıtı veya agent
raporu bağımsız bir doğrulama sonucuymuş gibi yükseltilmez.

## Teslimat ve yeniden bağlanma

Pi tarafında ağ çağrıları model/tool callback’lerini bekletmez. En fazla 500
olaylık kuyruk 350 ms aralıklarla boşaltılır; paket başına 8 olay, 900 ms HTTP
zaman aşımı, 10 saniyeye kadar artan retry vardır. Kuyruk sınırında en eski
olay düşer ve bırakılan olay sayısı görünür. Normal çıkışta sınırlı süreyle flush
denenir; process çökmesinde bellekteki olaylar kaybolur.

Server alımı doğrular, diske ekler, ardından cevap döner. Event UUID tekrarı
aynı çalışma sürecinde/elde tutulan journal aralığında yeniden sayılmaz; UUID
seti de sınırlıdır, sonsuz global dedup garantisi değildir.

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

## API

| Yol | İşlem | Erişim |
|---|---|---|
| `/health` | Sürüm / erişilebilirlik | Loopback + Host kontrolü |
| `/api/login` | Fragment token ile eşleştirme | JSON; geçerli token |
| `/api/events` POST | 1–40 olay alımı | Bearer; 256 KB body sınırı |
| `/api/events` GET | SSE snapshot yayını | Bearer veya HttpOnly cookie |
| `/api/state` GET | Güncel bounded görünüm | Bearer veya cookie |
| `/api/export` GET | Görünümü JSON indir | Bearer veya cookie |

Sunucu başka host’a bind edilemez; bu sürüm reverse proxy, Tailscale paylaşımı,
çok kullanıcılı erişim veya uzaktan yönetim için tasarlanmadı.

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

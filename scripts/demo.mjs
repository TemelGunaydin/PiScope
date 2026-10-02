import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDirectory } from '../src/config.mjs';

const speed = process.argv.includes('--fast') ? 0 : 550;
const hold = process.argv.includes('--hold');
const fail = process.argv.includes('--error');
let cfg;
try { cfg = JSON.parse(readFileSync(join(dataDirectory(), 'connection.json'), 'utf8')); }
catch { console.error('Start the dashboard in another terminal with npm start first.'); process.exit(1); }
const endpoint = new URL(cfg.url);
if (!['127.0.0.1', 'localhost'].includes(endpoint.hostname) || endpoint.protocol !== 'http:') throw new Error('Demo only connects to loopback');
const sessionId = `demo-${randomUUID()}`, runId = randomUUID();
// Labels, tokens, elapsed times and results below are explicitly simulated, not model claims.
const sol = 'demo/sol', mimo = 'demo/mimo', deepseek = 'demo/deepseek';
const stages = [
  { id: 'plan', title: 'Planı oluştur', agent: 'Sol', model: sol, status: 'running' },
  { id: 'implement', title: 'Düzeltmeyi uygula', agent: 'MiMo', model: mimo, status: 'pending' },
  { id: 'review', title: 'İlk incelemeyi yap', agent: 'DeepSeek', model: deepseek, status: 'pending' },
  { id: 'verify', title: 'Son doğrulamayı yap', agent: 'Sol', model: sol, status: 'pending' }
];
async function send(type, data = {}, hasRun = true) {
  const response = await fetch(new URL('/api/events', endpoint), {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` },
    body: JSON.stringify({ schemaVersion: 1, id: randomUUID(), type, time: new Date().toISOString(), sessionId,
      projectId: 'demo-swift-project', projectName: 'Swift Playground', runId: hasRun ? runId : undefined, demo: true, data })
  });
  if (!response.ok) throw new Error(await response.text());
  if (speed) await new Promise(r => setTimeout(r, speed));
}
await send('session.connected', { model: sol }, false);
await send('prompt.received', { prompt: 'Streaming buffer’daki yarış durumunu bul. Mevcut mimariyi koruyarak düzelt, testleri çalıştır ve değişiklikleri incele.' });
await send('workflow.configured', { workflow: { schemaVersion: 1, id: 'implement-review', version: '1', label: 'Uygulama ve bağımsız inceleme', taskSet: 'demo-streaming-buffer', roles: [{ role: 'implementation', agent: 'mimo' }, { role: 'review', agent: 'deepseek' }] } });
await send('run.started', { model: sol });
await send('workflow.updated', { stages, reason: 'Sol kapsamı belirler; MiMo uygular, DeepSeek ilk incelemeyi yapar, Sol doğrular.' });
await send('message.completed', { model: sol, summary: 'Plan hazır. MiMo buffer erişimini ve ilgili testleri güncelleyecek.', usage: { input: 2600, output: 720 } });
stages[0].status = 'done'; stages[1].status = 'running';
await send('workflow.updated', { stages, reason: 'MiMo, onaylanan kapsamda düzeltmeyi uyguluyor.' });
await send('agent.started', { agentCallId: 'demo-code', agent: 'mimo', task: 'Buffer erişimini seri hale getir. Eşzamanlı erişim için regresyon testi ekle.' });
await send('agent.progress', { agentCallId: 'demo-code', agent: 'mimo', model: mimo, source: 'observed', status: 'running', elapsedMs: 18200, usage: { input: 12300, output: 2100 }, tools: [{ id: 'c1', name: 'read', file: 'Sources/StreamingBuffer.swift', status: 'done' }, { id: 'c2', name: 'edit', file: 'Sources/StreamingBuffer.swift', status: 'running' }] });
await send('agent.finished', { agentCallId: 'demo-code', agent: 'mimo', model: mimo, isError: fail, source: 'observed', elapsedMs: 41200,
    summary: fail ? 'ÖRNEK: Derleme hatası alındı; görev tamamlanmadı.' : 'ÖRNEK: İki dosya güncellendi. Test komutu çalıştırıldı; sonuç son kontrolde değerlendirilmeli.',
    usage: { input: 16600, output: 3100 }, tools: [{ id: 'c1', name: 'read', status: 'done' }, { id: 'c2', name: 'edit', file: 'Sources/StreamingBuffer.swift', status: 'done' }, { id: 'c3', name: 'bash', status: 'done' }] });
stages[1].status = fail ? 'error' : 'done'; stages[2].status = fail ? 'blocked' : 'running';
if (fail) stages[3].status = 'blocked';
await send('workflow.updated', { stages, reason: fail ? 'Uygulama başarısız. İnceleme başlamadı.' : 'MiMo sonuç döndürdü. DeepSeek ilk incelemeyi yapıyor.' });
if (!fail) {
  await send('agent.started', { agentCallId: 'demo-review', agent: 'deepseek', task: 'MiMo değişikliklerini somut hata ve regresyonlar için incele.' });
  await send('agent.progress', { agentCallId: 'demo-review', agent: 'deepseek', model: deepseek, source: 'observed', status: 'running', elapsedMs: 4200, tools: [{ id: 'r1', name: 'read', file: 'Sources/StreamingBuffer.swift', status: 'running' }] });
}
if (!hold || fail) {
  if (!fail) {
    await send('agent.finished', { agentCallId: 'demo-review', agent: 'deepseek', model: deepseek, source: 'observed', isError: false, elapsedMs: 8400, summary: 'ÖRNEK: İlk inceleme tamamlandı; Sol bağımsız doğrulama yapacak.', usage: { input: 8400, output: 1320 }, tools: [{ id: 'r1', name: 'read', file: 'Sources/StreamingBuffer.swift', status: 'done' }] });
    stages[2].status = 'done'; stages[3].status = 'running';
    await send('workflow.updated', { stages, reason: 'DeepSeek sonuç döndürdü. Sol bağımsız doğrulama yapıyor.' });
    await send('tool.started', { toolCallId: 'demo-diff', toolName: 'read', model: sol, file: 'Tests/StreamingBufferTests.swift' });
    await send('tool.finished', { toolCallId: 'demo-diff', toolName: 'read', model: sol, file: 'Tests/StreamingBufferTests.swift', isError: false });
    stages[3].status = 'done'; await send('workflow.updated', { stages, reason: 'Demo akışında inceleme tamamlandı. Bunlar gerçek doğrulama sonuçları değildir.' });
  }
  await send('run.ended', { outcome: fail ? 'error' : 'idle', summary: fail ? 'Demo: İş başarısız senaryoyla durduruldu.' : 'Demo akışı tamamlandı. Gerçek görev, kod değişikliği veya model API çağrısı yapılmadı.' });
  await send('run.settled');
}
console.log('Simulated events sent for collector testing (hidden from the live dashboard). No model was called.');

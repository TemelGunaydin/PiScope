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
const sol = 'demo/sol', qwen = 'demo/qwen3-coder-next', mimo = 'demo/mimo';
const stages = [
  { id: 'plan', title: 'Planı oluştur', agent: 'Sol', model: sol, status: 'running' },
  { id: 'explore', title: 'Kod tabanını incele', agent: 'Qwen', model: qwen, status: 'pending' },
  { id: 'implement', title: 'Düzeltmeyi uygula', agent: 'MiMo', model: mimo, status: 'pending' },
  { id: 'review', title: 'Son değişiklikleri incele', agent: 'Sol', model: sol, status: 'pending' }
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
await send('run.started', { model: sol });
await send('workflow.updated', { stages, reason: 'Önce kapsamı belirle; araştırmayı Qwen’e, uygulamayı MiMo’ya ver.' });
await send('message.completed', { model: sol, summary: 'Plan hazır. Qwen buffer kullanımlarını ve mevcut testleri inceleyecek.', usage: { input: 2600, output: 720 } });
stages[0].status = 'done'; stages[1].status = 'running';
await send('workflow.updated', { stages });
await send('agent.started', { agentCallId: 'demo-explore', agent: 'qwen', task: 'Streaming buffer kullanımlarını ve ilgili testleri bul.' });
await send('agent.progress', { agentCallId: 'demo-explore', agent: 'qwen', model: qwen, source: 'observed', status: 'running', tools: [{ id: 'r1', name: 'read', file: 'Sources/StreamingBuffer.swift', status: 'running' }] });
await send('agent.finished', { agentCallId: 'demo-explore', agent: 'qwen', model: qwen, source: 'observed', isError: false, elapsedMs: 8400, summary: 'Buffer.swift ve BufferTests.swift ilgili. Aynı buffer’a iki görev erişiyor.', usage: { input: 8400, output: 1320 }, tools: [{ id: 'r1', name: 'read', file: 'Sources/StreamingBuffer.swift', status: 'done' }, { id: 'r2', name: 'grep', file: 'Tests', status: 'done' }] });
stages[1].status = 'done'; stages[2].status = 'running';
await send('workflow.updated', { stages, reason: 'Araştırma bitti. MiMo, onaylanan kapsamda düzeltmeyi uyguluyor.' });
await send('agent.started', { agentCallId: 'demo-code', agent: 'mimo', task: 'Buffer erişimini seri hale getir. Eşzamanlı erişim için regresyon testi ekle.' });
await send('agent.progress', { agentCallId: 'demo-code', agent: 'mimo', model: mimo, source: 'observed', status: 'running', elapsedMs: 18200, usage: { input: 12300, output: 2100 }, tools: [{ id: 'c1', name: 'read', file: 'Sources/StreamingBuffer.swift', status: 'done' }, { id: 'c2', name: 'edit', file: 'Sources/StreamingBuffer.swift', status: 'running' }] });
if (!hold) {
  await send('agent.finished', { agentCallId: 'demo-code', agent: 'mimo', model: mimo, isError: fail, source: 'observed', elapsedMs: 41200,
    summary: fail ? 'ÖRNEK: Derleme hatası alındı; görev tamamlanmadı.' : 'ÖRNEK: İki dosya güncellendi. Test komutu çalıştırıldı; sonuç son kontrolde değerlendirilmeli.',
    usage: { input: 16600, output: 3100 }, tools: [{ id: 'c1', name: 'read', status: 'done' }, { id: 'c2', name: 'edit', file: 'Sources/StreamingBuffer.swift', status: 'done' }, { id: 'c3', name: 'bash', status: 'done' }] });
  stages[2].status = fail ? 'error' : 'done'; stages[3].status = fail ? 'blocked' : 'running';
  await send('workflow.updated', { stages, reason: fail ? 'Uygulama başarısız. İnceleme başlamadı.' : 'MiMo sonuç döndürdü. Sol şimdi değişiklikleri inceliyor.' });
  if (!fail) {
    await send('tool.started', { toolCallId: 'demo-diff', toolName: 'read', model: sol, file: 'Tests/StreamingBufferTests.swift' });
    await send('tool.finished', { toolCallId: 'demo-diff', toolName: 'read', model: sol, file: 'Tests/StreamingBufferTests.swift', isError: false });
    stages[3].status = 'done'; await send('workflow.updated', { stages, reason: 'Demo akışında inceleme tamamlandı. Bunlar gerçek doğrulama sonuçları değildir.' });
  }
  await send('run.ended', { outcome: fail ? 'error' : 'idle', summary: fail ? 'Demo: İş başarısız senaryoyla durduruldu.' : 'Demo akışı tamamlandı. Gerçek görev, kod değişikliği veya model API çağrısı yapılmadı.' });
  await send('run.settled');
}
console.log('Simulated events sent. Open the dashboard and select Demo. No model was called.');

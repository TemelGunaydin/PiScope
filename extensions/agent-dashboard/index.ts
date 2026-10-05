// Pi provides TypeBox to its extensions. Current Pi uses "typebox".
// Legacy installations using @sinclair/typebox are supported by the fallback.
import { registerMonitor } from './monitor.mjs';

export default async function (pi: any) {
  let schema: any, reportSchema: any;
  try {
    let module: any;
    try { module = await import('typebox'); }
    catch { module = await import('@sinclair/typebox'); }
    const T = module.Type;
    reportSchema = T.Object({ requestId: T.String({ minLength: 1, maxLength: 160 }), summary: T.String({ minLength: 1, maxLength: 2400 }), remaining: T.Optional(T.String({ maxLength: 800 })) });
    schema = T.Object({
      reason: T.Optional(T.String({ description: 'Why the workflow changed; no secrets' })),
      accomplishments: T.Optional(T.Array(T.String({ minLength: 1, maxLength: 240, description: 'Brief outcome actually achieved; an agent report, not independent verification' }), { maxItems: 5 })),
      recommendations: T.Optional(T.Array(T.Object({
        id: T.String(), title: T.String({ maxLength: 240 }), prompt: T.String({ minLength: 1, maxLength: 4000 })
      }), { maxItems: 5 })),
      stages: T.Array(T.Object({
        id: T.String(), title: T.String(),
        agent: T.Optional(T.String()), model: T.Optional(T.String()),
        status: T.Union(['pending', 'running', 'done', 'error', 'blocked', 'cancelled'].map(s => T.Literal(s)))
      }), { minItems: 1, maxItems: 20 })
    });
  } catch {
    // Basic monitoring still works. Warn clearly rather than inventing a tool.
    pi.on('session_start', (_e: any, ctx: any) => {
      ctx.ui?.notify?.('PiScope: workflow_report unavailable (TypeBox not resolved). Basic monitoring remains enabled.', 'warning');
    });
  }
  registerMonitor(pi, { schema, reportSchema });
}

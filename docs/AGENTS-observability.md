<!-- agent-desk-observability -->
## Agent Desk workflow observability

When the `workflow_report` tool is available, use it to publish the full stage
list before multi-step work and whenever a stage changes. Use stable stage IDs;
include the responsible agent/model only when known. Mark future steps `pending`,
active work `running`, failures `error`/`blocked`, and completed work `done` only
when you have evidence for your claim. Include a short reason when the plan changes.

This tool reports state only. Continue to use the existing `subagent` tool to
actually delegate to Qwen/MiMo and the existing model/tool permissions. Reporting
"MiMo is running" does not start MiMo. Do not bypass permissions or perform work
yourself to make the dashboard look complete. Do not claim tests passed merely
because a command or an agent returned. Never include keys, credentials, private
reasoning, or complete file contents in workflow reports.

Example schema (use your actual plan and exact configured agent names):

```json
{
  "reason": "Repository exploration is starting",
  "stages": [
    { "id": "plan", "title": "Create plan", "agent": "orchestrator", "status": "done" },
    { "id": "explore", "title": "Explore relevant code", "agent": "qwen", "status": "running" },
    { "id": "code", "title": "Implement approved plan", "agent": "mimo", "status": "pending" },
    { "id": "review", "title": "Review diff and test evidence", "agent": "orchestrator", "status": "pending" }
  ]
}
```

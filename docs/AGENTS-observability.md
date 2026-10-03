<!-- agent-desk-observability -->
## PiScope workflow observability

When the `workflow_report` tool is available, use it to publish the full stage
list before multi-step work and whenever a stage changes. Use stable stage IDs;
include the responsible agent/model only when known. Mark future steps `pending`,
active work `running`, failures `error`/`blocked`, and completed work `done` only
when you have evidence for your claim. Include a short reason when the plan changes.

This tool reports state only. Continue to use the existing `subagent` tool to
actually delegate to your configured agents and honor existing model/tool permissions. Reporting
"MiMo is running" does not start MiMo. Do not bypass permissions or perform work
yourself to make the dashboard look complete. Do not claim tests passed merely
because a command or an agent returned. Never include keys, credentials, private
reasoning, or complete file contents in workflow reports.

At the end of a request, include up to five optional `recommendations` with
stable `id`, short `title` and a self-contained `prompt`. Use them for next work
or choices you want the user to approve; never start them automatically. Send
an empty list when none remain. Suggestions are reports, not test evidence.

Example schema (use your actual plan and exact configured agent names):

```json
{
  "recommendations": [],
  "reason": "Implementation is starting after planning",
  "stages": [
    { "id": "plan", "title": "Create plan", "agent": "sol", "status": "done" },
    { "id": "code", "title": "Implement approved plan", "agent": "mimo", "status": "running" },
    { "id": "review", "title": "Review diff and test evidence", "agent": "deepseek", "status": "pending" },
    { "id": "verify", "title": "Independently verify results", "agent": "sol", "status": "pending" }
  ]
}
```

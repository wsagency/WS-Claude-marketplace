<!-- WS-MANAGED:triage-labels:START -->
# Triage Labels

The five semantic triage roles are configured at `triage.labels` in `.wsagency/config.yaml`. Consumers must read those mappings instead of duplicating label strings here:

| Semantic role | Configuration key | Meaning |
| --- | --- | --- |
| Needs triage | `triage.labels.needs_triage` | A maintainer must evaluate the request. |
| Needs information | `triage.labels.needs_info` | More information is required from the reporter. |
| Ready for agent | `triage.labels.ready_for_agent` | Fully specified and safe for autonomous implementation. |
| Ready for human | `triage.labels.ready_for_human` | Human implementation or judgment is required. |
| Won't fix | `triage.labels.wontfix` | The request will not be actioned. |
<!-- WS-MANAGED:triage-labels:END -->

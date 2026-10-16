# How to read the roster

The list of agents is NOT written here: it is generated from the installed plugins into
`roster.json` and served live by the server. Never answer "which agents exist" from memory.

- `agentos_overview.roster`: all plugins, with each agent's short description (<=160 chars), `model`,
  `in_active_team`, `working_now`, `open_tasks`; plus `totals` and `not_in_active_team` (installed but not in the
  active team).
- `agentos_roster {plugin?, agent?}`: full description and skills of one plugin or one agent. An unknown id returns
  an error that lists the valid ones.
- Plugin id = team (`marketing-team`, `dev-team`...). `agentos-core` is the system (you, Assistant — id `coo` — and your guide skills).
- `in_active_team: false` is not "unavailable": the agent is installed and the person adds it in the Equipos tab
  (create or edit a team, add the agent, activate). Only an agent missing from the roster needs a plugin install.

## Entry points (guidance the roster cannot derive)

Start a team's work with its lead; the lead delegates inside its team.

| Team (plugin) | Entry point | Notes |
|---|---|---|
| marketing-team | `cmo` | Full marketing cycle for the client's business. |
| sales-team | `sales-lead` | Sets up your offer + scoring rubric (`ventas/`), prepares replies to pasted messages or to your WhatsApp inbox (drafts only, the person sends), finds businesses on Google Maps (CSV + optional Leads), scores prospects, Leads Kanban, follow-up drafts, proposals. |
| collections-team | `collections-lead` | Portfolio, reconciliation, collection drafts. |
| executive-team | `ceo` (priorities, cross-area conflicts) / `cfo` (money) | Decisions the owner signs. |
| dev-team | `tech-lead` | Websites, stores and apps; splits work among its engineers. |

New plugins appear in the roster without editing this file; if one has a lead, read its description to find it.

## Recommending

1. Match the request to descriptions in the roster, not to agent names.
2. Request spanning teams: route to the lead of each plugin, say the order, one task per lead.
3. One recommendation (or two with the difference) per answer; do not list the whole roster.
4. If the best agent is `not_in_active_team`, say so and how to add it.

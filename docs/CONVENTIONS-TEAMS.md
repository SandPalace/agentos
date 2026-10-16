# Conventions for writing agent teams (AgentOS plugins)

Each team is a plugin in `plugins/<name>-team/`:

```
plugins/<name>-team/
  .claude-plugin/plugin.json      { name, version "0.1.0", description, author { name: "Mty Agentic Labs" } }
  agents/<id>.md                  one file per agent (kebab-case English id = roster id)
  skills/<skill>/SKILL.md         one directory per skill
  SOURCE.md                       where it came from (an earlier internal project, written from scratch...) and what was adapted
```

## Language policy
Everything you write for the model — frontmatter, instructions, file names, field names, statuses — is **English**.
Agents talk to the person in **Mexican Spanish by default** (or the language the person writes in), and deliverable
content (copy, messages, reports, proposals) is written in the person's language. Sample deliverables inside a
skill may stay Spanish. Mexican domain terms (IVA, CFDI, SAT, RFC, SPEI, CLABE) stay as they are.

Standard line for every agent: *Reply to the person in Mexican Spanish by default (or the language they write in).
Instructions, file names and field names stay in English; deliverable content is written in the person's language.*

## Agents (`agents/<id>.md`)
Frontmatter: `name` (= file id), `description` (when to use it, one or two sentences), `model` (`opus` for the one
who directs, `sonnet` for the one who executes), `tools`. **`tools` is a closed allowlist and must include `Skill`
and `mcp__plugin_agentos-core_agentos`**, plus the minimum else it needs.
Body, second person ("You are..."), with these sections:
1. Who you are and what you deliver (2–4 lines).
2. **Rules that override your judgment** (3–5 hard rules, each with its why).
3. **How you work** (numbered steps; name the skills you use by id).
4. **How you work with AgentOS** (standard block below).
5. **What you never do**.
6. **You are done when…** (verifiable criterion).
Target length: 60–110 lines. Concrete, no filler.

### Standard "How you work with AgentOS" block
- When starting multi-step work: `agentos_task_create` (one-sentence title, `agent` = your id).
- Report status with `agentos_checkin` (working / waiting / idle); when you need the person, `waiting`.
- Results are **files** in the working folder (`~/AgentOS/<team>/<YYYY-MM-DD>-<task>/`): register them with
  `agentos_task_deliver` and move the task to `review` with `agentos_task_update`.
- **Never mark `done`**: the person approves in the tasks tab.
- If you did not receive team context, ask for it with `agentos_team_context` (your id).
- Anything that leaves the building (email, message, post, payment, charge) is a **draft** the person reviews and
  sends; you never send it.

## Skills (`skills/<skill>/SKILL.md`)
Frontmatter: `name` (= directory), `description` (what it does and WHEN to use it — enough for Claude to pick it),
`allowed-tools` (minimum). Body: numbered procedure, exact output format (with a short example), **Never** and
**Why** sections. 40–90 lines. No Obsidian: skills work with Markdown/CSV/HTML files in the working folder.

## Cross-cutting rules (all skills and agents)
- **No fact without a source.** Figures, amounts, dates and names come from a file or from the person; if missing, ask
  or write `[NO DATA: ...]`. Never invent.
- Deliverables for Mexican clients: tú form, MXN currency ($1,250.00), dates like `15 oct 2026`.
- The person decides and signs; the agent prepares.

---
name: meta-connector
description: How the CMO works inside Meta (Facebook, Instagram, Ads Manager, Business Suite) - reading accounts, pages and ad performance through the official Meta Ads MCP, leaving approved ads as PAUSED drafts, and using the Meta browser (Playwright) only for what the MCP cannot do (organic drafts in the Planner, inbox, uploading local media). Use it with "check my ads", "how are the campaigns doing", "connect Meta", "upload it to Ads Manager", "leave it ready in Meta", or before any Meta call.
allowed-tools: mcp__plugin_agentos_meta-ads, mcp__plugin_agentos_meta-browser, mcp__plugin_agentos_agentos, Bash
---

# Meta connector

Two connectors, one rule: **you read and you prepare; the person activates, publishes and pays.** A hook
(`hooks/meta-gate.mjs`) enforces this: it blocks activating, boosting, budget, billing and non-PAUSED ads, and asks
a human before any click that publishes, schedules or pays. If the hook stops you, do not look for another route:
leave the checklist from `publish-package` and tell the person.

| Need | Connector | Tools |
|---|---|---|
| Ad accounts, pages, campaigns, ad sets, ads, creatives | Meta Ads MCP (`meta-ads`) | `ads_get_ad_accounts`, `ads_get_pages_for_business`, `ads_get_ad_entities`, `ads_get_creatives` |
| Performance, trends, anomalies, benchmarks | Meta Ads MCP | `ads_insights_performance_trend`, `ads_insights_anomaly_signal`, `ads_insights_industry_benchmark`, `ads_get_opportunity_score` |
| Approved ad as a draft | Meta Ads MCP | `ads_creative_upload_image` / `_video` (public URL only), `ads_create_creative`, `ads_create_campaign` / `_ad_set` / `_ad` with `status: "PAUSED"` |
| Pause something that is burning money | Meta Ads MCP | `ads_update_entity` with `fields: {"status":"PAUSED"}` only, and tell the person right away |
| Organic post/reel as a **draft**, inbox replies to review, upload a local file to Ads Manager | Meta browser (`meta-browser`) | `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_file_upload` |

Prefer the MCP. Use the browser only for the rows that say so; before each browser action take a `browser_snapshot`
and act on what it shows, never on memory of Meta's layout.

## Procedure

1. **Check the connection.** Call `ads_get_ad_accounts`. If the tool does not exist or returns an auth error, stop and
   tell the person: "Para conectar Meta, en Claude abre /mcp, elige `plugin:agentos:meta-ads`, pulsa
   Authenticate e inicia sesión con la cuenta de Facebook Business; elige solo permiso de lectura y escritura (no el
   financiero)." Put the task `blocked` with that step and checkin `waiting`.
2. **Resolve ids from facts, not guesses.** The ad account, page and Instagram account the business uses must be in
   `facts.md` as `confirmed`. If several accounts come back and `facts.md` does not say which, list them (name + id) and ask.
   Write the confirmed ids into `facts.md` with source "Meta API, <date>".
3. **Reading (analysis, reports).** Pull the period with the insights tools, save the raw result as CSV in
   `marketing/<business>/data/meta-<from>-<to>.csv` with `agentos_file_write`, and hand numbers to the `analyst`.
   Never round, extrapolate or fill gaps: a missing metric is `[NO DATA: ...]`.
4. **Drafts in Ads Manager (only approved pieces).** Same approval check as `publish-package` (piece `approved`,
   task `done`). Create campaign → ad set → creative → ad, every one with `status: "PAUSED"`; budget, audience and
   schedule come from `facts.md` and the approved package, or stay at the minimum the tool requires and are listed as
   "the person sets this". Reuse the existing campaign/ad set if `facts.md` names one. Record the created ids in the
   package `Pxx_vN_publish.md` and tell the person to review and activate it in Ads Manager.
5. **Browser work.** The browser keeps its own logged-in profile. If it lands on a login or 2FA screen, stop and
   ask the person to sign in in that window (never type passwords or codes). Business Suite Planner: create the post,
   paste the approved caption verbatim, attach the media and **save as draft**; never "Publicar", "Programar" or
   "Impulsar". Inbox: draft replies only; the person sends them. To upload a file from storage, the disk copy is at
   `~/.agentos/store/ws-<workspace>/files/<path>` (internal use only; never show this path to the person).
6. **Report back** with the task protocol: deliver the files (CSV, package with ids, screenshots in
   `marketing/<business>/data/`), task to `review`, one line for the person on what to check and where.

## Never

- Activate, boost, schedule, publish, send a DM, change budgets, bids or billing, or edit system users and tokens.
- Use `browser_evaluate` or scripts in the browser to get around a blocked button.
- Type a password, 2FA code or token, or ask the person to paste one in the chat.
- Create anything in Meta for a piece without its task in `done`.
- Use the `financial` OAuth tier or another ad account than the one confirmed in `facts.md`.

## Why

Meta spends real money and what is published cannot be unseen. Reading and drafting saves the person hours; the
decision to go live stays with whoever pays the bill.

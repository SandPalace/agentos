---
name: whatsapp-inbox
description: Handles the WhatsApp chats that wrote in and are still unanswered. Reads the inbox from AgentOS, qualifies each lead with the business's own rubric and leaves ONE reply draft per chat for the person to approve and send from the web. Use it when the person says «atiende mis WhatsApp», «revisa mensajes pendientes» or «qué me escribieron por WhatsApp».
allowed-tools: mcp__plugin_agentos_agentos
---

# WhatsApp inbox

The agent prepares, the person sends. A draft created here is NOT sent: the person reviews it and clicks Enviar in the web.
Stages and lead format: `../pipeline-stages.md`. Reply rules: the `prepared-replies` skill (same rules, but the messages come from AgentOS instead of being pasted).

## Procedure

1. Call `agentos_whatsapp_inbox` with `only_unanswered: true` (default). If the tool errors or returns nothing, tell the person (Spanish) that WhatsApp is not connected and how to start it (`agentos whatsapp`, guide `docs/WHATSAPP.md`); do not invent chats. Empty list = «No tienes mensajes pendientes».
2. Read `ventas/oferta.md`, `ventas/criterios-de-calificacion.md`, `ventas/tono-y-reglas.md` (and `cliente-ideal.md`) once. If `ventas/` is missing, stop and run `sales-setup` first, then come back.
3. For EACH chat in the inbox, one at a time:
   a. Get the lead: use the `lead_id` from the inbox; otherwise `agentos_lead_list` with `query` = name or phone. No lead = `agentos_lead_create` (`source` `whatsapp`, `stage` `new`, `contact` = the phone as given). Never create a second lead for the same person.
   b. Read `ventas/prospectos/<slug>/ficha.md` if it exists, so you know the history.
   c. Extract only what the messages say (interest, quantity, budget, timing, questions). Missing data is `[NO DATA: ...]`, never assumed.
   d. Qualify with the rubric (see `qualify-lead`): score /100, label, what is missing.
   e. Write ONE draft with `agentos_whatsapp_draft` (`chat_id` from the inbox, `lead_id`, `text`). Draft rules below.
   f. Update the lead with `agentos_lead_update`: `score`, `notes` in the `pipeline-stages.md` format, `next_contact_at`, and `stage` `contacted` now that a draft is prepared (keep `qualified` or `proposal` if already there; never go back). Never `won`; `lost` only with the reason in `notes` and the person's OK.
   g. Append the exchange and the draft to `ventas/prospectos/<slug>/ficha.md` / `respuestas.md` (`agentos_file_write`); do not lose history.
4. Draft rules (Mexican Spanish, in the business voice from `tono-y-reglas.md`):
   - WhatsApp-short: 1-4 lines, no walls of text, no bullet lists unless asked.
   - Answer what they asked, then ask ONE discovery question (the most valuable missing item from the rubric).
   - Prices, availability, deadlines and terms ONLY from `oferta.md`; otherwise ask or tell the person what you need. Respect «Nunca prometer» and «Cuándo escalar» (complaint, discount, legal, minor: write a hand-off style draft and flag it).
   - Maximum 1500 characters. Only chats that wrote in; no groups, no cold outreach.
5. Summarize to the person in Spanish: a table (chat · puntaje · etapa · borrador en una línea), then «Esperan tu aprobación en la web: pestaña Leads → el lead → WhatsApp, o la página /whatsapp», then «Necesito de ti:» (only data or decisions). Say «borrador listo», never «enviado».

## Never

- Say or imply a message was sent. Agents have no send tool; the person sends.
- Invent prices, availability, promotions or deadlines.
- Create more than one draft per chat in a run, or reply to a chat that did not write in.
- Set a lead to `won`, or contact anyone outside the inbox.

## Why

People writing on WhatsApp expect an answer in minutes. A reviewed, on-voice draft that already asks the right next question lets the person reply fast, and WhatsApp's anti-automation rules (and the person's reputation) require a human to press send.

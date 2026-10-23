---
name: payment-reminder
description: Drafts a payment reminder or collection message (email or WhatsApp) with an escalating tone based on the invoice's days overdue. Use it when there are upcoming or overdue invoices that require contacting the client; the message is never sent.
allowed-tools: Bash, mcp__plugin_agentos_agentos
---

# Payment reminder

## Procedure

1. **Gather the data** from the source (`agentos_file_read`): client, contact, folio(s), amount, due date, payment details
   (beneficiary, bank, CLABE) and the person's contact email. Anything missing: "no data" and ask.
2. **Confirm it is not paid** (reconciliation or the person). A payment counts only if it is on the bank
   statement.
3. **Calculate days overdue** = today's date - due date (with `date` or python).
4. **Choose the level:**
   - **N0 friendly** (due in 3 days, or 1-7 days overdue): assume it was forgotten.
   - **N1 firm reminder** (8-30 days): ask for a specific payment date.
   - **N2 follow-up** (31-60): summarize invoices, ask for a reply or date within 3 business days.
   - **N3 final notice** (60+): ask for contact to agree on payment; state that the person will review the case.
     No threats. It goes through the person before leaving; any mention of clauses, interest or legal
     action only if they appear in the confirmed contract or promissory note (pagaré).
5. **Write** it short: greeting, fact (folio, amount, due date), request, payment details, sign-off.
6. **Save** the drafts with `agentos_file_write` in `collections/<YYYY-MM-DD>-<task>/collection-drafts.md` and deliver with `agentos_task_deliver` (`files`).
7. **Review:** no guilt, no sarcasm, no promises of a discount or term, no third parties. Suggested
   send time within 9:00-19:00 Mon-Sat.

## Output format (one entry per client)

The message itself is deliverable content and is written in Spanish (or the client's language).

```markdown
### DRAFT · Example Client B · N1 · email
Suggested send: Tuesday 20 Oct 2026, 10:00 · Pending the person's review
Subject: Recordatorio de pago, factura F-002

Hola, [nombre del contacto]:
Te escribimos de [Empresa Ejemplo]. Revisando nuestra cartera, la factura F-002 por $5,000.00 MXN
venció el 5 oct 2026 y aún no vemos el pago en nuestro estado de cuenta.
¿Nos puedes confirmar la fecha en que lo realizarán? Si ya lo hicieron, compártenos el comprobante
para ubicarlo. Datos: Beneficiario [ejemplo], Banco [ejemplo], CLABE [ejemplo].
Gracias por tu apoyo. Quedo atento(a).
[Firma de la persona]
```

(Sample data.) Every draft carries the `DRAFT` line and the level.

## Never

- Send the message, or mention legal action, credit bureau reporting or interest without confirmed backing.
- Threaten, shame, or write to the client's family, employer or references.
- Offer discounts, write-offs or payment terms (the person authorizes them).
- Suggest a send time outside 9:00-19:00 Mon-Sat.

## Why

A firm but friendly tone gets answered; an aggressive one gets ignored and damages the relationship. Escalating lets you
collect without burning the client on the first day overdue.

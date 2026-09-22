# Writer rules, round 2 (deeper crawl: about / activities / menu / price pages)

Everything in `WRITER_RULES.md` applies unchanged (read it first: same tone,
banned filler, 22–50 words, 1–2 sentences, English, only facts from the supplied
text, paraphrase, no time-sensitive facts, no name/type/city repetition).
Round 2 differs in two ways.

## Input differences

Each packet's `text`, `headings` and `meta` now come from several inner pages of
the venue's own site (about-us, what-to-do, menu, practical info), not only the
homepage. New fields:

- `priceText`: short passages around every euro amount found on ONE page of the
  site (`priceUrl`). This is the ONLY evidence for prices.
- `hoursText`: as before.

## Output

```json
{"id": "...", "description": "..." | null, "cuisine": "italian" | null,
 "hours": "Mo-Fr 09:00-18:00; Sa 10:00-16:00" | null,
 "price": {"amount": 12.5, "unit": "person"} | null}
```

## Rules for `price` (strict: a wrong price is much worse than no price)

Fill `price` ONLY when `priceText` states ONE clear regular price for the
venue's main offer, aimed at an ordinary adult / standard visitor:

- `amount`: that single regular (full, adult, standard) price in euros, exactly as
  written in `priceText` (12,50 → 12.5). Never a range, never a discounted,
  reduced, student, senior, child, member, weekday-special, combo, group, voucher,
  membership, deposit or drinks price. Never compute, round, convert or combine.
- If the text lists several DIFFERENT products (e.g. free visit vs guided tour,
  bowling vs karting) and it is not obvious which one is the venue's main offer,
  or the regular adult price is not explicitly stated → `null`.
- `unit`: exactly one of `person`, `hour`, `game`, `ticket`, `session`, `group`,
  `menu`, `night`. `person` only if the text says per person / p.p. or it is a
  single-visitor entry ticket. Unit unclear → `null`.
- The amount must be findable inside `priceText`. When in doubt: `null`.

`description`, `cuisine` and `hours` follow round-1 rules. Do not put prices in
`description`.

---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/components/today/today.tsx","src/components/shell.tsx"]
---

# Today — the clinic's day (doctor and front desk)

Mode: Operate. Audience: doctor between procedures (tablet/phone), administrator at the desk (desktop), owner on iPhone. Job: see the day, who is in the chair now, what needs attention, take the next action per visit. Constraints: 44px touch targets, status never colour-only, server is the source of truth. Replacement world for the whole CRM; this surface plus the shell go first. Owner chose a fusion of sketch A (pharma pack) and C (Japanese high-density grid) and rejected any top navigation, on desktop and on the phone.

## Direction contract

THESIS: The clinic's day as a dense mosaic of ruled white modules on a cool paper ground, the patient in the chair read like the face of a medicine pack. Refuses the airy teal SaaS card grid and the top-bar shell.

OWN-WORLD: Paper #f2f3f5 ground, white modules with 1px #dadde1 rules, ink #15191e. State colour codes as small solid squares, the way pack strengths are coded: cobalt #1f4ed8 in the chair (also the primary action), orange #c65410 arrived, green #0b8a5f paid, magenta #c2185b debt or no answer; confirmed is an ink outline square, unconfirmed a dashed one. Square corners. One face, Onest: names at 800, figures at 300 with tabular numerals.

STORY: Doctor and admin see the whole day on one screen: who is in the chair and for how long, what to watch for, the next visits, the cabinets' load, what to chase, money.

FIRST VIEWPORT: White left sidebar (brand, search, sections, account); no top bar. Mosaic: date, week band and day money in a row; the pack (cobalt band, name, elapsed minutes as a light 44px figure, facts table, actions) beside the visits table with code squares; cabinet lanes below; attention and tomorrow modules.

FORM: Аптечная упаковка × плотная сетка (pack language on a high-density grid), candidate 3 of the re-roll, fused with challenger japanese-high-density-web by the owner's choice, seed:ef42a42a83a01350 reroll 1. Signature interaction: cabinet lanes with the current-time line, each visit a block in its state's code colour.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

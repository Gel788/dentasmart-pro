---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/components/today/today.tsx","src/components/shell.tsx"]
---

# Today — the clinic's day (doctor and front desk)

Mode: Operate. Audience: doctor between procedures (tablet/phone), administrator at the desk (desktop), owner on iPhone. Job: see the day, who is in the chair now, what needs attention, take the next action per visit. Constraints: 44px touch targets, status never colour-only, server is the source of truth. Replacement world for the whole CRM; this surface plus the shell go first.

## Direction contract

THESIS: The clinic's day as one constructivist working plane: white field, black structure, and a single red wedge that always means "now". Refuses the teal medical-SaaS card grid and its dark-dashboard opposite.

OWN-WORLD: White #ffffff field, fog #f1f1ef side planes, ink #141414 structure as 1.5–3px rules and solid black planes, one signal red #cf2216 reserved for the current visit and the current-time wedge. No shadows, no radii above 2px, no gradients. Jost geometric grotesk for display and figures, Onest for running text. Raised: red reserved for now only (orienteering); status carried by line form — solid confirmed, dashed waiting, struck cancelled (emission rail); one dominant plane per screen (zoo map); destructive actions isolated by space (console); fixed row furniture in fixed places (roster).

STORY: The doctor sees at once who is in the chair and for how long, what to watch for, and what comes next; the admin sees who to call and who owes; both act from the row.

FIRST VIEWPORT: Black narrow rail left; title "Вторник, 20 октября / N пациентов" over a 3px rule with search right; week band of seven ruled cells; the red "in the chair" plane full width with name at display size, timer, primary white action; below it the day feed of ruled rows with the red wedge at the current time; right fog column with "Требует внимания" and money.

FORM: Красный клин (constructivism), position 7 of 7 on the grounded list, seed:ef42a42a83a01350. Signature interaction: the red now-wedge sits in the feed at the current minute and slides as time passes; the in-chair plane enters by a red wipe from the left.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

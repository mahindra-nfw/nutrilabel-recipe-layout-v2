# NutriLabel Recipe Builder v3 — notes for Claude

R&D recipe / assembly builder for chefs at Northwest Frozen. Owner: Mahindra (Admin). The app is a UI prototype used for testing with chefs and a client, so clarity for non-technical users matters more than code cleverness.

- Repo: `mahindra-nfw/nutrilabel-recipe-layout-v3` (PUBLIC; served by GitHub Pages from `main`)
- Live: https://mahindra-nfw.github.io/nutrilabel-recipe-layout-v3/
- Commits are authored as GitHub user `mahindra89` (collaborator on the repo).

## Working rules (from the user)
- **Only commit/push when the user says so** ("push it", "push the changes"). Otherwise leave changes local and say they are not pushed.
- Before a risky experiment, the user may ask for a **checkpoint**: commit, push, and add an annotated tag (e.g. `checkpoint-before-scaling-view`). To revert, restore files from the tag in a new commit; never rewrite history.
- **Scaling is read-only.** Scaling, pinned columns and the portion-size dropdown only *read* the recipe weights. They must never change an assembly's original values.
- Never push the user's recipes/test data into this public repo without asking (client formulas and costs may be confidential).
- Explain changes in plain language (the user is not a developer). Ask when a request is ambiguous.

## Run locally
`npm start` (or `node server.js`, or double-click `start.bat`) → http://localhost:5181. No dependencies, no build step.
For Claude's browser preview, `.claude/launch.json` has the config `nutrilabel-v3`.

## Before every push
1. Syntax check: `node -e "for (const f of ['cards.js','shared/engine.js','shared/data.js']) new Function(require('fs').readFileSync(f,'utf8'))"`
2. Bump the cache stamp on every `?v=` in `index.html` (all five links share one stamp, format `YYYYMMDDhhmm`):
   `sed -i -E 's/\?v=[0-9]+/?v=202601011200/g' index.html` (use the current date/time)
3. Commit with a plain-English message, then push. Check the Pages build:
   `gh api repos/mahindra-nfw/nutrilabel-recipe-layout-v3/pages/builds/latest --jq '.status+" "+.commit'`

## Code map
- `index.html` — page shell, top bar, side panel, sheet view, split view (`#split`), theme + one-time `nlv2_`→`nlv3_` storage migration.
- `cards.js` — the app (one IIFE): card rendering (`cardHTML`), board + sheet views, split view, scaling (`scaleOf`, pins), costing rows, packaging, labor, Building/Scaling faces, compare, favorites, events.
- `cards.css` — card/board/sheet styles (newer feature styles are appended at the end in labelled blocks).
- `shared/engine.js` — `NL` namespace: calc, nutrition label, cost (`NL.cost`, prices), number parsing, workbook/tabs (`NL.workbook`), undo history (`NL.history`; `sync()` saves without an undo step), prompts/forms, canvas helpers.
- `shared/data.js` — ingredient library and the sample assembly (Spicy Miso Ramen).
- `shared/base.css` — design tokens (light/dark) and shared components.

## Data model (per tab, saved in localStorage)
`S = { root, asm: { id: assembly } }`. An assembly has `name, items[{ref:'ing:<id>'|'asm:<id>', amount}], yieldLoss, steps, notes`, plus optional:
`scaleMode/scaleTarget/portionSize/portionCount/baseTarget`, `scalePins[{id,mode,target,size,count}]`, `activePin`,
`packaging[{id,name,weight,cost,l,w,h,unit}]`, `labor[{id,name,minutes,people,rate}]`, `face` ('scale' = Scaling side shown), `collapsed`, `x/y` (board position).

localStorage keys (all prefixed `nlv3_`): `cards_book` (all tabs), `favorites`, `custom_ingredients`, `prices`, `theme`, `sheet_prefs`, `side_hidden`, `panel_widths`, `card_clipboard`, `labor_rate`, `scale_style`.
Data lives in the browser per site address (localhost and the live site are separate) and does not travel with the repo.

## Testing
Use the browser preview at http://localhost:5181. Drive it with small JS checks (click buttons, read the DOM) and screenshots. Clear test data afterwards (`localStorage.removeItem('nlv3_cards_book')`) so the user's view returns to the sample.

## History
- Older UI Lab with Layouts A/B/C: `mahindra-nfw/nutrilabel-recipe-layout` (separate repo; known unfixed bugs there, untouched unless asked).
- Tags: `checkpoint-before-scaling-view` = everything before the Building/Scaling card sides.

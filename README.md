# NutriLabel Recipe Builder (v3)

Recipe / assembly builder for chef R&D: linked assembly cards, weights, yield, baker %, scaling, costing, packaging, labor and nutrition facts. Zero dependencies: plain HTML, CSS and JavaScript.

**Live site:** https://mahindra-nfw.github.io/nutrilabel-recipe-layout-v3/

## Set up on a new laptop
1. Install **Git**: https://git-scm.com/downloads
2. Install **Node.js** (LTS): https://nodejs.org
3. Install the **GitHub CLI** and sign in (used for pushing): https://cli.github.com, then run `gh auth login`
4. Get the code:
   ```
   git clone https://github.com/mahindra-nfw/nutrilabel-recipe-layout-v3.git
   cd nutrilabel-recipe-layout-v3
   ```
5. Run it: `npm start` (or double-click `start.bat` on Windows), then open http://localhost:5181
6. Working with Claude Code: open this folder as the project. Claude reads `CLAUDE.md` for the project rules, and `.claude/launch.json` lets it start the preview.

## Your saved recipes
Recipes, tabs, favorites, prices and custom ingredients are saved **in the browser** (localStorage), separately for each site address. They are not in this repo, so they do not move to a new laptop by cloning. The sample assembly (Spicy Miso Ramen) is built in.

## Features
- Final assembly card with linked sub-assembly cards (Board view) or a top-to-bottom Sheet view
- Weights, Relative %, Baker % with a named base, yield loss / final weight
- Building / Scaling card sides (Flip card or Hide columns style)
- Read-only scaling by yield, portion or base, with pinned columns and a portion size picked from them
- Cost per row, batch, kg and portion; packaging and approximate labor rows
- Nutrition facts and ingredient statement per card
- Ingredient library, custom ingredients, favorites, copy/paste cards
- Excel-style tabs, named versions, compare, split view, undo/redo, light/dark theme

## Files
- `index.html`, `cards.js`, `cards.css`: the app
- `shared/engine.js`: calculations, nutrition label, costing, tabs, undo, forms
- `shared/data.js`: ingredient library and sample assembly
- `shared/base.css`: shared styles and light/dark tokens
- `server.js`: tiny local server (port 5181); `start.bat`: Windows launcher
- `CLAUDE.md`: project notes and rules for Claude Code

## Restore points
`checkpoint-before-scaling-view`: the app before the Building/Scaling card sides. See all with `git tag`.

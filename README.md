# NutriLabel Recipe Builder (v3)

Recipe builder in the linked recipe-card style (Layout B from the NutriLabel UI Lab). Zero dependencies: plain HTML, CSS and JavaScript.

**Live site:** https://mahindra-nfw.github.io/nutrilabel-recipe-layout-v3/

## Features
- Final recipe card with linked sub-recipe cards and connectors
- Add cards and link them by dragging the ● handle onto the card that uses them
- Weights, % of batch, yield loss / yield %, procedure steps, notes
- Nutrition facts panel and ingredient statement
- Ingredient library (drag onto cards) plus your own custom ingredients
- Excel-style tabs for multiple recipes and named versions; undo/redo

Recipes and custom ingredients are saved in the browser (localStorage), per website address.

## Run locally
Double-click `start.bat`, or run `node server.js`, then open http://localhost:5181

## Files
- `index.html`, `cards.js`, `cards.css`: the recipe builder
- `shared/data.js`: ingredient library and sample recipe
- `shared/engine.js`: calculations, nutrition label, picker, canvas, tabs
- `shared/base.css`: shared styles

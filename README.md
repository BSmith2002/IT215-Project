# Iron Resolve — Rooms Prototype (Split for VS Code)

This is your original single-file HTML split into standard files:

- `index.html` — markup and DOM elements
- `style.css` — all styles moved out of inline `<style>`
- `main.js` — the game logic moved out of `<script>` and wrapped in the same IIFE

> Note: The provided snippet's **self-test section was truncated**. To keep the game running error-free, I've **commented out** that section in `main.js`. If you share the full tail of the self-test code, we can re-enable it cleanly.

## Run
Open `index.html` in your browser, or use a local server (recommended):
```bash
# VS Code: install the Live Server extension and "Open with Live Server"
# or Python:
python -m http.server 8000
# then visit http://localhost:8000
```

## Files
```
iron-resolve-rooms/
├── index.html
├── style.css
└── main.js
```

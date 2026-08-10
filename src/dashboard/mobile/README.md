# Mobile UI

`mobile.css` is the final responsive override layer for authenticated dashboard screens.

- Keep shared and desktop styles in `src/index.css`.
- Put fixes that only apply below tablet width in `mobile.css`.
- Add a screen-specific class in the React view instead of relying on fragile element positions when possible.
- Verify changes at 320px, 375px, and 390px widths, then run `npm run lint`.

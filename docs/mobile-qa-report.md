# Vault Mobile QA Report

Initial review: 2026-08-04
Latest update: 2026-08-11
Target: http://localhost:5173/dashboard
Project: D:\Tools\vault

## Latest update — Notes mobile grid and list

- Fixed the Notes default grid so it renders as two masonry-style columns below 640px instead of appearing identical to list view.
- Added explicit `notes-layout-grid` and `notes-layout-list` states so the selected layout control always matches the rendered note collection.
- Tightened mobile grid-card typography, spacing, actions, and timestamps while preserving full-width cards in list mode.
- Kept the sort control on one 44px row at 320px with a non-wrapping, truncating label.
- Verified the Notes page at 390x844 and 320x700 using the local Vite app with mocked authenticated API responses and representative notes.
- Confirmed grid mode uses two columns, switching to list mode produces full-width cards, and both controls update `aria-pressed` correctly.
- Confirmed document width equals viewport width at 390px and 320px, with no horizontal overflow, framework overlay, console warning, or console error.
- `npm run lint`: passed with 0 warnings and 0 errors.
- `npm run build` was not run for this update.

The Chrome extension connection was unavailable during automation, so the latest authenticated Notes check used standalone Playwright with mocked API data. No production credentials or cookies were accessed.

## Scope and evidence

- Local Vite app responded successfully on IPv6 localhost (`[::1]:5173`).
- Authenticated dashboard was visible in an existing Edge session at desktop width.
- A separate CamoFox session was set to a 390x844 viewport and was redirected to the login page because it did not share the Edge authentication session.
- The mobile screenshot therefore verifies the login responsive layout, not the authenticated dashboard pages.
- `npm run build`: passed.
- `npm run lint`: passed with 0 warnings and 0 errors.

## Executive summary

The login screen is visually polished and fits 390px width without observed horizontal overflow. The main mobile risk is vertical fit: the card/footer is close to the bottom edge and may be clipped on shorter devices, browser-toolbar layouts, safe-area devices, or increased text scaling.

The authenticated dashboard has responsive implementation for a slide-in sidebar at widths below 1024px and 44px controls below 640px. It still needs a real authenticated 390px/768px pass because the separate mobile session could not access the dashboard.

## Confirmed findings

### M1 — Login card has insufficient bottom breathing room on mobile
Severity: Medium
Category: Responsive / UX / Accessibility

At 390x844, the login card continues to the bottom of the screenshot with little visible bottom margin. The final registration/help text is close to the viewport boundary.

Impact:
- Possible clipping behind mobile browser chrome or a home indicator.
- Risk increases on 667px-height devices, landscape mode, and larger system text settings.

Recommendation:
- Add resilient bottom spacing to the page wrapper, including `env(safe-area-inset-bottom)`.
- Allow natural page scrolling instead of relying on a fixed-height composition.
- Test at 320x568, 375x667, 390x844, and 430x932.

### M2 — Login layout has limited vertical reserve
Severity: Medium
Category: Responsive / UX

The logo, description, card heading, two fields, password action, remember row, primary action, divider, authenticator action, and footer consume nearly the full 844px viewport.

Recommendation:
- Reduce decorative/top spacing on short viewports using a height media query.
- Preserve field/button heights but reduce inter-section gaps modestly.
- Test `@media (max-height: 740px)` separately from width breakpoints.

### M3 — Secondary mobile text/placeholder contrast should be audited
Severity: Medium
Category: Accessibility

Supporting text and placeholder text are visibly lower contrast than headings and action labels. Labels exist, which is good, but placeholder text must not carry essential meaning and input text must meet contrast independently.

Recommendation:
- Verify text/background contrast with axe or Lighthouse.
- Raise placeholder and supporting-text contrast where needed.
- Keep visible labels and meaningful error text.

### M4 — Touch-target behavior should be verified for password visibility and Remember me
Severity: Low/Medium
Category: Accessibility / Mobile UX

The controls appear visually usable, but the eye icon and checkbox need verified 44x44px effective hit areas and accessible names/state changes.

Recommendation:
- Make the complete checkbox+label row clickable.
- Give the password toggle `aria-label="Show password"` / `"Hide password"` and update state.
- Ensure keyboard focus is visible.

### M5 — Authenticated dashboard was not mobile-verified in this pass
Severity: High (testing gap, not confirmed product bug)
Category: Coverage gap

The mobile browser session reached `/`/login after opening the dashboard because it had no shared authenticated cookie. The desktop Edge session was authenticated, but CamoFox could not reuse it.

Recommendation:
- Run the mobile pass in the authenticated Edge profile using device emulation or use a dedicated test account/session.
- Do not export production cookies into automation.

## Dashboard implementation review

Positive signs already present in source:

- Sidebar translates off-canvas below `lg` and opens with a backdrop.
- Sidebar width is capped with `min(256px, 86vw)`.
- Mobile menu close button exists and is 44px.
- Body scroll is locked while the sidebar is open.
- Dashboard shell uses `min-height: 100dvh` and hides horizontal overflow.
- Mobile controls are assigned a minimum height of 44px below 640px.
- Chat and activity views use dynamic viewport-height sizing.
- Content containers use `min-width: 0`, reducing flex/grid overflow risk.

Areas requiring targeted mobile verification:

1. Open/close sidebar, then press Escape and browser Back.
2. Confirm backdrop closes the menu and does not trap scrolling afterward.
3. Confirm every navigation item is reachable without being hidden under the bottom profile/sign-out area.
4. Test dashboard summary cards at 320px and 390px widths.
5. Test Vault search/filter controls and empty table states.
6. Test Accounts table/card layout; source contains an `xl:block` table branch that must have a mobile alternative.
7. Test Email Generator split-pane behavior; source uses an `lg:grid` layout and selected-message show/hide behavior.
8. Test AI Chat keyboard input and composer with the mobile keyboard visible.
9. Test the Notes editor modal with the mobile keyboard visible; grid/list controls are now verified at 320px and 390px.
10. Test Activity and Backup scrolling inside the page, avoiding nested-scroll traps.
11. Test Settings forms, selects, modals, dropdown direction, and file upload controls.
12. Test all dialogs at short viewport heights with keyboard focus and safe-area padding.

## Desktop observation while accessing the authenticated session

The authenticated Vault page visibly showed a `Not found` status in the main dashboard area while otherwise rendering the shell and empty state. This should be investigated separately as a possible data/API route or state issue; it is not necessarily a mobile layout bug.

## Suggested polish priorities

P0: Complete an authenticated mobile run at 390x844 and 375x667.
P1: Fix login bottom safe-area/short-height behavior.
P1: Verify sidebar, modal, table, and nested-scroll behavior on mobile.
P1: Investigate the visible `Not found` dashboard state and capture the originating API response.
P2: Audit contrast and control hit areas.
P2: Add automated responsive smoke coverage for 320, 375, 390, and 430px widths.

## Verification commands

```bash
cd /d/Tools/vault
npm run build
npm run lint
```

Both commands passed during the initial review. The 2026-08-11 Notes update ran `npm run lint` only, and it passed.

## Limitations

The 2026-08-11 update changes the Notes component and mobile stylesheet. Authenticated production credentials/cookies were not handled or exported. The wider mobile dashboard still requires a user-owned authenticated browser session or a non-production test account; the latest automated pass covers the Notes page with mocked authenticated data only.

# Email Generator Mockup Redesign

## Goal

Redesign the existing functional Email Generator to closely follow the supplied dark Vault mockup while preserving the current authenticated address-generation and inbox workflows. The result should feel like the same product as the surrounding dashboard, remain usable on mobile, and avoid controls that imply unsupported backend behavior.

## Design Direction

Use a faithful functional adaptation rather than a static pixel copy. Match the mockup's information hierarchy, dense dashboard layout, cyan accents, bordered panels, table treatment, filtering controls, and pagination. Keep the existing Vault typography, colors, sidebar, header, shared `panel` treatment, and form controls so the page does not look pasted in from another application.

The redesign changes frontend presentation and client-side organization only. It does not add database tables, migrations, API routes, address deletion, or configurable random-character generation.

## Page Structure

### Header

Keep the existing `PageTitle` structure with:

- Eyebrow: `Email generator`
- Title: `Generate email addresses`
- Supporting text describing private address generation and inbox use
- A compact `Total generated` metric card aligned to the right on wide screens and stacked below the title on narrow screens

### Generator Area

Create a two-column top section based on the mockup.

The left `Generate new email` panel contains:

- Domain selector
- Batch count selector
- Full-width cyan gradient generate button
- Clear loading, disabled, success, and error states

The right `Generator settings` panel contains only supported generation choices:

- `Random words` and `Custom prefix` segmented mode control
- Custom-prefix field when custom mode is selected
- A concise explanation of the active generation mode
- Inbox totals for unread and stored messages as compact supporting metrics

Do not show prefix-length, number, or special-character controls because the API does not support those settings. The visual spacing and hierarchy should still resemble the mockup's settings card.

## Generated Email Workspace

Place the address-management and inbox experiences inside one large panel below the generator area.

### Tabs

Use two tabs:

- `Generated emails`, with the current address count
- `Inbox`, with the current unread count

The active tab uses the mockup's cyan underline and badge treatment. Selecting an address's envelope action switches to the Inbox tab and loads that address.

### Toolbar

The generated-emails tab includes:

- Search input for full address, prefix, or domain
- Filters button that reveals or collapses the detailed filter row on smaller layouts
- Refresh button connected to the existing refresh flow
- Client-side CSV export button for the currently filtered addresses

The detailed filter row contains:

- Search field
- Domain selector derived from loaded domains
- Status selector for all, active, or disabled
- Clear action that resets all filters

Filtering is performed against already loaded authenticated data. No new API query contract is introduced.

### Address Table

Use the mockup's column structure:

- Email address
- Prefix
- Domain
- Created at
- Status
- Actions

Rows include a circular mail icon, copy feedback, a cyan domain badge, relative created time, and a readable green or muted status indicator. Actions are:

- Copy address
- Open inbox
- Enable or disable address

Address deletion is intentionally omitted because no deletion endpoint exists and the previously approved email system preserves durable inbox data.

### Pagination

Paginate filtered addresses entirely on the client. Default to ten rows per page and offer ten, twenty-five, and fifty rows per page. Reset or clamp the current page whenever filters or page size change. Show a result summary and compact previous, numbered-page, and next controls matching the mockup.

### Responsive Behavior

On desktop, render the full table and horizontal toolbar. On tablets, allow the toolbar and filters to wrap while preserving the table. On small screens, replace table rows with stacked address cards so values and actions remain readable without requiring a wide horizontal scroll. Top panels and the metric card stack vertically.

## Inbox Experience

The Inbox tab preserves the current behavior:

- Select an owned address
- Load messages for that address
- Show unread state, sender, subject, and received time
- Open a message detail view
- Mark opened messages read
- Show safe headers and plain-text message content only

Use a responsive split view on wide screens, with mailbox selection and message content side by side. On small screens, use a single-column progression with clear back actions. Empty, loading, and error states remain explicit.

## Data Flow

Continue using the existing `apiFetch` calls and API routes:

- Load domains and addresses when the view mounts
- Refresh domains, addresses, and the selected inbox through the existing refresh action
- Generate addresses through `POST /email/addresses`
- Enable or disable through `PATCH /email/addresses/:id`
- Load and open messages through the existing message routes

Search, domain filtering, status filtering, pagination, relative-time display, and CSV export are client-side derived behavior. The selected address remains stable across refreshes when it still exists.

## Component Boundaries

Keep `EmailGeneratorView` as the data-owning container, but split major visual units into focused local components in the same file unless the implementation becomes unwieldy:

- `GeneratorPanel`
- `GeneratorSettings`
- `EmailWorkspace`
- `AddressTable`
- `AddressCardList`
- `Pagination`
- `InboxWorkspace`

Pure helpers handle filtering, pagination, relative-time formatting, and CSV creation so those behaviors can be tested without rendering the full page.

## Error Handling and Accessibility

- Preserve visible success and error notices with `status` and `alert` roles.
- Disable generation and refresh actions while their requests are active.
- Give icon-only actions specific accessible labels.
- Keep keyboard-operable tabs, buttons, filters, and pagination.
- Use actual table semantics on desktop.
- Never render incoming HTML; message bodies remain plain text.
- If clipboard or export fails, show an actionable error message.

## Testing and Verification

Use test-driven development for new pure behaviors:

- Search across address, prefix, and domain
- Domain and status filters
- Page calculation and page clamping
- CSV escaping and exported rows
- Relative created-time labels

Verify the final change with:

- Focused automated tests for the new helpers
- `npm run lint`
- Manual inspection at desktop and mobile widths using the running development server

Do not run `npm run build` unless explicitly requested.

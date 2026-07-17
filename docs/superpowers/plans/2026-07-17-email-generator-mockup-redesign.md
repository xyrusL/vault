# Email Generator Mockup Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the functional Email Generator to match the supplied Vault mockup while preserving generation, address management, and durable inbox behavior.

**Architecture:** Keep `EmailGeneratorView` as the authenticated data and request container. Move deterministic filtering, pagination, relative-time, and CSV logic into a pure utility module, and move the generator, address workspace, and inbox workspace into stateless presentation components that receive data and callbacks through explicit props. This keeps the redesign testable with Node's built-in test runner and React server rendering without adding dependencies.

**Tech Stack:** React 19, Vite 8, Tailwind CSS 4, Lucide React, Node built-in test runner, React DOM server rendering.

---

## File Map

- Create `src/dashboard/emailGeneratorUtils.js`: pure address filtering, pagination, relative-time, and CSV helpers.
- Create `src/dashboard/EmailGeneratorPanels.jsx`: header metric and the two mockup-inspired generator panels.
- Create `src/dashboard/EmailAddressWorkspace.jsx`: generated-email tab, toolbar, filters, desktop table, mobile cards, and pagination.
- Create `src/dashboard/EmailInboxWorkspace.jsx`: mailbox selector, message list, and safe plain-text detail view.
- Modify `src/dashboard/EmailGeneratorView.jsx`: retain API state/actions, add tab/filter/page/export state, and compose the new presentation components.
- Modify `package.json`: add a reusable Node test command without disturbing existing scripts.
- Create `test/jsx-loader.js`: transform imported `.jsx` modules with the already installed `esbuild` package during Node tests.
- Create `test/email-generator-utils.test.js`: pure behavior coverage.
- Create `test/email-generator-panels.test.js`: static generator-panel semantics and supported-control coverage.
- Create `test/email-address-workspace.test.js`: table, filters, actions, pagination, and mobile-card semantics.
- Create `test/email-inbox-workspace.test.js`: inbox empty, list, and detail states.

### Task 1: Address Workspace Utilities

**Files:**
- Create: `src/dashboard/emailGeneratorUtils.js`
- Create: `test/email-generator-utils.test.js`
- Create: `test/jsx-loader.js`
- Modify: `package.json`

- [ ] **Step 1: Add the test script**

Add this entry beside `lint` in `package.json`:

```json
"test": "node --import ./test/jsx-loader.js --test --test-isolation=none",
```

- [ ] **Step 2: Add the JSX loader used by component tests**

Create `test/jsx-loader.js`:

```js
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { transformSync } from "esbuild";

registerHooks({
  load(url, context, nextLoad) {
    if (!url.endsWith(".jsx")) return nextLoad(url, context);

    const source = readFileSync(new URL(url), "utf8");
    return {
      format: "module",
      shortCircuit: true,
      source: transformSync(source, {
        format: "esm",
        jsx: "automatic",
        loader: "jsx",
        sourcemap: "inline",
      }).code,
    };
  },
});
```

- [ ] **Step 3: Write failing utility tests**

Create `test/email-generator-utils.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  createAddressCsv,
  filterEmailAddresses,
  formatRelativeTime,
  paginateEmailAddresses,
} from "../src/dashboard/emailGeneratorUtils.js";

const addresses = [
  {
    id: "one",
    fullAddress: "amber-river-12@octagram.qzz.io",
    localPart: "amber-river-12",
    hostname: "octagram.qzz.io",
    status: "active",
    createdAt: "2026-07-17T08:00:00Z",
  },
  {
    id: "two",
    fullAddress: "private.box@tpmail.deze.me",
    localPart: "private.box",
    hostname: "tpmail.deze.me",
    status: "disabled",
    createdAt: "2026-07-17T07:00:00Z",
  },
];

test("filters addresses by search, domain, and status", () => {
  assert.deepEqual(
    filterEmailAddresses(addresses, {
      search: "PRIVATE",
      domain: "tpmail.deze.me",
      status: "disabled",
    }).map((address) => address.id),
    ["two"],
  );
});

test("search matches full address, prefix, and domain", () => {
  assert.equal(filterEmailAddresses(addresses, { search: "amber-river" }).length, 1);
  assert.equal(filterEmailAddresses(addresses, { search: "octagram" }).length, 1);
});

test("pagination clamps the requested page and reports visible bounds", () => {
  const rows = Array.from({ length: 23 }, (_, index) => ({ id: index + 1 }));
  const result = paginateEmailAddresses(rows, 9, 10);

  assert.equal(result.page, 3);
  assert.equal(result.pageCount, 3);
  assert.equal(result.start, 21);
  assert.equal(result.end, 23);
  assert.equal(result.items.length, 3);
});

test("relative time produces mockup-style labels", () => {
  const now = Date.parse("2026-07-17T08:05:00Z");
  assert.equal(formatRelativeTime("2026-07-17T08:04:45Z", now), "Just now");
  assert.equal(formatRelativeTime("2026-07-17T08:04:00Z", now), "1 minute ago");
  assert.equal(formatRelativeTime("2026-07-17T06:05:00Z", now), "2 hours ago");
});

test("CSV export escapes commas and quotes", () => {
  const csv = createAddressCsv([
    {
      fullAddress: "quoted@example.com",
      localPart: "quoted",
      hostname: "example.com",
      status: "active",
      createdAt: '2026-07-17T08:00:00Z, "local"',
    },
  ]);

  assert.match(csv, /^Email Address,Prefix,Domain,Status,Created At/m);
  assert.match(csv, /"2026-07-17T08:00:00Z, ""local"""/);
});
```

- [ ] **Step 4: Run the tests and verify RED**

Run: `npm test -- test/email-generator-utils.test.js`

Expected: FAIL because `src/dashboard/emailGeneratorUtils.js` does not exist.

- [ ] **Step 5: Implement the pure helpers**

Create `src/dashboard/emailGeneratorUtils.js`:

```js
export function filterEmailAddresses(
  addresses,
  { search = "", domain = "all", status = "all" } = {},
) {
  const query = search.trim().toLowerCase();

  return addresses.filter((address) => {
    const searchable = [
      address.fullAddress,
      address.localPart,
      address.hostname,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      (!query || searchable.includes(query)) &&
      (domain === "all" || address.hostname === domain) &&
      (status === "all" || address.status === status)
    );
  });
}

export function paginateEmailAddresses(addresses, requestedPage, pageSize) {
  const safePageSize = Math.max(1, Number(pageSize) || 10);
  const pageCount = Math.max(1, Math.ceil(addresses.length / safePageSize));
  const page = Math.min(Math.max(1, Number(requestedPage) || 1), pageCount);
  const offset = (page - 1) * safePageSize;
  const items = addresses.slice(offset, offset + safePageSize);

  return {
    items,
    page,
    pageCount,
    start: addresses.length ? offset + 1 : 0,
    end: Math.min(offset + safePageSize, addresses.length),
    total: addresses.length,
  };
}

export function formatRelativeTime(value, now = Date.now()) {
  if (!value) return "Never";
  const timestamp = Date.parse(value.endsWith("Z") ? value : `${value}Z`);
  if (Number.isNaN(timestamp)) return value;

  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 45) return "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  return new Date(timestamp).toLocaleDateString();
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function createAddressCsv(addresses) {
  const rows = addresses.map((address) => [
    address.fullAddress,
    address.localPart,
    address.hostname,
    address.status,
    address.createdAt,
  ]);

  return [
    ["Email Address", "Prefix", "Domain", "Status", "Created At"],
    ...rows,
  ]
    .map((row) => row.map(escapeCsv).join(","))
    .join("\n");
}
```

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run: `npm test -- test/email-generator-utils.test.js`

Expected: 5 tests pass with zero failures.

- [ ] **Step 7: Run lint**

Run: `npm run lint`

Expected: exit code 0.

- [ ] **Step 8: Commit the utility slice**

```bash
git add package.json src/dashboard/emailGeneratorUtils.js test/jsx-loader.js test/email-generator-utils.test.js
git commit -m "Add email generator workspace utilities"
```

### Task 2: Mockup Header and Generator Panels

**Files:**
- Create: `src/dashboard/EmailGeneratorPanels.jsx`
- Create: `test/email-generator-panels.test.js`
- Modify: `src/dashboard/EmailGeneratorView.jsx`

- [ ] **Step 1: Write failing server-render tests**

Create `test/email-generator-panels.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EmailGeneratorPanels } from "../src/dashboard/EmailGeneratorPanels.jsx";

const props = {
  addresses: [{ unreadCount: 2, messageCount: 4 }],
  domains: [{ id: "domain-1", hostname: "octagram.qzz.io" }],
  domainId: "domain-1",
  count: 5,
  mode: "random_words",
  prefix: "",
  loading: false,
  submitting: false,
  onDomainChange() {},
  onCountChange() {},
  onModeChange() {},
  onPrefixChange() {},
  onSubmit() {},
};

test("renders the mockup generator hierarchy and supported settings", () => {
  const html = renderToStaticMarkup(createElement(EmailGeneratorPanels, props));

  assert.match(html, /Generate new email/);
  assert.match(html, /Generator settings/);
  assert.match(html, /Random words/);
  assert.match(html, /Custom prefix/);
  assert.doesNotMatch(html, /Include special characters/);
  assert.doesNotMatch(html, /Email prefix length/);
});

test("custom mode renders the prefix field", () => {
  const html = renderToStaticMarkup(
    createElement(EmailGeneratorPanels, {
      ...props,
      mode: "custom",
      prefix: "private.box",
    }),
  );

  assert.match(html, /Your prefix/);
  assert.match(html, /private\.box/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- test/email-generator-panels.test.js`

Expected: FAIL because `EmailGeneratorPanels.jsx` does not exist.

- [ ] **Step 3: Create the stateless generator panels**

Create `src/dashboard/EmailGeneratorPanels.jsx` with:

```jsx
import { Inbox, Mail, Settings2, Sparkles } from "lucide-react";
import { PageTitle } from "./DashboardUi.jsx";

export function EmailGeneratorPanels({
  addresses,
  domains,
  domainId,
  count,
  mode,
  prefix,
  loading,
  submitting,
  onDomainChange,
  onCountChange,
  onModeChange,
  onPrefixChange,
  onSubmit,
}) {
  const unread = addresses.reduce((sum, item) => sum + item.unreadCount, 0);
  const messages = addresses.reduce((sum, item) => sum + item.messageCount, 0);

  return (
    <>
      <PageTitle
        eyebrow="Email generator"
        title="Generate email addresses"
        text="Create secure private addresses instantly for signups, testing, or privacy."
        action={
          <div className="metric-card flex min-w-48 items-center justify-between gap-5 rounded-xl border border-white/10 bg-white/[0.025] px-5 py-4">
            <div>
              <p className="text-xs text-slate-400">Total generated</p>
              <p className="mt-1 text-2xl font-semibold">{addresses.length}</p>
            </div>
            <span className="grid size-10 place-items-center rounded-full bg-cyan-400/10 text-cyan-300">
              <Mail className="size-5" />
            </span>
          </div>
        }
      />

      <div className="mt-7 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <form className="panel" onSubmit={onSubmit}>
          <div className="flex items-center gap-2.5">
            <Mail className="size-5 text-cyan-300" />
            <h2 className="font-semibold">Generate new email</h2>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_140px]">
            <label className="text-sm text-slate-300">
              Select domain
              <select className="form-control mt-2" value={domainId} onChange={onDomainChange} disabled={loading || !domains.length}>
                {!domains.length && <option value="">No domains available</option>}
                {domains.map((domain) => <option key={domain.id} value={domain.id}>@{domain.hostname}</option>)}
              </select>
            </label>
            <label className="text-sm text-slate-300">
              Count
              <select className="form-control mt-2" value={count} onChange={onCountChange} disabled={mode === "custom"}>
                {[1, 2, 3, 5, 10].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>
          <button type="submit" disabled={submitting || loading || !domainId} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-sky-500 text-sm font-semibold text-slate-950 disabled:opacity-50">
            <Sparkles className="size-4" />
            {submitting ? "Generating..." : "Generate email"}
          </button>
        </form>

        <section className="panel">
          <div className="flex items-center gap-2.5">
            <Settings2 className="size-5 text-cyan-300" />
            <h2 className="font-semibold">Generator settings</h2>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-black/15 p-1">
            {[
              ["random_words", "Random words"],
              ["custom", "Custom prefix"],
            ].map(([value, label]) => (
              <button key={value} type="button" onClick={() => onModeChange(value)} className={`rounded-md px-3 py-2 text-sm ${mode === value ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400"}`}>
                {label}
              </button>
            ))}
          </div>
          {mode === "custom" ? (
            <label className="mt-4 block text-sm text-slate-300">
              Your prefix
              <input className="form-control mt-2" value={prefix} onChange={onPrefixChange} placeholder="my.private.address" maxLength={64} required />
            </label>
          ) : (
            <p className="mt-4 text-sm leading-relaxed text-slate-400">Secure readable combinations such as <span className="text-cyan-300">silver-orbit-42</span>.</p>
          )}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-white/8 bg-black/10 p-3"><p className="text-xs text-slate-500">Unread</p><p className="mt-1 flex items-center gap-2 text-lg font-semibold"><Inbox className="size-4 text-cyan-300" />{unread}</p></div>
            <div className="rounded-lg border border-white/8 bg-black/10 p-3"><p className="text-xs text-slate-500">Messages</p><p className="mt-1 text-lg font-semibold">{messages}</p></div>
          </div>
        </section>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Integrate the panels into the container**

In `src/dashboard/EmailGeneratorView.jsx`:

1. Import `EmailGeneratorPanels`.
2. Remove `PageTitle`, `Sparkles`, and the old top-panel markup from this file.
3. Render the component immediately after the opening wrapper:

```jsx
<EmailGeneratorPanels
  addresses={addresses}
  domains={domains}
  domainId={domainId}
  count={count}
  mode={mode}
  prefix={prefix}
  loading={loading}
  submitting={submitting}
  onDomainChange={(event) => setDomainId(event.target.value)}
  onCountChange={(event) => setCount(Number(event.target.value))}
  onModeChange={(value) => {
    setMode(value);
    if (value === "custom") setCount(1);
  }}
  onPrefixChange={(event) => setPrefix(event.target.value)}
  onSubmit={generateAddresses}
/>
```

Keep the existing notice/error banner directly after these panels.

- [ ] **Step 5: Run focused tests and lint**

Run: `npm test -- test/email-generator-panels.test.js`

Expected: 2 tests pass.

Run: `npm run lint`

Expected: exit code 0.

- [ ] **Step 6: Commit the generator panels**

```bash
git add src/dashboard/EmailGeneratorPanels.jsx src/dashboard/EmailGeneratorView.jsx test/email-generator-panels.test.js
git commit -m "Redesign email generator controls"
```

### Task 3: Generated Email Table, Filters, Export, and Pagination

**Files:**
- Create: `src/dashboard/EmailAddressWorkspace.jsx`
- Create: `test/email-address-workspace.test.js`
- Modify: `src/dashboard/EmailGeneratorView.jsx`

- [ ] **Step 1: Write failing workspace render tests**

Create `test/email-address-workspace.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EmailAddressWorkspace } from "../src/dashboard/EmailAddressWorkspace.jsx";

const address = {
  id: "one",
  fullAddress: "amber-river-12@octagram.qzz.io",
  localPart: "amber-river-12",
  hostname: "octagram.qzz.io",
  status: "active",
  createdAt: "2026-07-17T08:00:00Z",
};

const props = {
  addresses: [address],
  visibleAddresses: [address],
  domains: [{ id: "domain-1", hostname: "octagram.qzz.io" }],
  search: "",
  domainFilter: "all",
  statusFilter: "all",
  filtersOpen: true,
  copiedId: "",
  loading: false,
  pagination: { page: 1, pageCount: 1, start: 1, end: 1, total: 1 },
  pageSize: 10,
  onSearchChange() {},
  onDomainFilterChange() {},
  onStatusFilterChange() {},
  onClearFilters() {},
  onToggleFilters() {},
  onRefresh() {},
  onExport() {},
  onCopy() {},
  onOpenInbox() {},
  onToggleAddress() {},
  onPageChange() {},
  onPageSizeChange() {},
};

test("renders the mockup table columns and row actions", () => {
  const html = renderToStaticMarkup(createElement(EmailAddressWorkspace, props));

  for (const heading of ["Email address", "Prefix", "Domain", "Created at", "Status", "Actions"]) {
    assert.match(html.toLowerCase(), new RegExp(heading.toLowerCase()));
  }
  assert.match(html, /Copy amber-river-12@octagram\.qzz\.io/);
  assert.match(html, /Open inbox for amber-river-12@octagram\.qzz\.io/);
  assert.match(html, /Disable amber-river-12@octagram\.qzz\.io/);
});

test("renders toolbar, filters, result summary, and page size", () => {
  const html = renderToStaticMarkup(createElement(EmailAddressWorkspace, props));

  assert.match(html, /Filters/);
  assert.match(html, /Refresh/);
  assert.match(html, /Export/);
  assert.match(html, /aria-label="Quick search generated emails"/);
  assert.match(html, /Showing 1 to 1 of 1 results/);
  assert.match(html, /10 per page/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- test/email-address-workspace.test.js`

Expected: FAIL because `EmailAddressWorkspace.jsx` does not exist.

- [ ] **Step 3: Implement the stateless address workspace**

Create `src/dashboard/EmailAddressWorkspace.jsx`. It must export `EmailAddressWorkspace` and contain these exact structural units:

```jsx
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Inbox,
  Mail,
  Power,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { formatRelativeTime } from "./emailGeneratorUtils.js";

export function EmailAddressWorkspace(props) {
  const {
    visibleAddresses,
    domains,
    search,
    domainFilter,
    statusFilter,
    filtersOpen,
    copiedId,
    loading,
    pagination,
    pageSize,
    onSearchChange,
    onDomainFilterChange,
    onStatusFilterChange,
    onClearFilters,
    onToggleFilters,
    onRefresh,
    onExport,
    onCopy,
    onOpenInbox,
    onToggleAddress,
    onPageChange,
    onPageSizeChange,
  } = props;

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-white/8 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-semibold text-cyan-300">Generated emails</h2>
          <p className="mt-1 text-xs text-slate-500">View, search, and manage your generated email addresses.</p>
        </div>
        <div className="flex flex-1 flex-wrap gap-2 lg:max-w-[660px] lg:justify-end">
          <label className="relative min-w-[220px] flex-1 lg:max-w-[285px]"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input className="form-control !h-10 !pl-10" value={search} onChange={onSearchChange} placeholder="Search email..." aria-label="Quick search generated emails" /></label>
          <button type="button" className="action-button !h-10 !w-auto gap-2 px-3" onClick={onToggleFilters}><SlidersHorizontal />Filters</button>
          <button type="button" className="action-button !h-10 !w-auto gap-2 px-3" onClick={onRefresh} disabled={loading}><RefreshCw />Refresh</button>
          <button type="button" className="action-button !h-10 !w-auto gap-2 px-3" onClick={onExport}><Download />Export</button>
        </div>
      </div>

      {filtersOpen && (
        <div className="grid gap-3 border-b border-white/8 p-5 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
          <label className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input className="form-control !pl-10" value={search} onChange={onSearchChange} placeholder="Search email address, prefix, or domain..." aria-label="Search generated emails" /></label>
          <select className="form-control" value={domainFilter} onChange={onDomainFilterChange} aria-label="Filter by domain"><option value="all">All domains</option>{domains.map((domain) => <option key={domain.id} value={domain.hostname}>@{domain.hostname}</option>)}</select>
          <select className="form-control" value={statusFilter} onChange={onStatusFilterChange} aria-label="Filter by status"><option value="all">All status</option><option value="active">Active</option><option value="disabled">Disabled</option></select>
          <button type="button" className="px-3 text-sm text-cyan-300" onClick={onClearFilters}>Clear</button>
        </div>
      )}

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[850px] text-left">
          <thead className="border-b border-white/8 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Email address</th><th className="px-4 py-3">Prefix</th><th className="px-4 py-3">Domain</th><th className="px-4 py-3">Created at</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead>
          <tbody>{visibleAddresses.map((address) => <AddressRow key={address.id} address={address} copied={copiedId === address.id} onCopy={onCopy} onOpenInbox={onOpenInbox} onToggle={onToggleAddress} />)}</tbody>
        </table>
      </div>

      <div className="divide-y divide-white/[0.06] md:hidden">{visibleAddresses.map((address) => <AddressCard key={address.id} address={address} copied={copiedId === address.id} onCopy={onCopy} onOpenInbox={onOpenInbox} onToggle={onToggleAddress} />)}</div>

      {!loading && !visibleAddresses.length && <p className="p-8 text-center text-sm text-slate-400">No matching addresses. Generate your first address above.</p>}
      {loading && <p className="p-8 text-center text-sm text-slate-400">Loading addresses...</p>}

      <div className="flex flex-col gap-4 border-t border-white/8 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-400">Showing {pagination.start} to {pagination.end} of {pagination.total} results</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="action-button" onClick={() => onPageChange(pagination.page - 1)} disabled={pagination.page === 1} aria-label="Previous page"><ChevronLeft /></button>
          {Array.from({ length: pagination.pageCount }, (_, index) => index + 1).map((page) => <button key={page} type="button" onClick={() => onPageChange(page)} className={`grid size-10 place-items-center rounded-lg text-sm ${page === pagination.page ? "bg-cyan-500 text-slate-950" : "text-slate-300 hover:bg-white/5"}`}>{page}</button>)}
          <button type="button" className="action-button" onClick={() => onPageChange(pagination.page + 1)} disabled={pagination.page === pagination.pageCount} aria-label="Next page"><ChevronRight /></button>
          <select className="form-control ml-2 !w-auto" value={pageSize} onChange={onPageSizeChange} aria-label="Results per page">{[10, 25, 50].map((size) => <option key={size} value={size}>{size} per page</option>)}</select>
        </div>
      </div>
    </div>
  );
}
```

Add these local functions below `EmailAddressWorkspace` in the same file:

```jsx
function AddressRow({ address, copied, onCopy, onOpenInbox, onToggle }) {
  return (
    <tr className="border-b border-white/[0.06] text-sm text-slate-300 hover:bg-white/[0.02]">
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-cyan-300/25 text-cyan-300"><Mail className="size-4" /></span>
          <span className="break-all font-medium text-slate-200">{address.fullAddress}</span>
        </div>
      </td>
      <td className="px-4 py-3">{address.localPart}</td>
      <td className="px-4 py-3"><span className="rounded-md bg-cyan-400/10 px-2 py-1 text-xs text-cyan-300">@{address.hostname}</span></td>
      <td className="px-4 py-3 text-slate-400">{formatRelativeTime(address.createdAt)}</td>
      <td className="px-4 py-3"><StatusLabel status={address.status} /></td>
      <td className="px-5 py-3"><AddressActions address={address} copied={copied} onCopy={onCopy} onOpenInbox={onOpenInbox} onToggle={onToggle} /></td>
    </tr>
  );
}

function AddressCard({ address, copied, onCopy, onOpenInbox, onToggle }) {
  return (
    <article className="p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-cyan-300/25 text-cyan-300"><Mail className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="break-all text-sm font-medium text-slate-200">{address.fullAddress}</p>
          <p className="mt-1 text-xs text-slate-500">{address.localPart}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-cyan-400/10 px-2 py-1 text-xs text-cyan-300">@{address.hostname}</span>
          <StatusLabel status={address.status} />
          <span className="text-xs text-slate-500">{formatRelativeTime(address.createdAt)}</span>
        </div>
        <AddressActions address={address} copied={copied} onCopy={onCopy} onOpenInbox={onOpenInbox} onToggle={onToggle} />
      </div>
    </article>
  );
}

function StatusLabel({ status }) {
  const active = status === "active";
  return <span className="inline-flex items-center gap-2 text-xs text-slate-300"><span className={`size-2 rounded-full ${active ? "bg-emerald-400" : "bg-slate-600"}`} />{active ? "Ready" : "Disabled"}</span>;
}

function AddressActions({ address, copied, onCopy, onOpenInbox, onToggle }) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" className="action-button" aria-label={`Copy ${address.fullAddress}`} onClick={() => onCopy(address)}>{copied ? <Check /> : <Copy />}</button>
      <button type="button" className="action-button" aria-label={`Open inbox for ${address.fullAddress}`} onClick={() => onOpenInbox(address.id)}><Inbox /></button>
      <button type="button" className="action-button" aria-label={`${address.status === "active" ? "Disable" : "Enable"} ${address.fullAddress}`} onClick={() => onToggle(address)}><Power /></button>
    </div>
  );
}
```

- [ ] **Step 4: Add derived state and handlers to the container**

In `src/dashboard/EmailGeneratorView.jsx`, import the new component and helpers:

```js
import { EmailAddressWorkspace } from "./EmailAddressWorkspace";
import {
  createAddressCsv,
  filterEmailAddresses,
  paginateEmailAddresses,
} from "./emailGeneratorUtils";
```

Add state:

```js
const [activeTab, setActiveTab] = useState("addresses");
const [domainFilter, setDomainFilter] = useState("all");
const [filtersOpen, setFiltersOpen] = useState(true);
const [page, setPage] = useState(1);
const [pageSize, setPageSize] = useState(10);
```

Replace the old `filteredAddresses` calculation with:

```js
const filteredAddresses = useMemo(
  () => filterEmailAddresses(addresses, {
    search,
    domain: domainFilter,
    status: statusFilter,
  }),
  [addresses, search, domainFilter, statusFilter],
);
const pagination = useMemo(
  () => paginateEmailAddresses(filteredAddresses, page, pageSize),
  [filteredAddresses, page, pageSize],
);
```

Add reset and export handlers:

```js
function resetFilters() {
  setSearch("");
  setDomainFilter("all");
  setStatusFilter("all");
  setPage(1);
}

function exportAddresses() {
  try {
    const blob = new Blob([createAddressCsv(filteredAddresses)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "vault-generated-emails.csv";
    link.click();
    URL.revokeObjectURL(url);
  } catch {
    setError("Unable to export generated email addresses.");
  }
}

async function openAddressInbox(addressId) {
  await selectAddress(addressId);
  setActiveTab("inbox");
}
```

Reset page to one in every search/domain/status/page-size change callback.

- [ ] **Step 5: Replace the old address list with the workspace component**

Inside the large workspace panel, render the address tab header and component:

```jsx
<EmailAddressWorkspace
  addresses={filteredAddresses}
  visibleAddresses={pagination.items}
  domains={domains}
  search={search}
  domainFilter={domainFilter}
  statusFilter={statusFilter}
  filtersOpen={filtersOpen}
  copiedId={copiedId}
  loading={loading}
  pagination={pagination}
  pageSize={pageSize}
  onSearchChange={(event) => { setSearch(event.target.value); setPage(1); }}
  onDomainFilterChange={(event) => { setDomainFilter(event.target.value); setPage(1); }}
  onStatusFilterChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}
  onClearFilters={resetFilters}
  onToggleFilters={() => setFiltersOpen((current) => !current)}
  onRefresh={refreshAll}
  onExport={exportAddresses}
  onCopy={copyAddress}
  onOpenInbox={openAddressInbox}
  onToggleAddress={toggleAddress}
  onPageChange={setPage}
  onPageSizeChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}
/>
```

- [ ] **Step 6: Run focused and full tests**

Run: `npm test -- test/email-address-workspace.test.js`

Expected: 2 tests pass.

Run: `npm test`

Expected: all project tests pass.

- [ ] **Step 7: Run lint and commit**

Run: `npm run lint`

Expected: exit code 0.

```bash
git add src/dashboard/EmailAddressWorkspace.jsx src/dashboard/EmailGeneratorView.jsx test/email-address-workspace.test.js
git commit -m "Add generated email management workspace"
```

### Task 4: Integrated Inbox Tab

**Files:**
- Create: `src/dashboard/EmailInboxWorkspace.jsx`
- Create: `test/email-inbox-workspace.test.js`
- Modify: `src/dashboard/EmailGeneratorView.jsx`

- [ ] **Step 1: Write failing inbox render tests**

Create `test/email-inbox-workspace.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EmailInboxWorkspace } from "../src/dashboard/EmailInboxWorkspace.jsx";

const baseProps = {
  addresses: [],
  selectedAddress: null,
  messages: [],
  selectedMessage: null,
  messagesLoading: false,
  onSelectAddress() {},
  onOpenMessage() {},
  onCloseMessage() {},
};

test("renders the inbox empty state", () => {
  const html = renderToStaticMarkup(createElement(EmailInboxWorkspace, baseProps));
  assert.match(html, /Select an address to view its inbox/);
});

test("renders safe message details and a back action", () => {
  const html = renderToStaticMarkup(
    createElement(EmailInboxWorkspace, {
      ...baseProps,
      selectedAddress: { id: "a", fullAddress: "private@example.com" },
      selectedMessage: {
        subject: "Welcome",
        sender: "sender@example.com",
        recipient: "private@example.com",
        receivedAt: "2026-07-17T08:00:00Z",
        headers: { "message-id": "safe-id" },
        textBody: "Plain text only",
      },
    }),
  );

  assert.match(html, /Back to inbox/);
  assert.match(html, /Plain text only/);
  assert.match(html, /Safe headers/);
  assert.doesNotMatch(html, /dangerouslySetInnerHTML/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- test/email-inbox-workspace.test.js`

Expected: FAIL because `EmailInboxWorkspace.jsx` does not exist.

- [ ] **Step 3: Extract the inbox presentation**

Create `src/dashboard/EmailInboxWorkspace.jsx`:

```jsx
import { ArrowLeft, Inbox, Mail } from "lucide-react";

function formatInboxDate(value) {
  if (!value) return "Never";
  const date = new Date(`${value}${value.endsWith("Z") ? "" : "Z"}`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function EmailInboxWorkspace({
  addresses,
  selectedAddress,
  messages,
  selectedMessage,
  messagesLoading,
  onSelectAddress,
  onOpenMessage,
  onCloseMessage,
}) {
  return (
    <div className="grid min-h-[430px] xl:grid-cols-[0.38fr_0.62fr]">
      <aside className="border-b border-white/8 xl:border-b-0 xl:border-r">
        <div className="border-b border-white/8 p-4">
          <div className="flex items-center gap-2.5"><Inbox className="size-5 text-cyan-300" /><h2 className="font-semibold">Mailboxes</h2></div>
          <p className="mt-1 text-xs text-slate-500">Choose an address to view received mail.</p>
        </div>
        {!addresses.length ? (
          <p className="p-5 text-sm text-slate-400">Generate an address before opening the inbox.</p>
        ) : (
          <div className="max-h-[430px] overflow-y-auto">
            {addresses.map((address) => (
              <button key={address.id} type="button" onClick={() => onSelectAddress(address.id)} className={`flex w-full items-start gap-3 border-b border-white/[0.06] p-4 text-left ${selectedAddress?.id === address.id ? "bg-cyan-400/[0.055]" : "hover:bg-white/[0.02]"}`}>
                <span className="grid size-8 shrink-0 place-items-center rounded-full border border-cyan-300/20 text-cyan-300"><Mail className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block break-all text-sm font-medium text-slate-200">{address.fullAddress}</span><span className="mt-1 block text-xs text-slate-500">{address.messageCount} messages · {address.unreadCount} unread</span></span>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section>
        <div className="border-b border-white/8 p-4">
          <h2 className="break-all font-semibold text-cyan-300">{selectedAddress ? selectedAddress.fullAddress : "Inbox"}</h2>
          <p className="mt-1 text-xs text-slate-500">{selectedAddress ? `${messages.length} received messages` : "Select an address to view its inbox"}</p>
        </div>

        {!selectedAddress ? (
          <p className="p-6 text-sm text-slate-400">Select an address to view its inbox.</p>
        ) : selectedMessage ? (
          <article className="max-h-[430px] overflow-y-auto p-5">
            <button type="button" onClick={onCloseMessage} className="mb-4 flex items-center gap-2 text-sm text-cyan-300"><ArrowLeft className="size-4" />Back to inbox</button>
            <h3 className="text-lg font-semibold">{selectedMessage.subject || "(No subject)"}</h3>
            <dl className="mt-4 space-y-1 text-xs text-slate-400">
              <div><dt className="inline text-slate-500">From: </dt><dd className="inline break-all">{selectedMessage.sender}</dd></div>
              <div><dt className="inline text-slate-500">To: </dt><dd className="inline break-all">{selectedMessage.recipient}</dd></div>
              <div><dt className="inline text-slate-500">Received: </dt><dd className="inline">{formatInboxDate(selectedMessage.receivedAt)}</dd></div>
            </dl>
            {Object.keys(selectedMessage.headers || {}).length > 0 && (
              <details className="mt-4 rounded-lg border border-white/8 p-3 text-xs text-slate-400">
                <summary className="cursor-pointer text-slate-300">Safe headers</summary>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(selectedMessage.headers, null, 2)}</pre>
              </details>
            )}
            <pre className="mt-5 whitespace-pre-wrap break-words border-t border-white/8 pt-5 font-sans text-sm leading-relaxed text-slate-300">{selectedMessage.textBody || "This message has no plain-text content."}</pre>
          </article>
        ) : messagesLoading ? (
          <p className="p-6 text-sm text-slate-400">Loading inbox...</p>
        ) : !messages.length ? (
          <p className="p-6 text-sm text-slate-400">No messages yet. Incoming mail will be stored permanently here.</p>
        ) : (
          <div className="max-h-[430px] overflow-y-auto">
            {messages.map((message) => (
              <button key={message.id} type="button" onClick={() => onOpenMessage(message.id)} className="flex w-full items-start gap-3 border-b border-white/[0.06] p-4 text-left hover:bg-white/[0.02]">
                <span className={`mt-2 size-2 shrink-0 rounded-full ${message.readAt ? "bg-slate-700" : "bg-cyan-300"}`} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{message.subject || "(No subject)"}</span><span className="mt-1 block truncate text-xs text-slate-400">{message.sender}</span><span className="mt-1 block text-xs text-slate-600">{formatInboxDate(message.receivedAt)}</span></span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Add the workspace tabs and integrate the inbox**

In `EmailGeneratorView.jsx`, create one large panel after the generator panels:

```jsx
<section className="panel mt-4 !p-0 overflow-hidden">
  <div className="flex gap-7 border-b border-white/8 px-5 pt-4">
    <button type="button" onClick={() => setActiveTab("addresses")} className={activeTab === "addresses" ? "border-b-2 border-cyan-300 pb-3 text-sm text-cyan-300" : "pb-3 text-sm text-slate-400"}>
      Generated emails <span className="ml-2 rounded-full bg-cyan-400/15 px-2 py-0.5 text-xs">{addresses.length}</span>
    </button>
    <button type="button" onClick={() => setActiveTab("inbox")} className={activeTab === "inbox" ? "border-b-2 border-cyan-300 pb-3 text-sm text-cyan-300" : "pb-3 text-sm text-slate-400"}>
      Inbox <span className="ml-2 rounded-full bg-white/8 px-2 py-0.5 text-xs">{addresses.reduce((sum, item) => sum + item.unreadCount, 0)}</span>
    </button>
  </div>
  {activeTab === "addresses" ? (
    <EmailAddressWorkspace
      addresses={filteredAddresses}
      visibleAddresses={pagination.items}
      domains={domains}
      search={search}
      domainFilter={domainFilter}
      statusFilter={statusFilter}
      filtersOpen={filtersOpen}
      copiedId={copiedId}
      loading={loading}
      pagination={pagination}
      pageSize={pageSize}
      onSearchChange={(event) => { setSearch(event.target.value); setPage(1); }}
      onDomainFilterChange={(event) => { setDomainFilter(event.target.value); setPage(1); }}
      onStatusFilterChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}
      onClearFilters={resetFilters}
      onToggleFilters={() => setFiltersOpen((current) => !current)}
      onRefresh={refreshAll}
      onExport={exportAddresses}
      onCopy={copyAddress}
      onOpenInbox={openAddressInbox}
      onToggleAddress={toggleAddress}
      onPageChange={setPage}
      onPageSizeChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}
    />
  ) : (
    <EmailInboxWorkspace
      addresses={addresses}
      selectedAddress={selectedAddress}
      messages={messages}
      selectedMessage={selectedMessage}
      messagesLoading={messagesLoading}
      onSelectAddress={selectAddress}
      onOpenMessage={openMessage}
      onCloseMessage={() => setSelectedMessage(null)}
    />
  )}
</section>
```

- [ ] **Step 5: Run focused and full tests**

Run: `npm test -- test/email-inbox-workspace.test.js`

Expected: 2 tests pass.

Run: `npm test`

Expected: all tests pass with zero failures.

- [ ] **Step 6: Run lint and commit**

Run: `npm run lint`

Expected: exit code 0.

```bash
git add src/dashboard/EmailInboxWorkspace.jsx src/dashboard/EmailGeneratorView.jsx test/email-inbox-workspace.test.js
git commit -m "Integrate email inbox workspace"
```

### Task 5: Responsive and Interaction Verification

**Files:**
- Modify: `src/dashboard/EmailGeneratorPanels.jsx`
- Modify: `src/dashboard/EmailAddressWorkspace.jsx`
- Modify: `src/dashboard/EmailInboxWorkspace.jsx`
- Modify: `src/dashboard/EmailGeneratorView.jsx`
- Test: `test/email-generator-panels.test.js`
- Test: `test/email-address-workspace.test.js`
- Test: `test/email-inbox-workspace.test.js`

- [ ] **Step 1: Add failing accessibility assertions**

Extend the render tests to assert:

```js
assert.match(html, /aria-label="Search generated emails"/);
assert.match(html, /aria-label="Previous page"/);
assert.match(html, /aria-label="Next page"/);
assert.match(html, /type="button"/);
```

Add a generator assertion that the submit control is a real submit button and an inbox assertion that the message body is not rendered as HTML.

- [ ] **Step 2: Run tests and verify any missing semantics fail**

Run: `npm test`

Expected: FAIL on the newly added `aria-current="page"` assertion because the active numbered-page button does not yet expose that attribute.

- [ ] **Step 3: Apply the minimal responsive and accessibility fixes**

Ensure the final components include:

- `type="button"` on every non-submit button.
- Specific labels on icon-only actions.
- `aria-current="page"` on the active numbered page button.
- `role="tablist"` on the workspace tab container plus `role="tab"` and `aria-selected` on each generated-email/inbox tab.
- `aria-pressed` on each generator mode control.
- `overflow-x-auto` only on the desktop table wrapper.
- `md:hidden` mobile cards and `hidden md:block` desktop table.
- Wrapped toolbars below `lg` and stacked top panels below `lg`.
- Visible focus styles inherited from existing controls or added with `focus-visible:outline-*` classes.

- [ ] **Step 4: Run the complete automated verification**

Run: `npm test`

Expected: all tests pass with zero failures.

Run: `npm run lint`

Expected: exit code 0.

- [ ] **Step 5: Inspect the running page at desktop width**

Run the appropriate local command:

```bash
npm run dev
```

Open the Email Generator and verify at approximately 1536px width:

- Header metric aligns right.
- Generator panels form two columns.
- Workspace matches the mockup's dense table hierarchy.
- Filters, refresh, export, copy, inbox, and enable/disable actions work.
- Pagination reports correct bounds.
- Inbox opens from the envelope action.

- [ ] **Step 6: Inspect the running page at mobile width**

At approximately 390px width verify:

- Header, metric, and generator panels stack.
- Filter controls remain reachable.
- Address cards replace the desktop table.
- Actions have usable touch targets.
- Inbox list and message detail use a readable single-column flow.
- No horizontal page overflow appears.

- [ ] **Step 7: Commit the final polish**

```bash
git add src/dashboard/EmailGeneratorPanels.jsx src/dashboard/EmailAddressWorkspace.jsx src/dashboard/EmailInboxWorkspace.jsx src/dashboard/EmailGeneratorView.jsx test/email-generator-panels.test.js test/email-address-workspace.test.js test/email-inbox-workspace.test.js
git commit -m "Polish responsive email generator redesign"
```

## Final Verification

- [ ] Run `npm test` and confirm zero failures.
- [ ] Run `npm run lint` and confirm exit code 0.
- [ ] Confirm `git diff --check` reports no whitespace errors.
- [ ] Confirm the desktop and mobile manual checks are complete.
- [ ] Do not run `npm run build` unless the user explicitly requests it.

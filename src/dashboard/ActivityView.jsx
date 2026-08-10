import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileDown,
  KeyRound,
  Layers3,
  LogIn,
  LogOut,
  Mail,
  MailPlus,
  MailX,
  MessageSquare,
  Pencil,
  Search,
  Settings,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { SelectField } from "./DashboardUi";

const pageSize = 8;
const categoryFilters = [
  { value: "all", label: "All Activities" },
  { value: "auth", label: "Security" },
  { value: "account", label: "Accounts" },
  { value: "email", label: "Email" },
  { value: "settings", label: "Settings" },
  { value: "backup", label: "Backup" },
  { value: "ai", label: "AI Activity" },
];
const statusFilters = [
  { value: "all", label: "All Status" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
];
const dateFilters = [
  { value: "all", label: "Select date range" },
  { value: "day", label: "Past 24 hours" },
  { value: "week", label: "Past 7 days" },
  { value: "month", label: "Past 30 days" },
  { value: "year", label: "Past year" },
];

export default function ActivityView({ activity, loading, notificationsReadAt, onMarkAllRead, onContextChange }) {
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const searchRef = useRef(null);

  const filteredActivity = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const cutoff = getDateCutoff(dateRange);

    return activity.filter((item) => {
      const unread = isUnread(item, notificationsReadAt);
      const matchesCategory = category === "all" || getCategory(item) === category;
      const matchesStatus = status === "all" || (status === "unread" ? unread : !unread);
      const matchesDate = !cutoff || parseActivityDate(item.created_at) >= cutoff;
      const searchableText = `${item.description || ""} ${item.event_type || ""} ${getActivityDetail(item)}`.toLowerCase();
      return matchesCategory && matchesStatus && matchesDate && (!normalizedQuery || searchableText.includes(normalizedQuery));
    });
  }, [activity, category, dateRange, notificationsReadAt, query, status]);

  const pageCount = Math.max(1, Math.ceil(filteredActivity.length / pageSize));
  const visibleActivity = useMemo(
    () => filteredActivity.slice((page - 1) * pageSize, page * pageSize),
    [filteredActivity, page],
  );
  const unreadCount = activity.filter((item) => isUnread(item, notificationsReadAt)).length;

  useEffect(() => {
    setPage(1);
    setExpandedId("");
  }, [category, dateRange, query, status]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  useEffect(() => {
    onContextChange?.({
      filters: {
        query: query || "none",
        category,
        status,
        dateRange,
      },
      page,
      totalMatching: filteredActivity.length,
      visibleItems: visibleActivity.map((item) => ({
        description: item.description || humanizeEventType(item.event_type),
        eventType: item.event_type,
        detail: getActivityDetail(item),
        severity: item.severity || "info",
        createdAt: item.created_at,
        unread: isUnread(item, notificationsReadAt),
      })),
    });
  }, [category, dateRange, filteredActivity.length, notificationsReadAt, onContextChange, page, query, status, visibleActivity]);

  useEffect(() => {
    function focusSearch(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }

    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);

  function exportActivity() {
    const rows = filteredActivity.map((item) => [
      item.description || "Activity",
      getActivityDetail(item),
      getCategoryVisual(item).label,
      isUnread(item, notificationsReadAt) ? "Unread" : "Read",
      formatActivityDate(item.created_at),
    ]);
    const csv = [["Activity", "Details", "Category", "Status", "Date & Time"], ...rows]
      .map((row) => row.map(escapeCsvCell).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `vault-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="activity-page flex min-h-0 flex-col overflow-hidden rounded-2xl border border-cyan-100/10 bg-[radial-gradient(circle_at_40%_0%,rgba(20,107,132,0.08),transparent_35%),linear-gradient(145deg,rgba(5,18,27,0.94),rgba(2,10,16,0.96))] shadow-[inset_0_1px_rgba(255,255,255,0.02),0_24px_80px_rgba(0,0,0,0.12)]">
      <div className="activity-mobile-intro md:hidden">
        <span><Activity /></span>
        <div>
          <h1>Activity</h1>
          <p>Track what's happening in your vault</p>
        </div>
      </div>
      <div className="activity-controls shrink-0 p-4 sm:p-5">
        <div className="grid gap-3 xl:grid-cols-[minmax(230px,1.35fr)_minmax(160px,.75fr)_minmax(150px,.75fr)_minmax(190px,1fr)_auto_auto]">
          <label className="activity-search form-control flex min-h-11 items-center gap-2.5 bg-[#06121a] px-3 focus-within:border-cyan-300/60 focus-within:shadow-[0_0_0_3px_rgba(34,211,238,0.08)]">
            <Search className="size-[18px] shrink-0 text-slate-400" />
            <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activities..." className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500" />
            <kbd className="hidden rounded-md border border-white/[0.07] bg-white/[0.05] px-2 py-1 text-[0.65rem] text-slate-400 sm:block">Ctrl K</kbd>
          </label>
          <div className="activity-filter-field activity-filter-category">
            <span className="activity-filter-label md:hidden"><Layers3 /> Activity type</span>
            <SelectField name="activity-category" value={category} onChange={(event) => setCategory(event.target.value)} options={categoryFilters} ariaLabel="Filter by activity category" className="min-h-11 bg-[#06121a] text-sm" />
          </div>
          <div className="activity-filter-field activity-filter-status">
            <span className="activity-filter-label md:hidden"><CheckCircle2 /> Status</span>
            <SelectField name="activity-status" value={status} onChange={(event) => setStatus(event.target.value)} options={statusFilters} ariaLabel="Filter by read status" className="min-h-11 bg-[#06121a] text-sm" />
          </div>
          <div className="activity-filter-field activity-filter-date">
            <span className="activity-filter-label md:hidden"><CalendarDays /> Date range</span>
            <SelectField name="activity-date" value={dateRange} onChange={(event) => setDateRange(event.target.value)} options={dateFilters} ariaLabel="Filter by date range" leadingIcon={<CalendarDays className="size-4 shrink-0 text-slate-400 md:block hidden" />} className="min-h-11 bg-[#06121a] text-sm" />
          </div>
          <button type="button" onClick={exportActivity} disabled={!filteredActivity.length} className="activity-export flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#06121a] px-4 text-sm font-medium text-slate-200 transition hover:border-cyan-300/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
            <Download className="size-4" /> Export
          </button>
          <button type="button" onClick={onMarkAllRead} disabled={!unreadCount} className="activity-mark-read flex min-h-11 items-center justify-center gap-2 rounded-lg border border-cyan-300/40 bg-gradient-to-r from-cyan-500 to-cyan-400 px-4 text-sm font-semibold text-[#001217] shadow-[0_8px_24px_rgba(6,182,212,0.18)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45">
            <CheckCircle2 className="size-[18px]" /> Mark all as read
          </button>
        </div>
      </div>

      {loading ? (
        <p className="grid min-h-0 flex-1 place-items-center border-t border-cyan-100/10 text-center text-sm text-slate-400">Loading activity...</p>
      ) : (
        <div className="activity-results mx-4 mb-4 flex min-h-0 flex-1 flex-col sm:mx-5 sm:mb-5">
          <div className="activity-mobile-results-heading md:hidden">
            <h2><Activity /> Recent activity</h2>
            <span>{filteredActivity.length} total</span>
          </div>
          <div className="hidden shrink-0 grid-cols-[8px_42px_minmax(220px,1.7fr)_minmax(95px,.65fr)_90px_150px_18px] items-center gap-3 rounded-t-xl border border-cyan-100/10 bg-white/[0.035] px-4 py-3 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-slate-500 md:grid">
            <span /><span /><span>Activity</span><span>Category</span><span>Status</span><span>Date &amp; Time</span><span />
          </div>

          <div className="activity-list min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-cyan-100/10 md:rounded-t-none md:border-t-0">
            {visibleActivity.map((item) => {
              const unread = isUnread(item, notificationsReadAt);
              const visual = getEventVisual(item);
              const categoryVisual = getCategoryVisual(item);
              const Icon = visual.icon;
              const expanded = expandedId === item.id;

              return (
                <article key={item.id} className={`activity-entry border-b border-cyan-100/[0.08] last:border-b-0 ${unread ? "is-unread bg-cyan-300/[0.045]" : "bg-[#050d12]/55"}`}>
                  <button type="button" onClick={() => setExpandedId(expanded ? "" : item.id)} className="grid min-h-[70px] w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-3 text-left transition hover:bg-cyan-300/[0.035] md:grid-cols-[8px_42px_minmax(220px,1.7fr)_minmax(95px,.65fr)_90px_150px_18px] md:px-4" aria-expanded={expanded}>
                    <span className={`hidden size-2 rounded-full md:block ${unread ? "bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.8)]" : "bg-transparent"}`} />
                    <span className={`grid size-10 shrink-0 place-items-center rounded-lg border ${visual.tone}`}><Icon className="size-5" /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-100">{item.description || humanizeEventType(item.event_type)}</span>
                      <span className="mt-1 block truncate text-xs text-slate-400">{getActivityDetail(item)}</span>
                    </span>
                    <span className={`hidden w-fit rounded-md border px-2 py-1 text-[0.68rem] font-medium md:inline-flex ${categoryVisual.tone}`}>{categoryVisual.label}</span>
                    <span className={`hidden w-fit items-center gap-1.5 rounded-md border px-2 py-1 text-[0.68rem] font-medium md:inline-flex ${unread ? "border-cyan-300/25 bg-cyan-300/[0.05] text-cyan-300" : "border-white/10 bg-white/[0.025] text-slate-400"}`}><span className={`size-1.5 rounded-full ${unread ? "bg-cyan-300" : "bg-slate-500"}`} />{unread ? "Unread" : "Read"}</span>
                    <time className="hidden text-xs text-slate-400 md:block">{formatActivityDate(item.created_at)}</time>
                    <ChevronRight className={`size-4 text-slate-500 transition-transform ${expanded ? "rotate-90 text-cyan-300" : ""}`} />
                    <span className="col-span-3 flex items-center justify-between pl-[52px] text-[0.68rem] md:hidden">
                      <span className="flex items-center gap-2"><span className={`rounded border px-1.5 py-0.5 ${categoryVisual.tone}`}>{categoryVisual.label}</span><span className={unread ? "text-cyan-300" : "text-slate-500"}>{unread ? "Unread" : "Read"}</span></span>
                      <time className="text-slate-500">{formatActivityDate(item.created_at)}</time>
                    </span>
                  </button>
                  {expanded && (
                    <div className="grid gap-3 border-t border-cyan-100/[0.07] bg-black/10 px-5 py-3 text-xs text-slate-400 sm:grid-cols-3 md:pl-[78px]">
                      <Detail label="Event" value={item.event_type} />
                      <Detail label="Severity" value={item.severity || "info"} capitalize />
                      <Detail label="Device" value={item.metadata?.deviceType || "Not recorded"} />
                    </div>
                  )}
                </article>
              );
            })}

            {!filteredActivity.length && (
              <div className="grid min-h-full place-items-center bg-[#050d12]/55 p-8 text-center">
                <div>
                  <span className="mx-auto grid size-12 place-items-center rounded-full border border-cyan-300/15 bg-cyan-300/[0.05] text-cyan-300"><Activity className="size-5" /></span>
                  <p className="mt-4 text-sm font-medium text-slate-300">No matching activity</p>
                  <p className="mt-1 text-xs text-slate-500">Adjust your search or filters to see more results.</p>
                </div>
              </div>
            )}
          </div>

          {!!filteredActivity.length && (
            <div className="activity-pagination flex shrink-0 flex-col items-center justify-between gap-3 px-0 pt-4 sm:flex-row">
              <p className="text-xs text-slate-400">Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredActivity.length)} of {filteredActivity.length} activities</p>
              <div className="flex items-center gap-2">
                <PageButton label="Previous page" disabled={page === 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft /></PageButton>
                {getPageItems(page, pageCount).map((item, index) => item === "ellipsis" ? (
                  <span key={`ellipsis-${index}`} className="activity-pagination-ellipsis grid size-9 place-items-center text-xs text-slate-500">...</span>
                ) : (
                  <PageButton key={item} active={page === item} label={`Page ${item}`} onClick={() => setPage(item)}>{item}</PageButton>
                ))}
                <PageButton label="Next page" disabled={page === pageCount} onClick={() => setPage((current) => current + 1)}><ChevronRight /></PageButton>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Detail({ label, value, capitalize = false }) {
  return <p><span className="block text-[0.65rem] uppercase tracking-wider text-slate-600">{label}</span><span className={`mt-1 block break-all text-slate-300 ${capitalize ? "capitalize" : ""}`}>{value}</span></p>;
}

function PageButton({ children, active = false, disabled = false, label, onClick }) {
  return <button type="button" onClick={onClick} disabled={disabled} aria-label={label} aria-current={active ? "page" : undefined} className={`grid size-9 place-items-center rounded-lg border text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-35 ${active ? "border-cyan-300 bg-cyan-400 text-[#001217] shadow-[0_0_18px_rgba(34,211,238,0.18)]" : "border-white/10 bg-white/[0.025] text-slate-300 hover:border-cyan-300/30 hover:text-cyan-300"}`}>{children}</button>;
}

function getPageItems(page, pageCount) {
  if (pageCount <= 5) return Array.from({ length: pageCount }, (_, index) => index + 1);
  if (page <= 3) return [1, 2, 3, "ellipsis", pageCount];
  if (page >= pageCount - 2) return [1, "ellipsis", pageCount - 2, pageCount - 1, pageCount];
  return [1, "ellipsis", page, "ellipsis", pageCount];
}

function getCategory(item) {
  const eventType = item.event_type || "";
  if (eventType.startsWith("auth.")) return "auth";
  if (eventType.startsWith("account.")) return "account";
  if (eventType.startsWith("email.")) return "email";
  if (eventType.startsWith("settings.")) return "settings";
  if (eventType.startsWith("backup.")) return "backup";
  if (eventType.startsWith("ai.") || eventType.startsWith("chat.")) return "ai";
  return "other";
}

function getCategoryVisual(item) {
  return {
    auth: { label: "Web", tone: "border-emerald-300/20 bg-emerald-300/[0.05] text-emerald-300" },
    account: { label: "Account", tone: "border-violet-300/20 bg-violet-300/[0.05] text-violet-300" },
    email: { label: "Email", tone: "border-sky-300/20 bg-sky-300/[0.05] text-sky-300" },
    settings: { label: "Settings", tone: "border-amber-300/20 bg-amber-300/[0.05] text-amber-300" },
    backup: { label: "Backup", tone: "border-indigo-300/20 bg-indigo-300/[0.05] text-indigo-300" },
    ai: { label: "AI Config", tone: "border-sky-300/20 bg-sky-300/[0.05] text-sky-300" },
    other: { label: "System", tone: "border-slate-300/20 bg-slate-300/[0.05] text-slate-300" },
  }[getCategory(item)];
}

function getEventVisual(item) {
  const eventType = item.event_type || "";
  if (item.severity !== "info") return { icon: ShieldAlert, tone: "border-amber-300/25 bg-amber-300/[0.07] text-amber-300" };
  if (eventType === "email.address.created") return { icon: MailPlus, tone: "border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-300" };
  if (eventType.includes("email.") && eventType.includes("deleted")) return { icon: MailX, tone: "border-rose-300/20 bg-rose-300/[0.06] text-rose-300" };
  if (eventType.startsWith("email.")) return { icon: Mail, tone: "border-sky-300/20 bg-sky-300/[0.06] text-sky-300" };
  if (eventType === "auth.logout") return { icon: LogOut, tone: "border-slate-300/20 bg-slate-300/[0.05] text-slate-300" };
  if (eventType.startsWith("auth.login") || eventType.includes("totp_login")) return { icon: LogIn, tone: "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-300" };
  if (eventType.includes("deleted")) return { icon: Trash2, tone: "border-rose-300/20 bg-rose-300/[0.06] text-rose-300" };
  if (eventType.includes("updated") || eventType.includes("changed")) return { icon: Pencil, tone: "border-sky-300/20 bg-sky-300/[0.06] text-sky-300" };
  if (eventType.includes("viewed")) return { icon: Eye, tone: "border-violet-300/20 bg-violet-300/[0.06] text-violet-300" };
  if (eventType.startsWith("account.")) return { icon: KeyRound, tone: "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-300" };
  if (eventType.startsWith("settings.")) return { icon: Settings, tone: "border-sky-300/20 bg-sky-300/[0.06] text-sky-300" };
  if (eventType.startsWith("backup.")) return { icon: FileDown, tone: "border-violet-300/20 bg-violet-300/[0.06] text-violet-300" };
  if (eventType.startsWith("chat.")) return { icon: MessageSquare, tone: "border-violet-300/20 bg-violet-300/[0.06] text-violet-300" };
  if (eventType.startsWith("ai.")) return { icon: Bot, tone: "border-sky-300/20 bg-sky-300/[0.06] text-sky-300" };
  return { icon: Activity, tone: "border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-300" };
}

function getActivityDetail(item) {
  const metadata = item.metadata || {};
  return metadata.fullAddress || metadata.email || metadata.platform || metadata.deviceType || humanizeEventType(item.event_type);
}

function humanizeEventType(value = "") {
  return value.split(".").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" · ");
}

function isUnread(item, readAt) {
  if (!readAt) return true;
  return parseActivityDate(item.created_at) > new Date(readAt);
}

function getDateCutoff(range) {
  const days = { day: 1, week: 7, month: 30, year: 365 }[range];
  return days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;
}

function parseActivityDate(value) {
  return new Date(`${value}${value?.endsWith("Z") ? "" : "Z"}`);
}

function formatActivityDate(value) {
  const date = parseActivityDate(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function escapeCsvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

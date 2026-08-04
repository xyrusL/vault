import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileDown,
  Funnel,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  MailCheck,
  MailPlus,
  MailX,
  MessageSquare,
  Pencil,
  Settings,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { SelectField } from "./DashboardUi";

const pageSize = 8;
const filters = [
  { value: "all", label: "All activities" },
  { value: "auth", label: "Security" },
  { value: "account", label: "Accounts" },
  { value: "email", label: "Email" },
  { value: "settings", label: "Settings" },
  { value: "backup", label: "Backup" },
  { value: "ai", label: "AI activity" },
];

export default function ActivityView({ activity, loading, notificationsReadAt, onMarkAllRead }) {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState("");
  const filteredActivity = useMemo(
    () => activity.filter((item) => filter === "all" || getCategory(item) === filter),
    [activity, filter],
  );
  const pageCount = Math.max(1, Math.ceil(filteredActivity.length / pageSize));
  const visibleActivity = filteredActivity.slice((page - 1) * pageSize, page * pageSize);
  const unreadCount = activity.filter((item) => isUnread(item, notificationsReadAt)).length;

  useEffect(() => {
    setPage(1);
    setExpandedId("");
  }, [filter]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <section className="activity-page flex min-h-0 flex-col overflow-hidden rounded-2xl border border-cyan-100/10 bg-gradient-to-br from-[#07151c]/80 to-[#040b10]/90 shadow-[inset_0_1px_rgba(255,255,255,0.02)]">
      <div className="flex shrink-0 justify-end p-4 sm:px-5 sm:py-4">
        <div className="flex w-full flex-col gap-2 min-[480px]:w-auto min-[480px]:flex-row">
          <button type="button" onClick={onMarkAllRead} disabled={!unreadCount} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-cyan-400/35 px-4 text-sm font-medium text-cyan-300 transition hover:bg-cyan-300/[0.06] disabled:cursor-not-allowed disabled:opacity-45">
            <MailCheck className="size-4" /> Mark all as read
          </button>
          <SelectField name="activity-filter" value={filter} onChange={(event) => setFilter(event.target.value)} options={filters} ariaLabel="Filter activity" leadingIcon={<Funnel className="size-4 shrink-0 text-slate-400" />} className="min-h-11 min-w-44 bg-[#071219] text-sm" />
        </div>
      </div>
      {loading ? (
        <p className="grid min-h-0 flex-1 place-items-center border-t border-cyan-100/10 text-center text-sm text-slate-400">
          Loading activity...
        </p>
      ) : (
        <div className="mx-4 mb-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-cyan-100/10 sm:mx-5 sm:mb-5">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {visibleActivity.map((item) => {
            const unread = isUnread(item, notificationsReadAt);
            const visual = getEventVisual(item);
            const Icon = visual.icon;
            const expanded = expandedId === item.id;

            return (
              <article key={item.id} className={`border-b border-cyan-100/[0.09] last:border-b-0 ${unread ? "bg-cyan-300/[0.055]" : "bg-[#050d12]/45"}`}>
                <button type="button" onClick={() => setExpandedId(expanded ? "" : item.id)} className="grid min-h-[62px] w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-3 text-left transition hover:bg-cyan-300/[0.035] sm:grid-cols-[8px_38px_minmax(240px,1fr)_78px_180px_20px] sm:gap-3 sm:px-4" aria-expanded={expanded}>
                  <span className={`hidden size-2 rounded-full sm:block ${unread ? "bg-cyan-300 shadow-[0_0_0_4px_rgba(34,211,238,0.06)]" : "bg-transparent"}`} />
                  <span className={`grid size-9 shrink-0 place-items-center rounded-lg border ${visual.tone}`}><Icon className="size-[18px]" /></span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-100">{item.description}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-400">{getActivityDetail(item)}</span>
                  </span>
                  <span className={`hidden w-fit rounded-md border px-2 py-1 text-[0.68rem] font-medium sm:inline-flex ${unread ? "border-cyan-300/30 bg-cyan-300/[0.06] text-cyan-300" : "border-white/10 bg-white/[0.025] text-slate-400"}`}>{unread ? "Unread" : "Read"}</span>
                  <time className="hidden text-right text-xs text-slate-400 sm:block">{formatActivityDate(item.created_at)}</time>
                  <ChevronRight className={`size-4 text-slate-400 transition-transform ${expanded ? "rotate-90 text-cyan-300" : ""}`} />
                  <span className="col-span-3 flex items-center justify-between pl-12 text-[0.68rem] sm:hidden">
                    <span className={unread ? "text-cyan-300" : "text-slate-500"}>{unread ? "Unread" : "Read"}</span>
                    <time className="text-slate-500">{formatActivityDate(item.created_at)}</time>
                  </span>
                </button>
                {expanded && (
                  <div className="grid gap-3 border-t border-cyan-100/[0.07] bg-black/10 px-5 py-3 text-xs text-slate-400 sm:grid-cols-3 sm:pl-[66px]">
                    <p><span className="block text-[0.65rem] uppercase tracking-wider text-slate-600">Event</span><span className="mt-1 block break-all text-slate-300">{item.event_type}</span></p>
                    <p><span className="block text-[0.65rem] uppercase tracking-wider text-slate-600">Severity</span><span className="mt-1 block capitalize text-slate-300">{item.severity || "info"}</span></p>
                    <p><span className="block text-[0.65rem] uppercase tracking-wider text-slate-600">Device</span><span className="mt-1 block text-slate-300">{item.metadata?.deviceType || "Not recorded"}</span></p>
                  </div>
                )}
              </article>
            );
            })}

            {!filteredActivity.length && (
              <div className="grid min-h-full place-items-center bg-[#050d12]/45 p-8 text-center">
                <div>
                  <span className="mx-auto grid size-12 place-items-center rounded-full border border-cyan-300/15 bg-cyan-300/[0.05] text-cyan-300"><Activity className="size-5" /></span>
                  <p className="mt-4 text-sm font-medium text-slate-300">No matching activity</p>
                  <p className="mt-1 text-xs text-slate-500">Try another activity filter.</p>
                </div>
              </div>
            )}
          </div>

          {filteredActivity.length > pageSize && (
            <div className="flex shrink-0 flex-col items-center justify-between gap-3 border-t border-cyan-100/10 bg-[#050d12]/65 px-4 py-2 sm:flex-row">
              <p className="text-xs text-slate-400">
                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredActivity.length)} of {filteredActivity.length} activities
              </p>
              <div className="flex items-center gap-2">
                <PageButton label="Previous page" disabled={page === 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft /></PageButton>
                {getPageItems(page, pageCount).map((item, index) => item === "ellipsis" ? (
                  <span key={`ellipsis-${index}`} className="grid size-9 place-items-center text-xs text-slate-500">...</span>
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

function getEventVisual(item) {
  const eventType = item.event_type || "";
  if (item.severity !== "info") return { icon: ShieldAlert, tone: "border-amber-300/25 bg-amber-300/[0.07] text-amber-300" };
  if (eventType === "email.address.created") return { icon: MailPlus, tone: "border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-300" };
  if (eventType.includes("email.") && eventType.includes("deleted")) return { icon: MailX, tone: "border-rose-300/20 bg-rose-300/[0.06] text-rose-300" };
  if (eventType.startsWith("email.")) return { icon: Mail, tone: "border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-300" };
  if (eventType === "auth.logout") return { icon: LogOut, tone: "border-slate-300/20 bg-slate-300/[0.05] text-slate-300" };
  if (eventType.startsWith("auth.login") || eventType.includes("totp_login")) return { icon: LogIn, tone: "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-300" };
  if (eventType.includes("deleted")) return { icon: Trash2, tone: "border-rose-300/20 bg-rose-300/[0.06] text-rose-300" };
  if (eventType.includes("updated") || eventType.includes("changed")) return { icon: Pencil, tone: "border-sky-300/20 bg-sky-300/[0.06] text-sky-300" };
  if (eventType.includes("viewed")) return { icon: Eye, tone: "border-violet-300/20 bg-violet-300/[0.06] text-violet-300" };
  if (eventType.startsWith("account.")) return { icon: KeyRound, tone: "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-300" };
  if (eventType.startsWith("settings.")) return { icon: Settings, tone: "border-sky-300/20 bg-sky-300/[0.06] text-sky-300" };
  if (eventType.startsWith("backup.")) return { icon: FileDown, tone: "border-violet-300/20 bg-violet-300/[0.06] text-violet-300" };
  if (eventType.startsWith("chat.")) return { icon: MessageSquare, tone: "border-violet-300/20 bg-violet-300/[0.06] text-violet-300" };
  if (eventType.startsWith("ai.")) return { icon: Bot, tone: "border-violet-300/20 bg-violet-300/[0.06] text-violet-300" };
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

function parseActivityDate(value) {
  return new Date(`${value}${value?.endsWith("Z") ? "" : "Z"}`);
}

function formatActivityDate(value) {
  const date = parseActivityDate(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

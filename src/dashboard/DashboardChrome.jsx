import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Blocks,
  ChevronDown,
  CircleGauge,
  CloudDownload,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  MessageSquareText,
  Settings,
  ShieldCheck,
  StickyNote,
  Sun,
  Users,
  X,
} from "lucide-react";

const navigationItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Main" },
  { id: "vault", label: "Vault", icon: LockKeyhole, group: "Main" },
  { id: "accounts", label: "Accounts", icon: Users, group: "Main" },
  { id: "authenticator", label: "Auth 2FA", icon: ShieldCheck, group: "Main" },
  { id: "email-generator", label: "Email Generator", icon: Mail, group: "Tools" },
  { id: "chat-ai", label: "AI Chat", icon: MessageSquareText, group: "Tools" },
  { id: "notes", label: "Notes", icon: StickyNote, group: "Tools" },
  { id: "plugins", label: "Plugins", icon: Blocks, group: "Tools" },
  { id: "activity", label: "Activity Log", icon: CircleGauge, group: "Tools" },
  { id: "backup", label: "Backup", icon: CloudDownload, group: "Tools" },
  { id: "settings", label: "Settings", icon: Settings, group: "Settings" },
];
const navigationGroups = ["Main", "Tools", "Settings"];

const pageDetails = Object.fromEntries(
  navigationItems.map(({ id, label }) => [id, {
    title: label,
    eyebrow: id === "plugins" ? "Connected workspace" : id === "settings" ? "Personal controls" : "",
    text: id === "dashboard"
      ? "Overview of your vault and system activity"
      : id === "vault"
        ? "Store encrypted secrets and control when AI can access them."
      : id === "notes"
        ? "Capture ideas, reminders, and details in your encrypted vault."
        : id === "plugins"
          ? "Configure Spotify, Facebook, Discord, and Google Workspace for secure AI discovery."
        : id === "settings"
          ? "Manage your identity, password, two-factor authentication, and appearance."
        : `Manage your ${label.toLowerCase()} securely`,
  }]),
);

export function Sidebar({ activePage, user, open, onClose, onNavigate, onLogout }) {
  useEffect(() => {
    if (!open) return undefined;

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm lg:hidden"
        />
      )}
      <aside
        className={`dashboard-sidebar fixed inset-y-0 left-0 z-40 flex w-[min(256px,86vw)] flex-col overflow-y-auto overscroll-contain border-r border-cyan-300/10 bg-[#030b11] px-3 py-3 transition-transform duration-300 lg:w-[256px] lg:translate-x-0 lg:overflow-y-hidden ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between px-2">
          <img
            src="/vault-logo.svg"
            alt="Vault"
            className="h-14 w-[116px] object-contain"
          />
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 place-items-center rounded-lg text-slate-400 hover:bg-white/5 lg:hidden"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="mt-3 space-y-3" aria-label="Dashboard navigation">
          {navigationGroups.map((group) => (
            <div key={group}>
              <p className="mb-1 px-3 text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-slate-600">{group}</p>
              <div className="space-y-0.5">
                {navigationItems.filter((item) => item.group === group).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      onNavigate(id);
                      onClose();
                    }}
                    className={`dashboard-tab relative flex h-9 w-full items-center gap-3 overflow-hidden rounded-lg border px-3 text-[0.8rem] font-medium transition ${activePage === id ? "is-active border-cyan-300/15 bg-cyan-300/[0.09] text-cyan-300 shadow-[inset_0_1px_rgba(255,255,255,0.025),0_8px_30px_rgba(1,190,190,0.04)]" : "border-transparent text-slate-400 hover:border-white/[0.04] hover:bg-white/[0.035] hover:text-slate-100"}`}
                    aria-current={activePage === id ? "page" : undefined}
                  >
                    <Icon className="size-[17px]" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-auto shrink-0 pt-3">
          <div className="rounded-xl border border-cyan-100/10 bg-gradient-to-br from-cyan-300/[0.035] to-transparent p-2.5">
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-cyan-400/10 text-sm font-semibold text-cyan-300">
                {user?.displayName?.[0] || "A"}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[0.8rem] font-semibold text-white">{user?.displayName || "Admin"}</p>
                <p className="truncate text-[0.65rem] text-cyan-300">Administrator</p>
              </div>
              <ChevronDown className="ml-auto size-4 text-slate-500" />
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="mt-2 flex h-10 w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 text-[0.8rem] text-slate-400 transition hover:border-white/10 hover:bg-white/[0.045] hover:text-white"
          >
            <LogOut className="size-[19px]" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}

export function DashboardHeader({
  activePage,
  user,
  notificationLevel,
  onMenuOpen,
  onNotifications,
  onNavigate,
  onLogout,
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);
  const page = pageDetails[activePage] || pageDetails.dashboard;
  const notificationLabel = {
    critical: "Critical notification",
    new: "New notification",
    none: "Activity notifications",
  }[notificationLevel];

  useEffect(() => {
    if (!profileOpen) return undefined;

    function closeProfile(event) {
      if (event.key === "Escape") setProfileOpen(false);
      if (event.type === "mousedown" && !profileRef.current?.contains(event.target)) {
        setProfileOpen(false);
      }
    }

    document.addEventListener("keydown", closeProfile);
    document.addEventListener("mousedown", closeProfile);
    return () => {
      document.removeEventListener("keydown", closeProfile);
      document.removeEventListener("mousedown", closeProfile);
    };
  }, [profileOpen]);

  function navigate(page) {
    setProfileOpen(false);
    onNavigate(page);
  }

  return (
    <header className="dashboard-header sticky top-0 z-20 flex min-h-[88px] items-center gap-4 border-b border-cyan-100/[0.07] bg-[#03090d]/88 px-4 backdrop-blur-xl sm:px-7">
      <button
        type="button"
        onClick={onMenuOpen}
        className="grid size-10 place-items-center rounded-lg border border-white/10 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </button>
      <div className="min-w-0">
        {page.eyebrow && <p className="mb-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-cyan-300">{page.eyebrow}</p>}
        <h1 className="truncate text-lg font-semibold tracking-[-0.02em] text-white sm:text-xl">{page.title}</h1>
        <p className={`${page.eyebrow ? "mt-0.5" : "mt-1"} hidden truncate text-xs text-slate-400 min-[480px]:block`}>{page.text}</p>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={onNotifications}
          className="relative grid size-10 place-items-center rounded-full text-slate-400 transition hover:bg-white/5 hover:text-white"
          aria-label={notificationLabel}
        >
          <Bell className="size-5" />
          {notificationLevel !== "none" && (
            <span
              className={`absolute right-2 top-2 size-2 rounded-full ring-2 ring-[#03090d] ${notificationLevel === "critical" ? "bg-red-500" : "bg-cyan-300"}`}
            />
          )}
        </button>
        <button
          type="button"
          onClick={() => onNavigate("settings")}
          className="hidden size-10 place-items-center rounded-full text-slate-400 transition hover:bg-white/5 hover:text-white sm:grid"
          aria-label="Open appearance settings"
        >
          <Sun className="size-5" />
        </button>
        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            className="flex items-center gap-3 rounded-xl p-1 pr-2 transition hover:bg-white/5"
            aria-expanded={profileOpen}
            aria-haspopup="menu"
          >
            <span className="grid size-10 place-items-center rounded-full bg-cyan-400/10 text-cyan-300">
              {user?.displayName?.[0] || "A"}
            </span>
            <span className="hidden max-w-48 truncate text-sm font-medium sm:block">
              {user?.displayName || "Admin"}
            </span>
            <ChevronDown className={`size-4 text-slate-500 transition-transform ${profileOpen ? "rotate-180" : ""}`} />
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-[calc(100%+0.65rem)] w-64 overflow-hidden rounded-xl border border-white/10 bg-[#081117] shadow-2xl shadow-black/50" role="menu">
              <div className="border-b border-white/8 px-4 py-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-cyan-400/10 font-medium text-cyan-300">{user?.displayName?.[0] || "A"}</span>
                  <div className="min-w-0"><p className="truncate text-sm font-medium text-white">{user?.displayName || "Admin"}</p><p className="mt-0.5 truncate text-xs text-slate-500">{user?.email || "Administrator"}</p></div>
                </div>
              </div>
              <div className="p-2">
                <button type="button" role="menuitem" onClick={() => navigate("settings")} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white"><Settings className="size-4" /> Account settings</button>
                <button type="button" role="menuitem" onClick={() => navigate("activity")} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white"><CircleGauge className="size-4" /> Activity log</button>
              </div>
              <div className="border-t border-white/8 p-2">
                <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); onLogout(); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-300 hover:bg-red-400/8"><LogOut className="size-4" /> Sign out</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

import { useEffect, useRef, useState } from "react";
import {
  Bell,
  ChevronDown,
  CircleGauge,
  CloudDownload,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

const navigationItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "accounts", label: "Accounts", icon: Users },
  { id: "activity", label: "Activity Log", icon: CircleGauge },
  { id: "backup", label: "Backup", icon: CloudDownload },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({ activePage, open, onClose, onNavigate, onLogout }) {
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
        className={`dashboard-sidebar fixed inset-y-0 left-0 z-40 flex w-[min(256px,86vw)] flex-col overflow-y-auto overscroll-contain border-r border-white/10 bg-[#050c11] p-4 transition-transform duration-300 lg:w-[256px] lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-20 items-center justify-between border-b border-white/8 px-2">
          <img
            src="/vault-logo.svg"
            alt="Vault"
            className="h-[74px] w-[145px] object-contain"
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

        <nav className="mt-5 space-y-1.5" aria-label="Dashboard navigation">
          {navigationItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                onNavigate(id);
                onClose();
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${activePage === id ? "bg-cyan-400/10 text-cyan-300" : "text-slate-400 hover:bg-white/[0.04] hover:text-white"}`}
            >
              <Icon className="size-[19px]" />
              {label}
            </button>
          ))}
        </nav>

        <div className="mt-auto">
          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <ShieldCheck className="size-4 text-cyan-300" />
              Encrypted vault
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Credentials are encrypted before storage.
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="mt-4 flex w-full items-center gap-3 border-t border-white/8 px-4 pt-5 text-sm text-slate-400 transition hover:text-white"
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
  user,
  notificationLevel,
  onMenuOpen,
  onNotifications,
  onNavigate,
  onLogout,
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);
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
    <header className="sticky top-0 z-20 flex h-[76px] items-center gap-4 border-b border-white/10 bg-[#03090d]/90 px-4 backdrop-blur-xl sm:px-7">
      <button
        type="button"
        onClick={onMenuOpen}
        className="grid size-10 place-items-center rounded-lg border border-white/10 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </button>
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

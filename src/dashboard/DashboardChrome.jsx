import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, CircleGauge, LogOut, Menu, Settings, Sun } from "lucide-react";
import { pageDetails } from "./shared/navigation";

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
      <img src="/vault-logo-horizontal.svg" alt="Vault" className="dashboard-mobile-logo hidden h-12 w-[116px] object-contain lg:hidden" />
      <div className="dashboard-page-heading min-w-0">
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
            <span className="dashboard-profile-name hidden max-w-48 truncate text-sm font-medium sm:block">
              {user?.displayName || "Admin"}
            </span>
            <ChevronDown className={`dashboard-profile-chevron size-4 text-slate-500 transition-transform ${profileOpen ? "rotate-180" : ""}`} />
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

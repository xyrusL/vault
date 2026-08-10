import { ChevronDown, LogOut } from "lucide-react";
import { navigationGroups, navigationItems } from "./navigation";

export default function NavigationPanel({ activePage, user, onNavigate, onLogout }) {
  return (
    <>
      <div className="sidebar-brand flex h-14 shrink-0 items-center px-2">
        <img src="/vault-logo-horizontal.svg" alt="Vault" className="h-10 w-[128px] object-contain object-left" />
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
                  onClick={() => onNavigate(id)}
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
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-cyan-400/10 text-sm font-semibold text-cyan-300">{user?.displayName?.[0] || "A"}</span>
            <div className="min-w-0">
              <p className="truncate text-[0.8rem] font-semibold text-white">{user?.displayName || "Admin"}</p>
              <p className="truncate text-[0.65rem] text-cyan-300">Administrator</p>
            </div>
            <ChevronDown className="ml-auto size-4 text-slate-500" />
          </div>
        </div>
        <button type="button" onClick={onLogout} className="mt-2 flex h-10 w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 text-[0.8rem] text-slate-400 transition hover:border-white/10 hover:bg-white/[0.045] hover:text-white">
          <LogOut className="size-[19px]" /> Sign out
        </button>
      </div>
    </>
  );
}

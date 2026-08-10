import { useEffect } from "react";
import { X } from "lucide-react";
import NavigationPanel from "../shared/NavigationPanel";

export default function MobileDrawer({ open, onClose, onNavigate, ...props }) {
  useEffect(() => {
    if (!open) return undefined;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  function navigate(page) {
    onNavigate(page);
    onClose();
  }

  return (
    <div className="lg:hidden">
      {open && <button type="button" aria-label="Close navigation" onClick={onClose} className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm" />}
      <aside className={`dashboard-sidebar fixed inset-y-0 left-0 z-40 flex w-[min(256px,86vw)] flex-col overflow-y-auto overscroll-contain border-r border-cyan-300/10 bg-[#030b11] px-3 py-3 transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <button type="button" onClick={onClose} className="absolute right-3 top-4 grid size-11 place-items-center rounded-lg text-slate-400 hover:bg-white/5" aria-label="Close menu">
          <X className="size-5" />
        </button>
        <NavigationPanel {...props} onNavigate={navigate} />
      </aside>
    </div>
  );
}

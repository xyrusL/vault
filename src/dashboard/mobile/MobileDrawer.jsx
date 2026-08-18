import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import NavigationPanel from "../shared/NavigationPanel";

export default function MobileDrawer({ open, onClose, onNavigate, ...props }) {
  const drawerRef = useRef(null);
  const openerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    openerRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => drawerRef.current?.querySelector("button")?.focus());

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = [...drawerRef.current.querySelectorAll("button, a, input, [tabindex]:not([tabindex=\"-1\"])")].filter((element) => !element.disabled);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus?.();
    };
  }, [open, onClose]);

  function navigate(page) {
    onNavigate(page);
    onClose();
  }

  return (
    <div className="lg:hidden">
      {open && <button type="button" aria-label="Close navigation" onClick={onClose} className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm" />}
      {open && <aside ref={drawerRef} role="dialog" aria-modal="true" aria-label="Dashboard navigation" className="dashboard-sidebar fixed inset-y-0 left-0 z-40 flex w-[min(256px,86vw)] flex-col overflow-y-auto overscroll-contain border-r border-cyan-300/10 bg-[#030b11] px-3 py-3 transition-transform duration-300 translate-x-0">
        <button type="button" onClick={onClose} className="absolute right-3 top-4 grid size-11 place-items-center rounded-lg text-slate-400 hover:bg-white/5" aria-label="Close menu">
          <X className="size-5" />
        </button>
        <NavigationPanel {...props} onNavigate={navigate} />
      </aside>}
    </div>
  );
}

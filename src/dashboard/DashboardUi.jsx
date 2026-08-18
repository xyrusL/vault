import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";

export function Modal({ title, description, children, onClose, size = "default", header, className = "" }) {
  const dialogRef = useRef(null);
  const openerRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    openerRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      const firstFocusable = dialogRef.current?.querySelector("button, input, textarea, select, [tabindex]:not([tabindex=\"-1\"])");
      firstFocusable?.focus();
    });

    function handleKeyDown(event) {
      const dialogs = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')];
      if (event.key === "Escape") {
        if (dialogs.at(-1) !== dialogRef.current) return;
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll("button, input, textarea, select, [tabindex]:not([tabindex=\"-1\"])")].filter((element) => !element.disabled);
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
  }, []);

  return createPortal(
    <div
      className="modal-layer fixed inset-0 z-[70] grid place-items-center overflow-y-auto overscroll-contain bg-black/75 px-4 py-4 backdrop-blur-sm sm:py-8"
      onMouseDown={onClose}
    >
      <section
        className={`logout-modal w-full rounded-2xl border border-white/10 bg-[#081117] p-4 shadow-2xl sm:p-5 ${size === "wide" ? "max-w-[900px]" : size === "note" ? "max-h-[calc(100dvh-2rem)] max-w-[760px] overflow-hidden [padding:0]" : size === "authenticator-camera" ? "max-w-[960px] bg-[radial-gradient(circle_at_82%_10%,rgba(8,145,178,0.08),transparent_32%),linear-gradient(145deg,#091721,#061018)] sm:!p-4" : size === "authenticator" ? "max-w-[760px] bg-[radial-gradient(circle_at_82%_10%,rgba(8,145,178,0.08),transparent_32%),linear-gradient(145deg,#091721,#061018)] sm:!p-4" : size === "account" ? "max-h-[90dvh] max-w-[680px] overflow-y-auto sm:p-5" : size === "endpoint-manager" ? "max-h-[min(620px,calc(100dvh-2rem))] max-w-[860px] overflow-hidden bg-gradient-to-br from-[#091721] to-[#061018] [padding:0]" : size === "endpoint" ? "max-h-[calc(100dvh-2rem)] max-w-[620px] overflow-y-auto bg-gradient-to-br from-[#091721] to-[#061018] sm:p-4" : "max-w-[480px]"} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={dialogRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {header || (
          <div className="flex items-center justify-between gap-4">
            <div><h2 className="text-lg font-semibold sm:text-xl">{title}</h2>{description && <p className="mt-1 text-sm text-slate-400">{description}</p>}</div>
            <button
              type="button"
              onClick={onClose}
              className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white"
              aria-label="Close dialog"
            >
              <X className="size-5" />
            </button>
          </div>
        )}
        {children}
      </section>
    </div>,
    document.body,
  );
}

export function Field({ label, className = "", ...inputProps }) {
  return (
    <label className="block min-w-0">
      <span className="mb-2 block text-xs text-slate-400">{label}</span>
      <input {...inputProps} className={`form-control ${className}`.trim()} />
    </label>
  );
}

export function SelectField({
  label,
  options,
  className = "",
  name,
  value,
  onChange,
  disabled = false,
  getOptionIcon,
  getOptionStyle,
  leadingIcon,
  ariaLabel,
  textClassName = "",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef(null);
  const selectRef = useRef(null);
  const searchRef = useRef(null);
  const menuRef = useRef(null);
  const [dropdownDirection, setDropdownDirection] = useState("down");
  const [menuPosition, setMenuPosition] = useState(null);
  const selectId = useId();
  const listboxId = `${selectId}-options`;
  const normalizedOptions = options.map((option) => typeof option === "string"
    ? { value: option, label: option }
    : option);
  const filteredOptions = normalizedOptions.filter((option) =>
    `${option.label} ${option.value}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const selectedOption = normalizedOptions.find((option) => option.value === value);
  const selectedIcon = getOptionIcon?.(value, selectedOption);

  useEffect(() => {
    if (!open) return undefined;

    function closeSelect(event) {
      if (event.key === "Escape") setOpen(false);
      if (
        event.type === "mousedown" &&
        !selectRef.current?.contains(event.target)
        && !menuRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", closeSelect);
    document.addEventListener("mousedown", closeSelect);
    return () => {
      document.removeEventListener("keydown", closeSelect);
      document.removeEventListener("mousedown", closeSelect);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(Math.max(0, normalizedOptions.findIndex((option) => option.value === value)));
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [open, value]);

  useEffect(() => {
    if (!filteredOptions.length) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex((current) => Math.min(Math.max(current, 0), filteredOptions.length - 1));
  }, [filteredOptions.length]);

  useLayoutEffect(() => {
    if (!open) return;
    const bounds = selectRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const spaceBelow = window.innerHeight - bounds.bottom;
    const spaceAbove = bounds.top;
    setDropdownDirection(spaceBelow < 300 && spaceAbove > spaceBelow ? "up" : "down");
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !menuRef.current || !selectRef.current) return;
    const trigger = selectRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const gap = 6;
    const top = dropdownDirection === "up"
      ? trigger.top - menu.height - gap
      : trigger.bottom + gap;
    const left = Math.max(8, Math.min(trigger.left, window.innerWidth - menu.width - 8));
    setMenuPosition({ top, left, width: trigger.width });
  }, [open, dropdownDirection, query, filteredOptions.length]);

  function choose(option) {
    onChange?.({ target: { name, value: option.value } });
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function handleSelectKeyDown(event) {
    if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open || !filteredOptions.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + direction + filteredOptions.length) % filteredOptions.length);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : filteredOptions.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(filteredOptions[Math.max(0, activeIndex)]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }

  return (
    <div ref={selectRef} className="block min-w-0">
      {label && <span className="mb-2 block text-xs text-slate-400">{label}</span>}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          ref={triggerRef}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={handleSelectKeyDown}
          className={`form-control flex items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-label={ariaLabel || label}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            {leadingIcon}
            {selectedIcon && <img src={selectedIcon} alt="" className="size-5 shrink-0 rounded object-contain" />}
            <span className={`truncate ${textClassName}`.trim()} style={getOptionStyle?.(value, selectedOption)} title={selectedOption?.label || value}>{selectedOption?.label || value}</span>
          </span>
          <ChevronDown className={`size-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180 text-cyan-300" : ""}`} />
        </button>
        {open && createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            className="fixed z-[100] flex max-h-[min(22rem,calc(100dvh-2rem))] min-w-44 flex-col overflow-hidden rounded-lg border border-white/15 bg-[#071016] p-1 shadow-2xl shadow-black/60"
            style={{
              top: menuPosition?.top ?? -9999,
              left: menuPosition?.left ?? -9999,
              width: Math.max(menuPosition?.width || 0, 176),
            }}
            role="listbox"
            onKeyDown={handleSelectKeyDown}
          >
            {options.length > 5 && (
              <label className="sticky top-0 z-10 mb-1 flex items-center gap-2 rounded-md border border-white/10 bg-[#0a151c] px-3">
                <Search className="size-4 shrink-0 text-slate-500" />
                <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type to filter..." className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
              </label>
            )}
            <div className="min-h-0 overflow-y-auto overscroll-contain">
              {filteredOptions.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                  id={`${listboxId}-${String(option.value).replace(/[^a-z0-9_-]/gi, "-")}`}
                  className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm transition ${index === activeIndex ? "bg-white/[0.06] text-white" : option.value === value ? "bg-cyan-300/10 text-cyan-200" : "text-slate-300 hover:bg-white/[0.06] hover:text-white"}`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    {getOptionIcon?.(option.value, option) && <img src={getOptionIcon(option.value, option)} alt="" loading="lazy" className="size-5 shrink-0 rounded object-contain" />}
                    <span className={`truncate ${textClassName}`.trim()} style={getOptionStyle?.(option.value, option)} title={option.label}>{option.label}</span>
                  </span>
                  {option.value === value && <Check className="size-4 shrink-0" />}
                </button>
              ))}
              {!filteredOptions.length && <p className="px-3 py-5 text-center text-xs text-slate-500">No matching options</p>}
            </div>
          </div>,
          document.body,
        )}
      </div>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

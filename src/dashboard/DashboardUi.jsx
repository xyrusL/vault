import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";

export function Modal({ title, description, children, onClose, size = "default", header }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return createPortal(
    <div
      className="modal-layer fixed inset-0 z-[70] grid place-items-center overflow-y-auto overscroll-contain bg-black/75 px-4 py-4 backdrop-blur-sm sm:py-8"
      onMouseDown={onClose}
    >
      <section
        className={`logout-modal w-full rounded-2xl border border-white/10 bg-[#081117] p-4 shadow-2xl sm:p-6 ${size === "wide" ? "max-w-[900px]" : size === "note" ? "max-h-[calc(100dvh-2rem)] max-w-[760px] overflow-hidden [padding:0]" : size === "authenticator" ? "max-h-[calc(100dvh-2rem)] max-w-[700px] overflow-y-auto sm:p-5" : size === "account" ? "max-h-[90dvh] max-w-[680px] overflow-y-auto sm:p-5" : size === "endpoint-manager" ? "max-h-[min(620px,calc(100dvh-2rem))] max-w-[860px] overflow-hidden bg-gradient-to-br from-[#091721] to-[#061018] [padding:0]" : size === "endpoint" ? "max-h-[calc(100dvh-2rem)] max-w-[620px] overflow-y-auto bg-gradient-to-br from-[#091721] to-[#061018] sm:p-4" : "max-w-[560px]"}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {header || (
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="text-lg font-semibold sm:text-xl">{title}</h2>{description && <p className="mt-1 text-sm text-slate-400">{description}</p>}</div>
            <button
              type="button"
              onClick={onClose}
              className="grid size-11 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-white/5"
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
  leadingIcon,
  ariaLabel,
  textClassName = "",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectRef = useRef(null);
  const searchRef = useRef(null);
  const [dropdownDirection, setDropdownDirection] = useState("down");
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
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const bounds = selectRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const spaceBelow = window.innerHeight - bounds.bottom;
    const spaceAbove = bounds.top;
    setDropdownDirection(spaceBelow < 300 && spaceAbove > spaceBelow ? "up" : "down");
  }, [open]);

  function choose(option) {
    onChange?.({ target: { name, value: option.value } });
    setOpen(false);
  }

  return (
    <div ref={selectRef} className="block min-w-0">
      {label && <span className="mb-2 block text-xs text-slate-400">{label}</span>}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
          className={`form-control flex items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel || label}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            {leadingIcon}
            {selectedIcon && <img src={selectedIcon} alt="" className="size-5 shrink-0 rounded object-contain" />}
            <span className={`truncate ${textClassName}`.trim()} title={selectedOption?.label || value}>{selectedOption?.label || value}</span>
          </span>
          <ChevronDown className={`size-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180 text-cyan-300" : ""}`} />
        </button>
        {open && (
          <div className={`absolute inset-x-0 z-50 flex max-h-[min(22rem,calc(100dvh-2rem))] flex-col overflow-hidden rounded-lg border border-white/15 bg-[#071016] p-1 shadow-2xl shadow-black/60 ${dropdownDirection === "up" ? "bottom-[calc(100%+0.35rem)]" : "top-[calc(100%+0.35rem)]"}`} role="listbox">
            {options.length > 5 && (
              <label className="sticky top-0 z-10 mb-1 flex items-center gap-2 rounded-md border border-white/10 bg-[#0a151c] px-3">
                <Search className="size-4 shrink-0 text-slate-500" />
                <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.stopPropagation()} placeholder="Type to filter..." className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
              </label>
            )}
            <div className="min-h-0 overflow-y-auto overscroll-contain">
            {filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => choose(option)}
                className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm transition ${option.value === value ? "bg-cyan-300/10 text-cyan-200" : "text-slate-300 hover:bg-white/[0.06] hover:text-white"}`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  {getOptionIcon?.(option.value, option) && <img src={getOptionIcon(option.value, option)} alt="" loading="lazy" className="size-5 shrink-0 rounded object-contain" />}
                  <span className={`truncate ${textClassName}`.trim()} title={option.label}>{option.label}</span>
                </span>
                {option.value === value && <Check className="size-4 shrink-0" />}
                </button>
              ))}
              {!filteredOptions.length && <p className="px-3 py-5 text-center text-xs text-slate-500">No matching options</p>}
            </div>
          </div>
        )}
      </div>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Check,
  Clipboard,
  Code2,
  Eye,
  EyeOff,
  FileKey2,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Minus,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal,
  Tag,
  Trash2,
} from "lucide-react";
import apiFetch from "../api";
import { Modal, SelectField } from "./DashboardUi";

const secretTypes = [
  { value: "api_key", label: "API key", icon: KeyRound, accent: "cyan" },
  { value: "token", label: "Access token", icon: FileKey2, accent: "emerald" },
  { value: "config", label: "Environment variables", icon: Code2, accent: "amber" },
  { value: "credential", label: "Credential", icon: LockKeyhole, accent: "sky" },
  { value: "other", label: "Other secret", icon: ShieldCheck, accent: "slate" },
];
const emptyDraft = { name: "", type: "api_key", value: "", notes: "" };

const accents = {
  cyan: "border-cyan-300/15 bg-cyan-300/10 text-cyan-300",
  emerald: "border-emerald-300/15 bg-emerald-300/10 text-emerald-300",
  amber: "border-amber-300/15 bg-amber-300/10 text-amber-300",
  sky: "border-sky-300/15 bg-sky-300/10 text-sky-300",
  slate: "border-slate-300/15 bg-slate-300/10 text-slate-300",
};

async function readResult(response, fallback) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || fallback);
  return result;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(`${value}${value.endsWith("Z") ? "" : "Z"}`);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function typeDetails(type) {
  return secretTypes.find((item) => item.value === type) || secretTypes.at(-1);
}

function parseStoredKeySet(value = "") {
  try {
    const parsed = JSON.parse(value);
    if (["env-v1", "keyset-v1"].includes(parsed?.format) && Array.isArray(parsed.entries)) {
      const entries = parsed.entries
        .filter((entry) => entry && typeof entry.key === "string" && typeof entry.value === "string")
        .map(({ key, value: entryValue }) => ({ key, value: entryValue }));
      if (entries.length) return entries;
    }
  } catch {
    return null;
  }
  return null;
}

function parseEnvironmentValue(value = "") {
  const storedEntries = parseStoredKeySet(value);
  if (storedEntries) return storedEntries;

  const entries = value.split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return separator < 0
        ? { key: line.trim(), value: "" }
        : { key: line.slice(0, separator).trim(), value: line.slice(separator + 1) };
    });
  return entries.length ? entries : [{ key: "", value: "" }];
}

function environmentDisplayValue(value) {
  return parseEnvironmentValue(value)
    .filter((entry) => entry.key.trim())
    .map((entry) => `${entry.key.trim()}=${entry.value}`)
    .join("\n");
}

function presentedSecretValue(secret) {
  return secret?.type === "config" || parseStoredKeySet(secret?.value)
    ? environmentDisplayValue(secret?.value)
    : secret?.value || "";
}

function SecretEditor({ initialValue = emptyDraft, title, submitLabel, busy, error, onClose, onSubmit }) {
  const [draft, setDraft] = useState(initialValue);
  const [multipleValues, setMultipleValues] = useState(() => (
    initialValue.type === "config" || Boolean(parseStoredKeySet(initialValue.value))
  ));
  const [environmentEntries, setEnvironmentEntries] = useState(() => parseEnvironmentValue(
    initialValue.type === "config" || parseStoredKeySet(initialValue.value) ? initialValue.value : "",
  ));
  const [visibleEntries, setVisibleEntries] = useState([]);
  const [visible, setVisible] = useState(false);
  const [validationError, setValidationError] = useState("");

  function update(event) {
    const { name, value } = event.target;
    setDraft((current) => ({ ...current, [name]: value }));
  }

  function updateEnvironmentEntry(index, field, value) {
    setEnvironmentEntries((current) => current.map((entry, entryIndex) => (
      entryIndex === index ? { ...entry, [field]: value } : entry
    )));
    setValidationError("");
  }

  function removeEnvironmentEntry(index) {
    setEnvironmentEntries((current) => current.length === 1
      ? [{ key: "", value: "" }]
      : current.filter((_, entryIndex) => entryIndex !== index));
    setVisibleEntries((current) => current.length === 1
      ? [false]
      : current.filter((_, entryIndex) => entryIndex !== index));
  }

  function toggleEnvironmentEntryVisibility(index) {
    setVisibleEntries((current) => {
      const next = [...current];
      next[index] = !next[index];
      return next;
    });
  }

  function submit(event) {
    event.preventDefault();
    const usesKeySet = draft.type === "config" || multipleValues;
    if (!usesKeySet) {
      onSubmit(draft);
      return;
    }

    const entries = environmentEntries
      .filter((entry) => entry.key.trim() || entry.value)
      .map((entry) => ({ key: entry.key.trim(), value: entry.value }));
    if (!entries.length || entries.some((entry) => !entry.key)) {
      setValidationError("Every environment variable needs a key.");
      return;
    }
    const keys = entries.map((entry) => entry.key);
    if (new Set(keys).size !== keys.length) {
      setValidationError("Environment variable keys must be unique.");
      return;
    }
    const value = JSON.stringify({
      format: draft.type === "config" ? "env-v1" : "keyset-v1",
      entries,
    });
    if (value.length > 12000) {
      setValidationError("Environment variables are too large for one Vault item.");
      return;
    }
    onSubmit({ ...draft, value });
  }

  const canSubmit = draft.name.trim() && (
    draft.type === "config" || multipleValues
      ? environmentEntries.some((entry) => entry.key.trim())
      : draft.value.trim()
  );
  const usesKeySet = draft.type === "config" || multipleValues;
  const allEnvironmentValuesVisible = environmentEntries.length > 0
    && environmentEntries.every((_, index) => visibleEntries[index]);
  const SelectedTypeIcon = typeDetails(draft.type).icon;

  return (
    <Modal title={title} onClose={onClose} size="account" className="vault-editor-modal">
      <form onSubmit={submit} autoComplete="off" className="vault-editor-form mt-5 space-y-5">
        {(error || validationError) && <p className="rounded-lg border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{validationError || error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="mb-2 block text-xs text-slate-400">Name</span>
            <span className="vault-editor-input relative block"><Tag className="vault-editor-field-icon pointer-events-none absolute left-4 top-1/2 hidden size-5 -translate-y-1/2 text-cyan-300" /><input name="name" value={draft.name} onChange={update} maxLength={200} required autoFocus autoComplete="off" data-1p-ignore data-lpignore="true" placeholder={draft.type === "config" ? "Production environment" : "Production API key"} className="form-control" /></span>
          </label>
          <SelectField label="Secret type" name="type" value={draft.type} onChange={update} options={secretTypes} leadingIcon={<SelectedTypeIcon className="vault-editor-type-icon hidden size-5 shrink-0 text-cyan-300" />} />
        </div>
        {usesKeySet ? (
          <div className="vault-keyset-panel">
            <div className="vault-keyset-header mb-2 flex items-center justify-between gap-3"><div><p className="text-xs text-slate-400">{draft.type === "config" ? "Environment variables" : "Keys and values"}</p><p className="mt-1 text-[0.68rem] text-slate-600">Keep related credentials for this app in one encrypted item.</p></div><div className="flex items-center gap-1">{draft.type !== "config" && <button type="button" onClick={() => { setMultipleValues(false); setDraft((current) => ({ ...current, value: environmentEntries[0]?.value || "" })); }} className="h-9 rounded-lg px-3 text-xs text-slate-500 hover:bg-white/5 hover:text-white">Use single value</button>}<button type="button" onClick={() => setVisibleEntries(environmentEntries.map(() => !allEnvironmentValuesVisible))} className="flex h-9 items-center gap-2 rounded-lg px-3 text-xs text-slate-400 hover:bg-white/5 hover:text-white">{allEnvironmentValuesVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}{allEnvironmentValuesVisible ? "Hide values" : "Show values"}</button></div></div>
            <div className="vault-keyset-fields overflow-hidden rounded-xl border border-white/10 bg-black/10">
              <div className="hidden grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_40px] gap-2 border-b border-white/[0.07] px-3 py-2 text-[0.65rem] font-medium uppercase tracking-[0.1em] text-slate-600 sm:grid"><span>Key</span><span>Value</span><span /></div>
              <div className="divide-y divide-white/[0.06]">
                {environmentEntries.map((entry, index) => (
                  <div key={index} className="vault-keyset-entry grid gap-2 p-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_40px] sm:items-center">
                    <label><span className="mb-1 block text-[0.65rem] uppercase tracking-wider text-slate-600 sm:hidden">Key</span><input value={entry.key} onChange={(event) => updateEnvironmentEntry(index, "key", event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))} maxLength={200} autoComplete="off" data-1p-ignore data-lpignore="true" spellCheck="false" placeholder="API_KEY" className="form-control font-mono text-xs" aria-label={`Environment variable ${index + 1} key`} /></label>
                    <div><span className="mb-1 block text-[0.65rem] uppercase tracking-wider text-slate-600 sm:hidden">Value</span><span className="relative block"><input type={visibleEntries[index] ? "text" : "password"} value={entry.value} onChange={(event) => updateEnvironmentEntry(index, "value", event.target.value)} maxLength={12000} autoComplete="new-password" data-1p-ignore data-lpignore="true" spellCheck="false" placeholder="Enter value" className="form-control pr-12 font-mono text-xs" aria-label={`Environment variable ${index + 1} value`} /><button type="button" onClick={() => toggleEnvironmentEntryVisibility(index)} className="absolute inset-y-0 right-1 grid w-10 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white" aria-label={visibleEntries[index] ? `Hide environment variable ${index + 1} value` : `Show environment variable ${index + 1} value`}>{visibleEntries[index] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></span></div>
                    <button type="button" onClick={() => removeEnvironmentEntry(index)} className="vault-keyset-remove grid size-9 place-items-center justify-self-end rounded-lg text-slate-600 hover:bg-red-500/10 hover:text-red-300" aria-label={`Remove environment variable ${index + 1}`}><Minus className="size-4" /></button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => { setEnvironmentEntries((current) => [...current, { key: "", value: "" }]); setVisibleEntries((current) => [...current, false]); }} className="flex h-11 w-full items-center justify-center gap-2 border-t border-white/[0.07] text-xs font-medium text-cyan-300 transition hover:bg-cyan-300/[0.04]"><Plus className="size-4" /> Add variable</button>
            </div>
          </div>
        ) : (
          <label className="block">
            <span className="mb-2 flex items-center justify-between gap-3"><span className="text-xs text-slate-400">Secret value</span><button type="button" onClick={() => { setEnvironmentEntries(draft.value ? [{ key: "PRIMARY_KEY", value: draft.value }] : [{ key: "", value: "" }]); setMultipleValues(true); }} className="flex items-center gap-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200"><Plus className="size-3.5" />Add multiple keys</button></span>
            <span className="relative block">
              <textarea name="value" value={draft.value} onChange={update} maxLength={12000} required rows={3} autoComplete="new-password" data-1p-ignore data-lpignore="true" spellCheck="false" placeholder="Paste the secret value" className={`form-control min-h-24 resize-y pr-12 font-mono text-xs leading-5 ${visible ? "" : "[-webkit-text-security:disc]"}`} />
              <button type="button" onClick={() => setVisible((current) => !current)} className="absolute right-2 top-2 grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white" aria-label={visible ? "Hide secret" : "Show secret"}>{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
            </span>
          </label>
        )}
        <label className="block">
          <span className="mb-2 block text-xs text-slate-400">Private notes <span className="text-slate-600">(optional)</span></span>
          <textarea name="notes" value={draft.notes} onChange={update} maxLength={2000} rows={3} placeholder="Environment, scope, rotation date, or usage details" className="form-control min-h-20 resize-y" />
        </label>
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={onClose} className="h-11 rounded-lg border border-white/10 px-5 text-sm text-slate-300 hover:bg-white/5">Cancel</button>
          <button disabled={busy || !canSubmit} className="flex h-11 items-center justify-center gap-2 rounded-lg bg-cyan-400 px-5 text-sm font-semibold text-[#031014] hover:bg-cyan-300 disabled:opacity-40">
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}{submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function VaultView() {
  const [secrets, setSecrets] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState(null);
  const [selected, setSelected] = useState(null);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch("/vault")
      .then((response) => readResult(response, "Unable to load Vault items."))
      .then((result) => active && setSecrets(result.data || []))
      .catch((requestError) => active && setError(requestError.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return secrets.filter((secret) => (
      (filter === "all" || secret.type === filter)
      && (!normalized || secret.name.toLowerCase().includes(normalized))
    ));
  }, [filter, query, secrets]);

  async function openSecret(secret) {
    setError("");
    setBusy(true);
    try {
      const response = await apiFetch(`/vault/${encodeURIComponent(secret.id)}`);
      const result = await readResult(response, "Unable to open this Vault item.");
      setSelected(result.data);
      setVisible(false);
      setCopied(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveSecret(draft) {
    setBusy(true);
    setError("");
    try {
      const editing = editor?.id;
      const response = await apiFetch(editing ? `/vault/${encodeURIComponent(editor.id)}` : "/vault", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = await readResult(response, editing ? "Unable to update Vault item." : "Unable to create Vault item.");
      setSecrets((current) => [result.data, ...current.filter((item) => item.id !== result.data.id)]);
      setEditor(null);
      if (selected?.id === result.data.id) setSelected(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function editSelected() {
    const item = selected?.value === undefined
      ? await apiFetch(`/vault/${encodeURIComponent(selected.id)}`).then((response) => readResult(response, "Unable to open this Vault item.")).then((result) => result.data)
      : selected;
    setEditor(item);
    setSelected(null);
  }

  async function editSecret(secret) {
    setError("");
    setBusy(true);
    try {
      const response = await apiFetch(`/vault/${encodeURIComponent(secret.id)}`);
      const result = await readResult(response, "Unable to open this Vault item.");
      setEditor(result.data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(presentedSecretValue(selected));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Unable to copy the secret to your clipboard.");
    }
  }

  async function removeSecret() {
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch(`/vault/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      if (!response.ok) await readResult(response, "Unable to delete Vault item.");
      setSecrets((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      setSelected(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const usedTypeCount = secretTypes.filter((type) => secrets.some((secret) => secret.type === type.value)).length;

  return (
    <section className="vault-secrets-view pb-8">
      {error && !editor && <p className="mb-5 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_290px]">
        <div className="min-w-0 space-y-5">
          <div className="vault-command-panel relative min-h-52 overflow-hidden rounded-2xl border border-cyan-300/15 px-5 py-7 shadow-2xl shadow-black/20 sm:px-8">
            <div className="relative z-10 max-w-xl">
              <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-cyan-300"><ShieldCheck className="size-4" /> Your secrets, locked and secure</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-white sm:text-3xl">One secure place for every key.</h2>
              <p className="mt-3 max-w-lg text-sm leading-6 text-slate-400">Store API keys, tokens, credentials, and configuration. Values stay encrypted at rest and hidden until you reveal them.</p>
              <button type="button" onClick={() => { setError(""); setEditor(emptyDraft); }} className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-6 text-sm font-semibold text-[#031014] shadow-lg shadow-cyan-950/40 transition hover:bg-cyan-300 sm:w-auto"><Plus className="size-4" /> Add secret</button>
            </div>
            <div className="vault-lock-visual pointer-events-none absolute right-4 top-1/2 hidden size-44 -translate-y-1/2 place-items-center lg:grid" aria-hidden="true">
              <span className="vault-lock-orbit" />
              <span className="vault-lock-orbit is-inner" />
              <span className="relative grid size-20 place-items-center rounded-3xl border border-cyan-200/40 bg-cyan-300/[0.09] text-cyan-200 shadow-[0_0_45px_rgba(34,211,238,0.16)]"><LockKeyhole className="size-9" /></span>
            </div>
          </div>

          <div className="vault-summary-grid grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Total secrets", value: secrets.length, text: "Encrypted records", icon: KeyRound, tone: "cyan" },
              { label: "Secret types", value: usedTypeCount, text: "Active categories", icon: SlidersHorizontal, tone: "amber" },
              { label: "AI-safe access", value: "Private", text: "Values never enter chat", icon: Sparkles, tone: "emerald" },
              { label: "Encryption", value: "AES-256", text: "Protected at rest", icon: ShieldCheck, tone: "sky" },
            ].map(({ label, value, text, icon: Icon, tone }) => (
              <div key={label} className="rounded-xl border border-white/[0.08] bg-[#071119] p-4 shadow-lg shadow-black/10">
                <div className="flex items-start justify-between gap-3"><div><p className="text-lg font-semibold text-white">{value}</p><p className="mt-0.5 text-xs font-medium text-slate-300">{label}</p></div><span className={`grid size-9 place-items-center rounded-lg border ${accents[tone]}`}><Icon className="size-4" /></span></div>
                <p className="mt-2 text-[0.68rem] text-slate-600">{text}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search secrets by name" className="h-11 w-full rounded-xl border border-white/10 bg-[#071119] pl-10 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/35" />
            </label>
            <div className="w-full sm:w-52"><SelectField ariaLabel="Filter Vault items" value={filter} onChange={(event) => setFilter(event.target.value)} leadingIcon={<SlidersHorizontal className="size-4 text-slate-500" />} options={[{ value: "all", label: "All secret types" }, ...secretTypes]} /></div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#071119] shadow-xl shadow-black/10">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-4 sm:px-5"><div><h3 className="font-semibold text-white">Secrets</h3><p className="mt-0.5 text-xs text-slate-500">Select an item to reveal or manage it</p></div><span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[0.68rem] text-slate-400">{filtered.length} items</span></div>
            <div className="hidden grid-cols-[minmax(0,1fr)_120px_100px_72px] gap-3 border-b border-white/[0.06] px-5 py-2.5 text-[0.65rem] font-medium uppercase tracking-[0.1em] text-slate-600 sm:grid"><span>Name</span><span>Type</span><span>Updated</span><span className="text-right">Action</span></div>
            {loading ? (
              <div className="grid min-h-64 place-items-center text-slate-500"><LoaderCircle className="size-7 animate-spin" /></div>
            ) : filtered.length ? (
              <div className="divide-y divide-white/[0.06]">
                {filtered.map((secret) => {
                  const details = typeDetails(secret.type);
                  const Icon = details.icon;
                  return (
                    <div key={secret.id} className="group flex items-center gap-3 px-4 py-3 transition hover:bg-cyan-300/[0.025] sm:grid sm:grid-cols-[minmax(0,1fr)_120px_100px_72px] sm:px-5">
                      <button type="button" onClick={() => openSecret(secret)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <span className={`grid size-10 shrink-0 place-items-center rounded-xl border ${accents[details.accent]}`}><Icon className="size-[18px]" /></span>
                        <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-100 group-hover:text-white">{secret.name}</span><span className="mt-0.5 flex items-center gap-2 text-[0.68rem] text-slate-600 sm:hidden">{details.label}<span>·</span>{formatDate(secret.updatedAt)}</span></span>
                      </button>
                      <span className="hidden items-center gap-1.5 text-xs text-slate-400 sm:flex">{details.label}</span>
                      <span className="hidden text-xs text-slate-500 sm:block">{formatDate(secret.updatedAt)}</span>
                      <div className="ml-auto flex items-center justify-end gap-1 sm:ml-0"><button type="button" onClick={() => editSecret(secret)} className="grid size-9 place-items-center rounded-lg border border-white/[0.08] text-slate-500 transition hover:border-cyan-300/20 hover:bg-cyan-300/[0.05] hover:text-cyan-200" aria-label={`Edit ${secret.name}`}><Pencil className="size-3.5" /></button><button type="button" onClick={() => openSecret(secret)} className="grid size-9 place-items-center rounded-lg text-slate-600 transition hover:bg-white/5 hover:text-white" aria-label={`Open ${secret.name}`}><Eye className="size-4" /></button></div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid min-h-64 place-items-center px-6 text-center"><div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-cyan-300/[0.07] text-cyan-300"><LockKeyhole className="size-6" /></span><h3 className="mt-4 font-semibold text-white">{secrets.length ? "No matching secrets" : "Your Vault is ready"}</h3><p className="mt-2 text-sm text-slate-500">{secrets.length ? "Try a different name or secret type." : "Add your first API key, token, or configuration."}</p></div></div>
            )}
          </div>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-28">
          <div className="rounded-2xl border border-white/[0.08] bg-[#071119] p-5">
            <div className="flex items-center justify-between"><h3 className="font-semibold text-white">Secret types</h3>{filter !== "all" && <button type="button" onClick={() => setFilter("all")} className="text-xs text-cyan-300 hover:text-cyan-200">View all</button>}</div>
            <div className="mt-4 space-y-1.5">
              {secretTypes.map((type) => {
                const count = secrets.filter((secret) => secret.type === type.value).length;
                const Icon = type.icon;
                return <button key={type.value} type="button" onClick={() => setFilter(type.value)} className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${filter === type.value ? "bg-cyan-300/[0.07]" : "hover:bg-white/[0.03]"}`}><span className={`grid size-8 shrink-0 place-items-center rounded-lg border ${accents[type.accent]}`}><Icon className="size-3.5" /></span><span className="min-w-0 flex-1 truncate text-xs text-slate-300">{type.label}</span><span className="grid min-w-7 place-items-center rounded-full bg-white/[0.05] px-2 py-1 text-[0.65rem] text-slate-400">{count}</span></button>;
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#071119] p-5">
            <h3 className="font-semibold text-white">Recently updated</h3>
            <div className="mt-4 space-y-4">
              {secrets.slice(0, 4).map((secret) => { const details = typeDetails(secret.type); const Icon = details.icon; return <button key={secret.id} type="button" onClick={() => openSecret(secret)} className="flex w-full items-center gap-3 text-left"><span className={`grid size-8 shrink-0 place-items-center rounded-lg border ${accents[details.accent]}`}><Icon className="size-3.5" /></span><span className="min-w-0"><span className="block truncate text-xs font-medium text-slate-200">{secret.name}</span><span className="mt-1 block text-[0.65rem] text-slate-600">{formatDate(secret.updatedAt)}</span></span></button>; })}
              {!secrets.length && <p className="text-xs leading-5 text-slate-600">Recent changes will appear here.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-cyan-300/10 bg-gradient-to-br from-cyan-300/[0.055] to-transparent p-5"><span className="grid size-10 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[0.08] text-cyan-300"><ShieldCheck className="size-5" /></span><h3 className="mt-4 font-semibold text-white">AI-safe by default</h3><p className="mt-2 text-xs leading-5 text-slate-400">The assistant can locate a secret and copy it locally after confirmation, but the raw value is never sent to the AI provider.</p></div>
        </aside>
      </div>

      {editor && <SecretEditor initialValue={editor} title={editor.id ? "Edit Vault item" : "Add to Vault"} submitLabel={editor.id ? "Save changes" : "Encrypt and save"} busy={busy} error={error} onClose={() => !busy && setEditor(null)} onSubmit={saveSecret} />}

      {selected && (
        <Modal title="Vault item" onClose={() => setSelected(null)} size="account">
          <div className="mt-5">
            <div className="flex items-center gap-3"><span className={`grid size-11 place-items-center rounded-xl border ${accents[typeDetails(selected.type).accent]}`}>{(() => { const Icon = typeDetails(selected.type).icon; return <Icon className="size-5" />; })()}</span><div className="min-w-0"><p className="truncate font-semibold text-white">{selected.name}</p><p className="mt-0.5 text-xs text-slate-500">{typeDetails(selected.type).label}</p></div></div>
            <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-400">Secret value</span><div className="flex gap-1"><button type="button" onClick={() => setVisible((current) => !current)} className="grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white" aria-label={visible ? "Hide secret" : "Reveal secret"}>{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button><button type="button" onClick={copySecret} className="grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Copy secret">{copied ? <Check className="size-4 text-emerald-300" /> : <Clipboard className="size-4" />}</button></div></div>
              <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-6 text-slate-200">{visible ? presentedSecretValue(selected) : "••••••••••••••••••••••••"}</pre>
            </div>
            {selected.notes && <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"><p className="text-xs font-medium text-slate-400">Private notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{selected.notes}</p></div>}
            <div className="mt-4 flex gap-3 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.04] p-4"><Bot className="mt-0.5 size-4 shrink-0 text-emerald-300" /><div><p className="text-sm font-medium text-white">Protected AI access</p><p className="mt-1 text-xs leading-5 text-slate-500">AI can find this item and request a confirmed local copy, but it cannot read the raw value.</p></div></div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><button type="button" onClick={() => { setDeleteTarget(selected); setSelected(null); }} className="flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm text-red-300 hover:bg-red-500/10"><Trash2 className="size-4" />Delete</button><div className="flex gap-3"><button type="button" onClick={() => setSelected(null)} className="h-10 flex-1 rounded-lg border border-white/10 px-4 text-sm text-slate-300 sm:flex-none">Close</button><button type="button" onClick={editSelected} className="h-10 flex-1 rounded-lg bg-cyan-400 px-4 text-sm font-semibold text-[#031014] sm:flex-none">Edit item</button></div></div>
          </div>
        </Modal>
      )}

      {deleteTarget && <Modal title="Delete Vault item?" onClose={() => !busy && setDeleteTarget(null)}><div className="mt-5 rounded-xl border border-red-400/15 bg-red-500/[0.05] p-4"><p className="font-medium text-white">{deleteTarget.name}</p><p className="mt-1 text-sm text-slate-400">The encrypted value will be permanently removed.</p></div><div className="mt-6 flex justify-end gap-3"><button type="button" disabled={busy} onClick={() => setDeleteTarget(null)} className="h-10 rounded-lg border border-white/10 px-4 text-sm text-slate-300">Cancel</button><button type="button" disabled={busy} onClick={removeSecret} className="flex h-10 items-center gap-2 rounded-lg bg-red-500 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}Delete</button></div></Modal>}
    </section>
  );
}

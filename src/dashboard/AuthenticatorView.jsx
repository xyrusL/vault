import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, ImageUp, LoaderCircle, Plus, RefreshCw, Search, ShieldCheck, Trash2, Upload } from "lucide-react";
import jsQR from "jsqr";
import * as OTPAuth from "otpauth";
import apiFetch from "../api";
import { Field, Modal } from "./DashboardUi";
import { detectServiceLogoUrl } from "./serviceLogos";

const emptyForm = { issuer: "", accountName: "", secret: "", uri: "" };

function parseSetupUri(value) {
  const uri = value.trim();
  if (!uri) return null;

  try {
    const authenticator = OTPAuth.URI.parse(uri);
    if (!(authenticator instanceof OTPAuth.TOTP)) throw new Error();
    return {
      issuer: authenticator.issuer || "Authenticator",
      accountName: authenticator.label || "",
      secret: authenticator.secret.base32,
      uri,
    };
  } catch {
    return null;
  }
}

async function readQrCode(file) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image containing a QR code.");

  const bitmap = await createImageBitmap(file);
  try {
    const maxSize = 1600;
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
    if (!result) throw new Error("No QR code was found in that image. Try a clearer screenshot.");
    const uri = result.data.trim();
    if (!/^otpauth:\/\//i.test(uri)) throw new Error("The QR code is not an authenticator setup code.");
    return uri;
  } finally {
    bitmap.close();
  }
}

function makeCode(entry) {
  try {
    return new OTPAuth.TOTP({
      issuer: entry.issuer,
      label: entry.accountName,
      algorithm: entry.algorithm,
      digits: entry.digits,
      period: entry.period,
      secret: entry.secret,
    }).generate();
  } catch {
    return "------";
  }
}

function makePreview(form, now) {
  try {
    let authenticator;
    if (form.uri.trim()) {
      authenticator = OTPAuth.URI.parse(form.uri.trim());
      if (!(authenticator instanceof OTPAuth.TOTP)) return null;
    } else {
      const secret = form.secret.replace(/[\s-]/g, "").toUpperCase();
      if (!secret || !/^[A-Z2-7]+=*$/.test(secret)) return null;
      authenticator = new OTPAuth.TOTP({
        issuer: form.issuer || "Authenticator",
        label: form.accountName || "Account",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret,
      });
    }

    const period = authenticator.period || 30;
    return {
      code: authenticator.generate({ timestamp: now }),
      period,
      seconds: period - (Math.floor(now / 1000) % period),
    };
  } catch {
    return null;
  }
}

function AuthenticatorLogo({ entry }) {
  const [failed, setFailed] = useState(false);
  const logoUrl = detectServiceLogoUrl(entry.issuer, entry.accountName);

  if (logoUrl && !failed) {
    return <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white p-2"><img src={logoUrl} alt="" loading="lazy" onError={() => setFailed(true)} className="size-full object-contain" /></span>;
  }

  return <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cyan-400/10 font-semibold text-cyan-300">{entry.issuer.slice(0, 1).toUpperCase()}</span>;
}

export default function AuthenticatorView() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteEntry, setDeleteEntry] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);
  const copyResetRef = useRef(null);

  useEffect(() => {
    let active = true;
    apiFetch("/authenticator")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load authenticator codes.");
        if (active) setEntries(result.data || []);
      })
      .catch((loadError) => active && setError(loadError.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(copyResetRef.current);
    };
  }, []);

  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return entries;
    return entries.filter((entry) => `${entry.issuer} ${entry.accountName}`.toLowerCase().includes(normalized));
  }, [entries, query]);
  const preview = useMemo(() => makePreview(form, now), [form, now]);

  function updateForm(event) {
    const { name, value } = event.target;
    setForm((current) => {
      if (name !== "uri") return { ...current, [name]: value };
      const parsed = parseSetupUri(value);
      return parsed ? { ...current, ...parsed, uri: value } : { ...current, uri: value };
    });
  }

  async function importQrImage(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const uri = await readQrCode(file);
      const parsed = parseSetupUri(uri);
      if (!parsed) throw new Error("The QR code contains an invalid authenticator setup URI.");
      setForm((current) => ({ ...current, ...parsed }));
    } catch (scanError) {
      setError(scanError.message);
    } finally {
      setBusy(false);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    importQrImage(event.dataTransfer.files[0]);
  }

  function handlePaste(event) {
    const imageItem = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith("image/"));
    if (imageItem) {
      event.preventDefault();
      importQrImage(imageItem.getAsFile());
      return;
    }

    const uri = event.clipboardData?.getData("text/plain").trim();
    const parsed = uri && parseSetupUri(uri);
    if (parsed) {
      event.preventDefault();
      setError("");
      setForm((current) => ({ ...current, ...parsed }));
    }
  }

  async function addEntry(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch("/authenticator", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form.uri.trim() ? { uri: form.uri.trim() } : form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to add authenticator account.");
      setEntries((current) => [...current, result.data].sort((a, b) => `${a.issuer}${a.accountName}`.localeCompare(`${b.issuer}${b.accountName}`)));
      setForm(emptyForm);
      setAddOpen(false);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry() {
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch(`/authenticator/${encodeURIComponent(deleteEntry.id)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to delete authenticator account.");
      setEntries((current) => current.filter((entry) => entry.id !== deleteEntry.id));
      setDeleteEntry(null);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyValue(value, id) {
    try {
      await navigator.clipboard.writeText(value);
      window.clearTimeout(copyResetRef.current);
      setCopied(id);
      copyResetRef.current = window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setError("Clipboard access is unavailable. Copy the code manually.");
    }
  }

  async function copyCode(entry) {
    await copyValue(makeCode(entry), entry.id);
  }

  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex h-11 w-full max-w-md items-center gap-3 rounded-lg border border-white/10 bg-[#071016] px-3 focus-within:border-cyan-300/50">
          <Search className="size-4 text-slate-500" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search accounts" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
        </label>
        <button type="button" onClick={() => { setError(""); setAddOpen(true); }} className="flex h-11 items-center justify-center gap-2 rounded-lg bg-cyan-500 px-5 text-sm font-semibold text-[#021012]">
          <Plus className="size-4" /> Add account
        </button>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-400/10 px-4 py-3 text-sm text-red-300" role="alert">{error}</p>}

      {loading ? (
        <div className="mt-6 flex min-h-60 items-center justify-center text-slate-400"><LoaderCircle className="mr-2 size-5 animate-spin" /> Loading codes</div>
      ) : filteredEntries.length ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredEntries.map((entry) => {
            const seconds = entry.period - (Math.floor(now / 1000) % entry.period);
            const code = makeCode(entry);
            return (
              <article key={entry.id} className="group rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.035] to-transparent p-5 shadow-lg shadow-black/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                     <AuthenticatorLogo entry={entry} />
                    <div className="min-w-0"><h2 className="truncate font-semibold text-white">{entry.issuer}</h2><p className="truncate text-xs text-slate-400">{entry.accountName}</p></div>
                  </div>
                  <button type="button" onClick={() => setDeleteEntry(entry)} className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 opacity-70 transition hover:bg-red-400/10 hover:text-red-300 group-hover:opacity-100" aria-label={`Delete ${entry.issuer}`}><Trash2 className="size-4" /></button>
                </div>
                <button type="button" onClick={() => copyCode(entry)} className="mt-6 flex w-full items-center justify-between rounded-xl border border-cyan-300/10 bg-black/20 px-4 py-4 text-left hover:border-cyan-300/30">
                  <span className="font-mono text-2xl font-semibold tracking-[0.18em] text-cyan-200">{code.replace(/(.{3})/, "$1 ")}</span>
                   <span key={copied === entry.id ? "copied" : "copy"} className="copy-feedback-icon">{copied === entry.id ? <Check className="size-4 text-emerald-300" /> : <Copy className="size-4 text-slate-400" />}</span>
                </button>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>{copied === entry.id ? "Code copied" : "Tap code to copy"}</span>
                  <span className="flex items-center gap-1.5"><RefreshCw className="size-3" /> {seconds}s</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-cyan-400 transition-[width] duration-1000" style={{ width: `${(seconds / entry.period) * 100}%` }} /></div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 grid min-h-72 place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-6 text-center">
          <div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300"><ShieldCheck className="size-7" /></span><h2 className="mt-4 text-lg font-semibold">No authenticator accounts</h2><p className="mt-2 max-w-md text-sm leading-6 text-slate-400">Add the setup key or otpauth URI supplied by Google, GitHub, Microsoft, or another service.</p></div>
        </div>
      )}

      {addOpen && (
        <Modal title="Add authenticator account" description="Add a new 2FA account using a QR image or manual setup details." size="authenticator" onClose={() => !busy && setAddOpen(false)}>
          <form onSubmit={addEntry} onPaste={handlePaste} className="mt-4 space-y-4">
            {error && <p className="rounded-lg border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">{error}</p>}
            <button
              type="button"
              className={`flex min-h-24 w-full flex-col items-center justify-center rounded-xl border border-dashed px-5 py-4 text-center transition ${dragging ? "border-cyan-300 bg-cyan-300/10" : "border-cyan-300/40 bg-gradient-to-br from-cyan-300/[0.045] to-transparent hover:border-cyan-300/70 hover:bg-cyan-300/[0.06]"}`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
              onDrop={handleDrop}
              disabled={busy}
            >
              {busy ? <LoaderCircle className="mb-1.5 size-5 animate-spin text-cyan-300" /> : <ImageUp className="mb-1.5 size-5 text-cyan-300" />}
              <span className="text-sm font-medium text-slate-200">Drop QR image or click to upload</span>
              <span className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><Upload className="size-3.5" />JPG, PNG, or screenshot</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => { importQrImage(event.target.files[0]); event.target.value = ""; }}
            />
            <Field label="Setup URI (optional)" name="uri" value={form.uri} onChange={updateForm} placeholder="otpauth://totp/..." autoComplete="off" />
            {form.uri.trim() && !parseSetupUri(form.uri) && <p className="-mt-2 text-xs text-amber-300">Paste a complete <code>otpauth://totp/...</code> URI to detect the account details.</p>}
            <div className="flex items-center gap-3 text-xs text-slate-500"><span className="h-px flex-1 bg-white/10" />or enter manually<span className="h-px flex-1 bg-white/10" /></div>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Service / issuer" name="issuer" value={form.issuer} onChange={updateForm} placeholder="Google" required={!form.uri.trim()} /><Field label="Account name" name="accountName" value={form.accountName} onChange={updateForm} placeholder="name@example.com" required={!form.uri.trim()} /></div>
            <Field label="Base32 setup key" name="secret" value={form.secret} onChange={updateForm} placeholder="JBSWY3DPEHPK3PXP" autoComplete="off" required={!form.uri.trim()} />
            {!form.uri.trim() && form.secret.trim() && !preview && <p className="-mt-2 text-xs text-amber-300">Enter a valid Base32 setup key to generate the verification code.</p>}
            {preview && (
              <div className="rounded-xl border border-cyan-300/20 bg-gradient-to-r from-cyan-400/[0.07] to-cyan-400/[0.025] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Live verification code</p>
                    <p className="mt-1.5 font-mono text-3xl font-semibold tracking-[0.22em] text-cyan-200">{preview.code.replace(/(.{3})/, "$1 ")}</p>
                  </div>
                  <button type="button" onClick={() => copyValue(preview.code, "preview")} className={`grid size-12 shrink-0 place-items-center rounded-xl border transition ${copied === "preview" ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-300" : "border-white/10 text-slate-400 hover:border-cyan-300/30 hover:bg-cyan-300/[0.05] hover:text-cyan-200"}`} aria-label={copied === "preview" ? "Verification code copied" : "Copy verification code"}><span key={copied === "preview" ? "copied" : "copy"} className="copy-feedback-icon">{copied === "preview" ? <Check className="size-5" /> : <Copy className="size-5" />}</span></button>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>{copied === "preview" ? "Code copied" : "Generated from the setup details above"}</span><span className="flex items-center gap-1.5"><RefreshCw className="size-3" /> {preview.seconds}s</span></div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-cyan-400 transition-[width] duration-1000" style={{ width: `${(preview.seconds / preview.period) * 100}%` }} /></div>
              </div>
            )}
            <div className="flex justify-end gap-3 border-t border-white/[0.08] pt-4"><button type="button" onClick={() => setAddOpen(false)} disabled={busy} className="h-10 rounded-lg border border-white/10 px-4 text-sm text-slate-300 hover:bg-white/5">Cancel</button><button disabled={busy} className="flex h-10 items-center gap-2 rounded-lg bg-cyan-400 px-4 text-sm font-semibold text-[#021012] hover:bg-cyan-300 disabled:opacity-50">{busy && <LoaderCircle className="size-4 animate-spin" />} Save account</button></div>
          </form>
        </Modal>
      )}

      {deleteEntry && (
        <Modal title="Delete authenticator account" onClose={() => !busy && setDeleteEntry(null)}>
          <p className="mt-4 text-sm leading-6 text-slate-400">Delete the saved code generator for <strong className="text-white">{deleteEntry.issuer}</strong>? This does not disable 2FA on that external service.</p>
          <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setDeleteEntry(null)} disabled={busy} className="h-10 rounded-lg border border-white/10 px-4 text-sm text-slate-300">Cancel</button><button type="button" onClick={removeEntry} disabled={busy} className="flex h-10 items-center gap-2 rounded-lg bg-red-500 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy && <LoaderCircle className="size-4 animate-spin" />} Delete</button></div>
        </Modal>
      )}
    </section>
  );
}

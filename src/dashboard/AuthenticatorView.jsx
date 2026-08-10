import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Copy, ImageUp, LoaderCircle, Plus, RefreshCw, Search, ShieldCheck, Sparkles, Trash2, Upload } from "lucide-react";
import jsQR from "jsqr";
import * as OTPAuth from "otpauth";
import apiFetch from "../api";
import { Modal } from "./DashboardUi";
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

function getQrScanError(value) {
  const content = value.trim();
  if (!/^otpauth:\/\//i.test(content)) {
    return "QR code detected, but it is not a 2FA authenticator code. Try the QR code shown in the account's authenticator setup.";
  }
  if (/^otpauth:\/\/hotp\//i.test(content)) {
    return "This is an HOTP code, which is not supported. Use a time-based TOTP authenticator QR code instead.";
  }
  if (!/^otpauth:\/\/totp\//i.test(content)) {
    return "This authenticator QR format is not supported. Use a TOTP setup code.";
  }
  return "A 2FA QR code was detected, but its setup details are incomplete or invalid. Generate a new code and try again.";
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
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const fileInputRef = useRef(null);
  const issuerInputRef = useRef(null);
  const videoRef = useRef(null);
  const cameraGuideRef = useRef(null);
  const detectedGuideRef = useRef(null);
  const cameraCanvasRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const cameraFrameRef = useRef(null);
  const cameraCaptureRef = useRef(null);
  const cameraErrorResetRef = useRef(null);
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
      window.clearTimeout(cameraCaptureRef.current);
      window.clearTimeout(cameraErrorResetRef.current);
      window.cancelAnimationFrame(cameraFrameRef.current);
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return entries;
    return entries.filter((entry) => `${entry.issuer} ${entry.accountName}`.toLowerCase().includes(normalized));
  }, [entries, query]);
  const preview = useMemo(() => makePreview(form, now), [form, now]);
  const autoFilled = Boolean(parseSetupUri(form.uri));

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

  function stopCamera() {
    window.clearTimeout(cameraCaptureRef.current);
    window.clearTimeout(cameraErrorResetRef.current);
    cameraCaptureRef.current = null;
    cameraErrorResetRef.current = null;
    window.cancelAnimationFrame(cameraFrameRef.current);
    cameraFrameRef.current = null;
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraError("");
    setCameraOpen(false);
  }

  function showCameraScanError(message) {
    setCameraError(message);
    window.clearTimeout(cameraErrorResetRef.current);
    cameraErrorResetRef.current = window.setTimeout(() => {
      cameraErrorResetRef.current = null;
      setCameraError("");
    }, 1800);
  }

  function updateCameraGuide(result, video, canvas) {
    const fixedGuide = cameraGuideRef.current;
    const detectedGuide = detectedGuideRef.current;
    if (!fixedGuide || !detectedGuide) return;

    if (!result?.location) {
      fixedGuide.style.opacity = "1";
      detectedGuide.style.opacity = "0";
      return;
    }

    const preview = video.parentElement;
    const scale = Math.min(preview.clientWidth / canvas.width, preview.clientHeight / canvas.height);
    const offsetX = (preview.clientWidth - canvas.width * scale) / 2;
    const offsetY = (preview.clientHeight - canvas.height * scale) / 2;
    const corners = [
      result.location.topLeftCorner,
      result.location.topRightCorner,
      result.location.bottomRightCorner,
      result.location.bottomLeftCorner,
    ];

    detectedGuide.setAttribute("points", corners.map(({ x, y }) => `${offsetX + x * scale},${offsetY + y * scale}`).join(" "));
    fixedGuide.style.opacity = "0";
    detectedGuide.style.opacity = "1";
  }

  function scanCameraFrame() {
    const video = videoRef.current;
    if (!video || !cameraStreamRef.current) return;

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight) {
      const canvas = cameraCanvasRef.current || document.createElement("canvas");
      cameraCanvasRef.current = canvas;
      const maxWidth = 960;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
      updateCameraGuide(result, video, canvas);

      if (result) {
        const parsed = parseSetupUri(result.data);
        if (parsed) {
          cameraFrameRef.current = null;
          cameraCaptureRef.current = window.setTimeout(() => {
            cameraCaptureRef.current = null;
            setForm((current) => ({ ...current, ...parsed }));
            setError("");
            setCameraError("");
            stopCamera();
          }, 350);
          return;
        }
        showCameraScanError(getQrScanError(result.data));
      }
    }

    cameraFrameRef.current = window.requestAnimationFrame(scanCameraFrame);
  }

  async function startCamera() {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not supported by this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setCameraOpen(true);
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      if (!videoRef.current) throw new Error("Camera preview is unavailable.");
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      cameraFrameRef.current = window.requestAnimationFrame(scanCameraFrame);
    } catch (cameraAccessError) {
      stopCamera();
      setCameraError(getCameraErrorMessage(cameraAccessError));
    }
  }

  function closeAddModal() {
    stopCamera();
    setCameraError("");
    setAddOpen(false);
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
      stopCamera();
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
    <section className="authenticator-page">
      <div className="authenticator-toolbar flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
              <article key={entry.id} className="authenticator-card group rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.035] to-transparent p-5 shadow-lg shadow-black/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                     <AuthenticatorLogo entry={entry} />
                    <div className="min-w-0"><h2 className="truncate font-semibold text-white">{entry.issuer}</h2><p className="truncate text-xs text-slate-400">{entry.accountName}</p></div>
                  </div>
                  <button type="button" onClick={() => setDeleteEntry(entry)} className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 opacity-70 transition hover:bg-red-400/10 hover:text-red-300 group-hover:opacity-100" aria-label={`Delete ${entry.issuer}`}><Trash2 className="size-4" /></button>
                </div>
                <button type="button" onClick={() => copyCode(entry)} className="authenticator-code mt-6 flex w-full items-center justify-between rounded-xl border border-cyan-300/10 bg-black/20 px-4 py-4 text-left hover:border-cyan-300/30">
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
        <Modal
          title={cameraOpen ? "Scan authenticator QR code" : "Add authenticator account"}
          description={cameraOpen ? "Position the complete QR code inside the guide." : "Add a new 2FA account using a QR image or manual setup details."}
          size={cameraOpen ? "authenticator-camera" : "authenticator"}
          onClose={() => !busy && (cameraOpen ? stopCamera() : closeAddModal())}
        >
          {cameraOpen ? (
            <section className="mt-4">
              <div className="relative flex h-[min(68dvh,640px)] min-h-[280px] items-center justify-center overflow-hidden rounded-xl border border-cyan-300/35 bg-black">
                <video ref={videoRef} playsInline muted className="size-full object-contain" aria-label="Camera preview" />
                <div ref={cameraGuideRef} className="pointer-events-none absolute left-1/2 top-1/2 aspect-square h-[min(62%,24rem)] max-w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-cyan-300/80 shadow-[0_0_0_999px_rgba(0,0,0,0.24),0_0_28px_rgba(34,211,238,0.2)] transition-opacity duration-150">
                  <span className="absolute -left-0.5 -top-0.5 size-8 rounded-tl-2xl border-l-4 border-t-4 border-cyan-200" />
                  <span className="absolute -right-0.5 -top-0.5 size-8 rounded-tr-2xl border-r-4 border-t-4 border-cyan-200" />
                  <span className="absolute -bottom-0.5 -left-0.5 size-8 rounded-bl-2xl border-b-4 border-l-4 border-cyan-200" />
                  <span className="absolute -bottom-0.5 -right-0.5 size-8 rounded-br-2xl border-b-4 border-r-4 border-cyan-200" />
                </div>
                <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
                  <polygon ref={detectedGuideRef} points="" className="fill-cyan-300/10 stroke-cyan-200 opacity-0 drop-shadow-[0_0_10px_rgba(103,232,249,0.9)] transition-opacity duration-150 [stroke-width:4]" />
                </svg>
                <span className="absolute left-3 top-3 flex items-center gap-2 rounded-full border border-cyan-200/20 bg-black/65 px-3 py-1.5 text-xs font-medium text-cyan-200 backdrop-blur-sm">
                  <span className="size-1.5 animate-pulse rounded-full bg-cyan-300" /> Camera active
                </span>
                <div className="absolute inset-x-3 bottom-3 flex justify-center">
                  <button type="button" onClick={stopCamera} className="pointer-events-auto h-11 rounded-lg border border-white/20 bg-black/75 px-5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-black/90">
                    Back to account details
                  </button>
                </div>
              </div>
              {cameraError && <p className="mt-3 rounded-md border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-xs text-amber-200" role="alert">{cameraError}</p>}
              <p className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-400"><Sparkles className="size-3.5 shrink-0 text-cyan-400" /> Scanning automatically. Account details will appear after a valid QR code is detected.</p>
            </section>
          ) : (
          <form onSubmit={addEntry} onPaste={handlePaste} className="mt-3 space-y-2.5">
            {error && <p className="rounded-lg border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">{error}</p>}
            <section className="rounded-xl border border-cyan-100/15 bg-black/[0.08] p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-200">Add account using</h3>
              </div>
              <div className="mt-2.5 grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_38px_160px]">
                <button
                  type="button"
                  className={`flex min-h-20 w-full flex-col items-center justify-center rounded-lg border border-dashed px-3 py-2 text-center transition ${dragging ? "border-cyan-300 bg-cyan-300/10" : "border-cyan-300/45 bg-[radial-gradient(circle_at_50%_45%,rgba(34,211,238,0.06),transparent_58%)] hover:border-cyan-300/75 hover:bg-cyan-300/[0.04]"}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
                  onDrop={handleDrop}
                  disabled={busy}
                >
                  {busy ? <LoaderCircle className="mb-1 size-5 animate-spin text-cyan-300" /> : <ImageUp className="mb-1 size-5 text-cyan-300" />}
                  <span className="text-sm font-semibold text-slate-100">Upload QR image</span>
                  <span className="mt-1 text-xs text-slate-400">Drop an image or click to upload</span>
                  <span className="mt-1.5 flex items-center gap-1.5 text-[0.68rem] text-slate-500"><Upload className="size-3" /> JPG, PNG, or screenshot</span>
                </button>
                <div className="flex items-center gap-3 sm:h-24 sm:flex-col">
                  <span className="h-px flex-1 bg-white/10 sm:h-auto sm:w-px" />
                  <span className="grid size-10 shrink-0 place-items-center rounded-full border border-white/10 bg-[#08131b] text-xs font-medium text-slate-300">OR</span>
                  <span className="h-px flex-1 bg-white/10 sm:h-auto sm:w-px" />
                </div>
                <button type="button" onClick={startCamera} disabled={busy} className="flex min-h-12 items-center justify-center gap-2.5 rounded-lg border border-cyan-300/35 bg-cyan-300/[0.025] px-4 text-sm font-semibold text-slate-100 transition hover:border-cyan-300/65 hover:bg-cyan-300/[0.06] disabled:opacity-50">
                  <Camera className="size-6 text-cyan-300" /> Use camera
                </button>
              </div>
              {cameraError && <p className="mt-2 rounded-md border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-xs text-amber-200" role="alert">{cameraError}</p>}
              <p className="mt-2 flex items-center gap-2 text-xs text-slate-400"><Sparkles className="size-3.5 shrink-0 text-cyan-400" /> Auto-detects the QR code and fills the fields below automatically.</p>
            </section>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => { importQrImage(event.target.files[0]); event.target.value = ""; }}
            />
            <section className="rounded-xl border border-cyan-100/15 bg-black/[0.08] p-3">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-200">Account details</h3>
                {autoFilled && <span className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-[0.65rem] font-medium text-cyan-300">Auto-filled after scan</span>}
              </div>
              <label className="block min-w-0">
                <span className="mb-1.5 flex items-center justify-between gap-3 text-xs text-slate-400">
                  <span>Setup URI (otpauth://)</span>
                  <button type="button" onClick={() => issuerInputRef.current?.focus()} className="text-cyan-300 hover:text-cyan-200">or enter manually</button>
                </span>
                <input name="uri" value={form.uri} onChange={updateForm} placeholder="otpauth://totp/..." autoComplete="off" className="form-control !min-h-10 bg-[#06121a] !px-3 !py-2" />
              </label>
              {form.uri.trim() && !parseSetupUri(form.uri) && <p className="mt-2 text-xs text-amber-300">Paste a complete <code>otpauth://totp/...</code> URI to detect the account details.</p>}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <AuthField inputRef={issuerInputRef} label="Service / issuer" name="issuer" value={form.issuer} onChange={updateForm} placeholder="Google" required={!form.uri.trim()} autoFilled={autoFilled} />
                <AuthField label="Account name" name="accountName" value={form.accountName} onChange={updateForm} placeholder="name@example.com" required={!form.uri.trim()} autoFilled={autoFilled} />
              </div>
              <div className="mt-3">
                <AuthField label="Base32 setup key" name="secret" value={form.secret} onChange={updateForm} placeholder="JBSWY3DPEHPK3PXP" autoComplete="off" required={!form.uri.trim()} autoFilled={autoFilled} />
              </div>
              {!form.uri.trim() && form.secret.trim() && !preview && <p className="mt-2 text-xs text-amber-300">Enter a valid Base32 setup key to generate the verification code.</p>}
            </section>
            <div className="flex justify-end gap-3"><button type="button" onClick={closeAddModal} disabled={busy} className="h-10 rounded-lg border border-white/10 px-5 text-sm text-slate-300 transition hover:bg-white/5">Cancel</button><button disabled={busy} className="flex h-10 items-center gap-2 rounded-lg border border-cyan-200/40 bg-gradient-to-r from-cyan-500 to-cyan-400 px-5 text-sm font-semibold text-[#021012] shadow-[0_8px_24px_rgba(6,182,212,0.18)] transition hover:brightness-110 disabled:opacity-50">{busy && <LoaderCircle className="size-4 animate-spin" />} Save account</button></div>
          </form>
          )}
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

function AuthField({ label, autoFilled = false, inputRef, ...inputProps }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs text-slate-400">{label}</span>
      <span className="form-control flex !min-h-10 items-center bg-[#06121a] !px-3 !py-2">
        <input ref={inputRef} {...inputProps} className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500" />
        {autoFilled && <span className="ml-2 shrink-0 rounded bg-cyan-400/[0.08] px-2 py-1 text-[0.62rem] text-cyan-300">Auto-filled</span>}
      </span>
    </label>
  );
}

function getCameraErrorMessage(error) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return "Camera permission was denied. Allow camera access in your browser settings and try again.";
  }
  if (error?.name === "NotFoundError" || error?.name === "OverconstrainedError") {
    return "No available camera was found on this device.";
  }
  if (error?.name === "NotReadableError") {
    return "The camera is already in use by another application.";
  }
  return error?.message || "Unable to start the camera. Check browser permissions and try again.";
}

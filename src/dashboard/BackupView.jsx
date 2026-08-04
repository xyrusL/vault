import { useState } from "react";
import {
  CloudUpload,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { apiFetch } from "../api";

const backupIterations = 250000;
const sampleBackup = {
  format: "vault-backup",
  version: 2,
  exportedAt: "2026-01-01T00:00:00.000Z",
  accounts: [{
    label: "Personal",
    platform: "Example",
    username: "myaccount",
    email: "name@example.com",
    password: "minimum-8-characters",
    accountType: "custom",
    category: "Personal",
    plan: "Standard",
    status: "Active",
    loginUrl: "https://example.com/login",
    notes: "Optional private notes",
  }],
  vaultSecrets: [{
    name: "Production environment",
    type: "config",
    value: "{\"format\":\"env-v1\",\"entries\":[{\"key\":\"API_URL\",\"value\":\"https://api.example.com\"}]}",
    notes: "Optional environment notes",
  }],
  notes: [{ title: "Example note", content: "Private note content" }],
  authenticators: [{
    issuer: "Example",
    accountName: "name@example.com",
    secret: "JBSWY3DPEHPK3PXP",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  }],
};

export default function BackupView({ accounts }) {
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState("");

  async function download(format) {
    setBusy(format);
    setMessage(null);
    try {
      if (format === "json" && passphrase.length < 8) {
        throw new Error("Enter a backup passphrase with at least 8 characters.");
      }
      const response = await apiFetch(`/backup/export?format=${format}`);
      if (!response.ok) throw new Error(await readError(response, "Export failed."));

      if (format === "json") {
        const backup = await response.json();
        const encrypted = await encryptBackup(backup, passphrase);
        downloadBlob(
          new Blob([JSON.stringify(encrypted, null, 2)], { type: "application/json" }),
          `vault-backup-${new Date().toISOString().slice(0, 10)}.vault.json`,
        );
        setMessage({ tone: "success", text: "Full encrypted backup downloaded." });
      } else {
        downloadBlob(await response.blob(), `vault-accounts.${format}`);
        setMessage({ tone: "success", text: "Account report downloaded." });
      }
    } catch (error) {
      setMessage({ tone: "error", text: error.message || "Export failed." });
    } finally {
      setBusy("");
    }
  }

  function exportWordDocument() {
    const rows = accounts
      .map((account) => `<tr><td>${escapeHtml(account.platform)}</td><td>${escapeHtml(account.label)}</td><td>${escapeHtml(account.username)}</td><td>${escapeHtml(account.email)}</td><td>${escapeHtml(account.category)}</td><td>${escapeHtml(account.status)}</td><td>${escapeHtml(account.login_url)}</td></tr>`)
      .join("");
    const document = `<html><body><h1>Vault Accounts</h1><table border="1"><tr><th>Platform</th><th>Label</th><th>Username</th><th>Email</th><th>Category</th><th>Status</th><th>Login URL</th></tr>${rows}</table></body></html>`;
    downloadBlob(new Blob([document], { type: "application/msword" }), "vault-accounts.doc");
    setMessage({ tone: "success", text: "Readable account report downloaded." });
  }

  function downloadSample() {
    downloadBlob(
      new Blob([JSON.stringify(sampleBackup, null, 2)], { type: "application/json" }),
      "vault-import-template.json",
    );
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy("import");
    setMessage(null);
    try {
      let backup = JSON.parse(await file.text());
      if (backup?.format === "vault-encrypted-backup") {
        if (!passphrase) throw new Error("Enter the passphrase used to encrypt this backup.");
        backup = await decryptBackup(backup, passphrase);
      }

      const summary = await importBackup(backup);
      const details = Object.entries(summary)
        .filter(([, count]) => count > 0)
        .map(([name, count]) => `${count} ${name}`)
        .join(", ");
      setMessage({
        tone: summary.failed ? "warning" : "success",
        text: `${details || "No records"} imported${summary.failed ? `; ${summary.failed} skipped` : ""}.`,
      });
    } catch (error) {
      const text = error.name === "OperationError"
        ? "Unable to decrypt backup. Check the passphrase and file."
        : error.message || "Invalid backup file.";
      setMessage({ tone: "error", text });
    } finally {
      event.target.value = "";
      setBusy("");
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-cyan-300/12 bg-gradient-to-br from-cyan-300/[0.05] to-transparent p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex max-w-2xl gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[0.08] text-cyan-300"><ShieldCheck className="size-5" /></span>
            <div><h2 className="font-semibold text-white">Protect your full backup</h2><p className="mt-1.5 text-sm leading-6 text-slate-400">JSON backups include accounts, passwords, Vault secrets, environment variables, notes, and authenticator entries. They are encrypted in this browser before download.</p></div>
          </div>
          <label className="block w-full lg:max-w-sm"><span className="mb-2 block text-xs text-slate-400">Backup passphrase</span><span className="relative block"><input type={showPassphrase ? "text" : "password"} value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="new-password" data-1p-ignore data-lpignore="true" placeholder="At least 8 characters" className="form-control pr-11" /><button type="button" onClick={() => setShowPassphrase((current) => !current)} className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-white" aria-label={showPassphrase ? "Hide passphrase" : "Show passphrase"}>{showPassphrase ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></span><span className="mt-1.5 block text-[0.68rem] text-slate-600">The passphrase never leaves this device and cannot be recovered.</span></label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <BackupCard icon={FileJson} title="Encrypted JSON" text="Complete restorable backup of protected data." busy={busy === "json"} onClick={() => download("json")} />
        <BackupCard icon={FileSpreadsheet} title="Excel / CSV" text="Non-secret account report for spreadsheets." busy={busy === "csv"} onClick={() => download("csv")} />
        <BackupCard icon={FileText} title="Word document" text="Readable non-secret account summary." onClick={exportWordDocument} />
      </div>

      <div className="panel">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl"><h2 className="text-lg font-semibold">Restore backup</h2><p className="mt-2 text-sm leading-6 text-slate-400">Import encrypted version 2 backups or older account-only JSON files. Restore adds records without deleting existing data. Duplicate accounts are skipped safely.</p></div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <label className={`flex h-10 items-center gap-2 rounded-lg bg-cyan-500 px-4 text-sm font-semibold text-[#021012] ${busy ? "pointer-events-none opacity-50" : "cursor-pointer"}`}><CloudUpload className="size-4" />{busy === "import" ? "Restoring..." : "Choose backup"}<input type="file" accept="application/json,.json" onChange={importFile} disabled={Boolean(busy)} className="sr-only" /></label>
            <button type="button" onClick={downloadSample} disabled={Boolean(busy)} className="flex h-10 items-center gap-2 rounded-lg border border-white/10 px-4 text-sm disabled:opacity-50"><Download className="size-4" />Import template</button>
          </div>
        </div>
        {message && <p role="status" className={`mt-4 rounded-lg border px-4 py-3 text-sm ${message.tone === "error" ? "border-red-400/20 bg-red-500/[0.07] text-red-200" : message.tone === "warning" ? "border-amber-300/20 bg-amber-300/[0.06] text-amber-200" : "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-200"}`}>{message.text}</p>}
      </div>
    </section>
  );
}

function BackupCard({ icon: Icon, title, text, onClick, busy = false }) {
  return (
    <button type="button" disabled={busy} onClick={onClick} className="panel text-left transition hover:border-cyan-300/30 disabled:opacity-60">
      {busy ? <LoaderCircle className="size-6 animate-spin text-cyan-300" /> : <Icon className="size-6 text-cyan-300" />}
      <h2 className="mt-5 font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">{text}</p>
    </button>
  );
}

async function importBackup(backup) {
  const legacyAccounts = Array.isArray(backup) ? backup : backup?.accounts || backup?.data;
  const versionTwo = backup?.format === "vault-backup" && Number(backup.version) >= 2;
  if (!versionTwo && !Array.isArray(legacyAccounts)) throw new Error("Invalid backup file. Use an encrypted Vault backup or the JSON template.");

  const sections = versionTwo
    ? [
      ["accounts", backup.accounts || [], "/accounts", normalizeImportedAccount],
      ["secrets", backup.vaultSecrets || [], "/vault", normalizeImportedSecret],
      ["notes", backup.notes || [], "/notes", normalizeImportedNote],
      ["authenticators", backup.authenticators || [], "/authenticator", normalizeImportedAuthenticator],
    ]
    : [["accounts", legacyAccounts, "/accounts", normalizeImportedAccount]];
  const summary = { accounts: 0, secrets: 0, notes: 0, authenticators: 0, failed: 0 };

  for (const [name, records, path, normalize] of sections) {
    if (!Array.isArray(records)) throw new Error(`Backup ${name} section is invalid.`);
    for (const record of records.slice(0, 500)) {
      const response = await apiFetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(normalize(record)),
      });
      if (response.ok) summary[name] += 1;
      else summary.failed += 1;
    }
    if (records.length > 500) summary.failed += records.length - 500;
  }
  return summary;
}

async function encryptBackup(backup, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(passphrase, salt, ["encrypt"]);
  const plaintext = new TextEncoder().encode(JSON.stringify(backup));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return {
    format: "vault-encrypted-backup",
    version: 2,
    encryption: {
      algorithm: "AES-GCM",
      kdf: "PBKDF2-SHA-256",
      iterations: backupIterations,
      salt: toBase64(salt),
      iv: toBase64(iv),
    },
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptBackup(envelope, passphrase) {
  const encryption = envelope?.encryption;
  if (envelope.version !== 2 || encryption?.algorithm !== "AES-GCM" || encryption?.kdf !== "PBKDF2-SHA-256" || encryption?.iterations !== backupIterations) {
    throw new Error("This encrypted backup format is not supported.");
  }
  const salt = fromBase64(encryption.salt);
  const iv = fromBase64(encryption.iv);
  const ciphertext = fromBase64(envelope.ciphertext);
  if (salt.length !== 16 || iv.length !== 12 || !ciphertext.length) throw new Error("Encrypted backup is damaged.");
  const key = await deriveBackupKey(passphrase, salt, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

async function deriveBackupKey(passphrase, salt, usages) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: backupIterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value) {
  if (typeof value !== "string" || value.length > 20 * 1024 * 1024) throw new Error("Encrypted backup is invalid.");
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function readError(response, fallback) {
  const result = await response.json().catch(() => ({}));
  return result.error || fallback;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function normalizeImportedAccount(account) {
  return {
    platform: account.platform || "Custom",
    accountType: account.accountType || account.account_type || "custom",
    label: account.label || account.platform || "Account",
    category: account.category || "Custom",
    username: account.username || "",
    email: account.email || "",
    password: account.password || "",
    loginUrl: account.loginUrl || account.login_url || "",
    plan: account.plan || "Standard",
    status: account.status || "Active",
    expiresAt: account.expiresAt || account.expires_at || null,
    notes: account.notes || "",
    metadata: typeof account.metadata === "string" ? safeParseMetadata(account.metadata) : account.metadata || {},
  };
}

function normalizeImportedSecret(secret) {
  return { name: secret.name, type: secret.type || "other", value: secret.value, notes: secret.notes || "" };
}

function normalizeImportedNote(note) {
  return { title: note.title || "Untitled note", content: note.content || "" };
}

function normalizeImportedAuthenticator(entry) {
  return {
    issuer: entry.issuer,
    accountName: entry.accountName || entry.account_name,
    secret: entry.secret,
    algorithm: entry.algorithm || "SHA1",
    digits: entry.digits || 6,
    period: entry.period || 30,
  };
}

function safeParseMetadata(value) {
  try { return JSON.parse(value); } catch { return {}; }
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

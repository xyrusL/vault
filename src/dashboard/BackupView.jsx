import { useState } from "react";
import {
  CloudUpload,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { apiFetch } from "../api";
import { PageTitle } from "./DashboardUi";

const sampleBackup = {
  version: 1,
  exportedAt: "2026-01-01T00:00:00.000Z",
  accounts: [
    {
      label: "Personal",
      platform: "Instagram",
      username: "myaccount",
      email: "name@example.com",
      password: "minimum-8-characters",
      accountType: "social",
      category: "Social",
      plan: "Standard",
      status: "Active",
      loginUrl: "https://instagram.com/accounts/login",
      expiresAt: "2027-01-01",
      notes: "Optional private notes",
    },
  ],
};

export default function BackupView({ accounts }) {
  const [message, setMessage] = useState("");

  async function download(format) {
    try {
      const response = await apiFetch(`/backup/export?format=${format}`);
      if (!response.ok) throw new Error();

      downloadBlob(await response.blob(), `vault-backup.${format}`);
      setMessage("Backup downloaded securely.");
    } catch {
      setMessage("Export failed.");
    }
  }

  function exportWordDocument() {
    const rows = accounts
      .map(
        (account) =>
          `<tr><td>${escapeHtml(account.platform)}</td><td>${escapeHtml(account.label)}</td><td>${escapeHtml(account.username)}</td><td>${escapeHtml(account.email)}</td><td>${escapeHtml(account.category)}</td><td>${escapeHtml(account.status)}</td><td>${escapeHtml(account.login_url)}</td></tr>`,
      )
      .join("");
    const document = `<html><body><h1>Vault Accounts</h1><table border="1"><tr><th>Platform</th><th>Label</th><th>Username</th><th>Email</th><th>Category</th><th>Status</th><th>Login URL</th></tr>${rows}</table></body></html>`;

    downloadBlob(
      new Blob([document], { type: "application/msword" }),
      "vault-accounts.doc",
    );
  }

  function downloadSample() {
    const content = JSON.stringify(sampleBackup, null, 2);
    downloadBlob(
      new Blob([content], { type: "application/json" }),
      "vault-import-sample.json",
    );
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      const items = Array.isArray(parsed)
        ? parsed
        : parsed.accounts || parsed.data;
      if (!Array.isArray(items) || !items.length) throw new Error();

      let imported = 0;
      let failed = 0;
      for (const account of items.slice(0, 100)) {
        const response = await apiFetch("/accounts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(normalizeImportedAccount(account)),
        });
        if (response.ok) imported += 1;
        else failed += 1;
      }

      setMessage(
        `${imported} account${imported === 1 ? "" : "s"} imported${failed ? `, ${failed} skipped` : ""}. Refresh Accounts to view them.`,
      );
    } catch {
      setMessage("Invalid file. Use the provided JSON sample format.");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <section>
      <PageTitle
        eyebrow="Data portability"
        title="Backup & restore"
        text="Export account metadata in portable formats or restore records from a Vault JSON backup."
      />
      <div className="mt-7 grid gap-4 md:grid-cols-3">
        <BackupCard
          icon={FileJson}
          title="JSON backup"
          text="Structured data for restoration."
          onClick={() => download("json")}
        />
        <BackupCard
          icon={FileSpreadsheet}
          title="Excel / CSV"
          text="Spreadsheet-compatible export."
          onClick={() => download("csv")}
        />
        <BackupCard
          icon={FileText}
          title="Word document"
          text="Readable account summary."
          onClick={exportWordDocument}
        />
      </div>
      <div className="panel mt-5">
        <h2 className="text-lg font-semibold">Import accounts</h2>
        <p className="mt-2 text-sm text-slate-400">
          JSON supports current Vault exports and older backups. Each record needs
          an email or username. Exported backups never contain plaintext passwords.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-cyan-500 px-4 text-sm font-semibold text-[#021012]">
            <CloudUpload className="size-4" />
            Choose JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={importFile}
              className="sr-only"
            />
          </label>
          <button
            type="button"
            onClick={downloadSample}
            className="flex h-10 items-center gap-2 rounded-lg border border-white/10 px-4 text-sm"
          >
            <Download className="size-4" />
            Download sample
          </button>
        </div>
        {message && <p className="mt-4 text-sm text-cyan-300">{message}</p>}
      </div>
    </section>
  );
}

function BackupCard({ icon: Icon, title, text, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="panel text-left transition hover:border-cyan-300/30"
    >
      <Icon className="size-6 text-cyan-300" />
      <h2 className="mt-5 font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">{text}</p>
    </button>
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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

function safeParseMetadata(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

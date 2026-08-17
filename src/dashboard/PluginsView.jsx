import { useEffect, useState } from "react";
import {
  Bot,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  Plus,
  PlugZap,
  Power,
  Settings2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import apiFetch from "../api";
import { Modal } from "./DashboardUi";
import { getServiceLogoUrl } from "./serviceLogos";

const platforms = [
  {
    id: "spotify",
    name: "Spotify",
    url: "https://spotify.com",
    docsUrl: "https://developer.spotify.com/dashboard",
    description: "Prepare access to playlists, saved music, playback, and profile data.",
    capabilities: ["Playlists", "Library", "Playback"],
    fields: [
      { id: "clientId", label: "Client ID", required: true },
      { id: "clientSecret", label: "Client secret", required: true, secret: true },
      { id: "refreshToken", label: "Refresh token", secret: true },
      { id: "market", label: "Default market", placeholder: "US" },
    ],
  },
  {
    id: "facebook",
    name: "Facebook",
    url: "https://facebook.com",
    docsUrl: "https://developers.facebook.com/apps/",
    description: "Prepare access to Graph API apps, pages, publishing, and insights.",
    capabilities: ["Pages", "Publishing", "Insights"],
    fields: [
      { id: "appId", label: "App ID", required: true },
      { id: "appSecret", label: "App secret", required: true, secret: true },
      { id: "accessToken", label: "Access token", secret: true },
      { id: "pageId", label: "Page ID" },
    ],
  },
  {
    id: "discord",
    name: "Discord",
    url: "https://discord.com",
    docsUrl: "https://discord.com/developers/applications",
    description: "Prepare a bot integration for servers, channels, members, and messages.",
    capabilities: ["Servers", "Channels", "Bot actions"],
    fields: [
      { id: "applicationId", label: "Application ID", required: true },
      { id: "botToken", label: "Bot token", required: true, secret: true },
      { id: "publicKey", label: "Public key" },
      { id: "guildId", label: "Default server ID" },
    ],
  },
  {
    id: "google_workspace",
    name: "Google Workspace",
    url: "https://workspace.google.com",
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    description: "Prepare access to Gmail, Drive, Calendar, and Workspace resources.",
    capabilities: ["Gmail", "Drive", "Calendar"],
    fields: [
      { id: "clientId", label: "OAuth client ID", required: true },
      { id: "clientSecret", label: "OAuth client secret", required: true, secret: true },
      { id: "refreshToken", label: "Refresh token", secret: true },
      { id: "workspaceDomain", label: "Workspace domain", placeholder: "example.com" },
    ],
  },
];

function platformDetails(id) {
  return platforms.find((platform) => platform.id === id);
}

async function readResult(response, fallback) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || fallback);
  return result;
}

function PlatformLogo({ platform }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-white/10 bg-white p-2 shadow-lg shadow-black/15">
      {failed ? <PlugZap className="size-6 text-slate-700" /> : <img src={getServiceLogoUrl(platform.url)} alt={`${platform.name} logo`} className="size-8 object-contain" onError={() => setFailed(true)} />}
    </span>
  );
}

export default function PluginsView() {
  const [plugins, setPlugins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);
  const [config, setConfig] = useState({});
  const [visibleFields, setVisibleFields] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    let active = true;
    apiFetch("/plugins")
      .then((response) => readResult(response, "Unable to load plugins."))
      .then((result) => active && setPlugins(result.data || []))
      .catch((requestError) => active && setError(requestError.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  async function openEditor(platform, plugin) {
    setError("");
    setVisibleFields([]);
    if (!plugin) {
      setConfig({});
      setEditor({ platform, plugin: null });
      return;
    }
    setBusy(true);
    try {
      const result = await apiFetch(`/plugins/${encodeURIComponent(plugin.id)}`)
        .then((response) => readResult(response, "Unable to load plugin configuration."));
      setConfig({ accountName: result.data.accountName, ...(result.data.config || {}) });
      setEditor({ platform, plugin });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function savePlugin(event) {
    event.preventDefault();
    const cleanConfig = Object.fromEntries(Object.entries(config)
      .filter(([, value]) => typeof value === "string" && value.trim())
      .map(([key, value]) => [key, value.trim()]));
    setBusy(true);
    setError("");
    try {
      const editing = editor.plugin;
      const response = await apiFetch(editing ? `/plugins/${encodeURIComponent(editing.id)}` : "/plugins", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editing
          ? { config: cleanConfig }
          : { platform: editor.platform.id, config: cleanConfig }),
      });
      const result = await readResult(response, "Unable to save plugin configuration.");
      setPlugins((current) => [result.data, ...current.filter((plugin) => plugin.id !== result.data.id)]);
      setEditor(null);
      setConfig({});
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function togglePlugin(plugin) {
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch(`/plugins/${encodeURIComponent(plugin.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: !plugin.enabled }),
      });
      const result = await readResult(response, "Unable to change plugin status.");
      setPlugins((current) => current.map((item) => item.id === plugin.id ? result.data : item));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function removePlugin() {
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch(`/plugins/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      if (!response.ok) await readResult(response, "Unable to remove plugin.");
      setPlugins((current) => current.filter((plugin) => plugin.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="plugins-view pb-8">
      <div className="flex flex-col gap-3 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.045] p-4 sm:flex-row sm:items-center">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-300/10 text-emerald-300"><ShieldCheck className="size-5" /></span>
        <div><p className="text-sm font-medium text-slate-100">Secret-safe AI connection</p><p className="mt-1 text-xs leading-5 text-slate-400">AI Chat can identify enabled plugins and their capabilities. Client secrets, bot tokens, and refresh tokens stay encrypted and are never returned to the AI provider.</p></div>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}

      {loading ? (
        <div className="grid min-h-64 place-items-center text-slate-500"><LoaderCircle className="size-7 animate-spin" /></div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {platforms.map((platform) => {
            const platformPlugins = plugins.filter((item) => item.platform === platform.id);
            const enabledCount = platformPlugins.filter((plugin) => plugin.enabled).length;
            return (
              <article key={platform.id} className="flex min-h-80 flex-col rounded-2xl border border-white/[0.09] bg-gradient-to-br from-[#0b171e] to-[#071117] p-5 shadow-xl shadow-black/10">
                <div className="flex items-start justify-between gap-3">
                  <PlatformLogo platform={platform} />
                  <span className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold ${enabledCount ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-300" : platformPlugins.length ? "border-amber-300/20 bg-amber-300/10 text-amber-300" : "border-white/10 text-slate-500"}`}>{platformPlugins.length ? `${enabledCount}/${platformPlugins.length} enabled` : "Not configured"}</span>
                </div>
                <h2 className="mt-5 text-lg font-semibold text-white">{platform.name}</h2>
                <p className="mt-2 text-xs leading-5 text-slate-400">{platform.description}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">{platform.capabilities.map((capability) => <span key={capability} className="rounded-md bg-white/[0.045] px-2 py-1 text-[0.65rem] text-slate-400">{capability}</span>)}</div>
                <div className="mt-5 space-y-2">
                  {platformPlugins.map((plugin) => (
                    <div key={plugin.id} className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/10 p-2">
                      <span className={`size-2 shrink-0 rounded-full ${plugin.enabled ? "bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.55)]" : "bg-slate-600"}`} />
                      <button type="button" onClick={() => openEditor(platform, plugin)} disabled={busy} className="min-w-0 flex-1 truncate text-left text-xs font-medium text-slate-200 hover:text-white disabled:opacity-50">{plugin.accountName}</button>
                      <button type="button" onClick={() => openEditor(platform, plugin)} disabled={busy} className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-cyan-200 disabled:opacity-50" aria-label={`Manage ${plugin.accountName}`}><Settings2 className="size-3.5" /></button>
                      <button type="button" onClick={() => togglePlugin(plugin)} disabled={busy} className={`grid size-8 place-items-center rounded-lg hover:bg-white/5 disabled:opacity-50 ${plugin.enabled ? "text-emerald-300" : "text-slate-600"}`} aria-label={plugin.enabled ? `Pause ${plugin.accountName}` : `Enable ${plugin.accountName}`}><Power className="size-3.5" /></button>
                      <button type="button" onClick={() => setDeleteTarget(plugin)} disabled={busy} className="grid size-8 place-items-center rounded-lg text-slate-600 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50" aria-label={`Remove ${plugin.accountName}`}><Trash2 className="size-3.5" /></button>
                    </div>
                  ))}
                  {!platformPlugins.length && <p className="rounded-xl border border-dashed border-white/[0.08] px-3 py-4 text-center text-xs text-slate-600">No accounts connected</p>}
                </div>
                <div className="mt-auto pt-4">
                  <button type="button" onClick={() => openEditor(platform, null)} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/[0.07] text-xs font-semibold text-cyan-200 hover:bg-cyan-300/[0.11]"><Plus className="size-4" />Add {platform.name} account</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editor && (
        <Modal title={`${editor.plugin ? "Manage" : "Add"} ${editor.platform.name} account`} size="account" onClose={() => !busy && setEditor(null)}>
          <form onSubmit={savePlugin} className="mt-5">
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-3"><PlatformLogo platform={editor.platform} /><div><p className="text-sm font-medium text-white">{editor.platform.name} developer credentials</p><a href={editor.platform.docsUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-cyan-300 hover:text-cyan-200">Open developer console</a></div></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block min-w-0 sm:col-span-2"><span className="mb-2 block text-xs text-slate-400">Account name <span className="text-cyan-300">*</span></span><input type="text" value={config.accountName || ""} onChange={(event) => setConfig((current) => ({ ...current, accountName: event.target.value }))} required maxLength={200} autoComplete="off" placeholder={`My ${editor.platform.name} account`} className="form-control" /></label>
              {editor.platform.fields.map((field) => {
                const shown = !field.secret || visibleFields.includes(field.id);
                return (
                  <label key={field.id} className="block min-w-0">
                    <span className="mb-2 block text-xs text-slate-400">{field.label}{field.required && <span className="text-cyan-300"> *</span>}</span>
                    <span className="relative block">
                      <input type={shown ? "text" : "password"} value={config[field.id] || ""} onChange={(event) => setConfig((current) => ({ ...current, [field.id]: event.target.value }))} required={field.required} maxLength={8000} autoComplete="off" spellCheck="false" placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`} className={`form-control ${field.secret ? "pr-12" : ""}`} />
                      {field.secret && <button type="button" onClick={() => setVisibleFields((current) => current.includes(field.id) ? current.filter((id) => id !== field.id) : [...current, field.id])} className="absolute inset-y-0 right-1 grid w-10 place-items-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-white" aria-label={shown ? `Hide ${field.label}` : `Show ${field.label}`}>{shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>}
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500"><Bot className="mt-0.5 size-4 shrink-0 text-cyan-300" />Saving enables this plugin in AI Chat automatically. AI receives capabilities and connection status only.</p>
            <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setEditor(null)} disabled={busy} className="h-10 rounded-lg border border-white/10 px-4 text-sm text-slate-300">Cancel</button><button disabled={busy} className="flex h-10 items-center gap-2 rounded-lg bg-cyan-400 px-4 text-sm font-semibold text-[#031014] disabled:opacity-50">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}{editor.plugin ? "Save changes" : "Add account"}</button></div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Remove plugin?" onClose={() => !busy && setDeleteTarget(null)}>
          <p className="mt-5 text-sm leading-6 text-slate-400">This permanently removes the encrypted {deleteTarget.accountName} configuration from {platformDetails(deleteTarget.platform)?.name} and disconnects that account from AI Chat.</p>
          <div className="mt-6 flex justify-end gap-3"><button type="button" disabled={busy} onClick={() => setDeleteTarget(null)} className="h-10 rounded-lg border border-white/10 px-4 text-sm text-slate-300">Cancel</button><button type="button" disabled={busy} onClick={removePlugin} className="flex h-10 items-center gap-2 rounded-lg bg-red-500 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}Remove</button></div>
        </Modal>
      )}
    </section>
  );
}

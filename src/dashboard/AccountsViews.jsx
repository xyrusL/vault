import { useDeferredValue, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  Bookmark,
  Briefcase,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Copy,
  Clock3,
  Database,
  FileText,
  Folder,
  Gem,
  Globe2,
  Inbox,
  Eye,
  EyeOff,
  KeyRound,
  Layers3,
  Mail,
  LoaderCircle,
  Pencil,
  Plus,
  Rocket,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { apiFetch } from "../api";
import { Field, Modal, PageTitle, SelectField } from "./DashboardUi";

const accountLabels = ["Personal", "Work", "Family", "Shared", "Recovery"];
const platformsByCategory = {
  Social: [
    "Facebook",
    "Instagram",
    "X / Twitter",
    "TikTok",
    "LinkedIn",
    "Discord",
    "Reddit",
  ],
  Email: ["Google", "Apple", "Microsoft", "Yahoo", "Proton Mail"],
  Work: ["GitHub", "GitLab", "Slack", "Notion", "Zoom"],
  AI: [
    "OpenAI",
    "ChatGPT",
    "Anthropic",
    "Claude",
    "Grok",
    "Gemini",
    "Kimi",
    "Perplexity",
    "DeepSeek",
    "Groq",
    "OpenRouter",
  ],
  Entertainment: ["Netflix", "Spotify", "Steam", "Twitch", "YouTube"],
  Shopping: ["Amazon", "eBay", "Shopee", "Lazada"],
  Finance: ["PayPal", "Wise", "GCash", "Maya"],
  Custom: ["Custom"],
};
const accountCategories = Object.keys(platformsByCategory);
const accountPlans = ["Standard", "Free", "Premium", "Business", "Custom"];
const serviceLoginUrls = {
  Facebook: "https://facebook.com/login",
  Instagram: "https://instagram.com/accounts/login",
  "X / Twitter": "https://x.com/login",
  TikTok: "https://tiktok.com/login",
  LinkedIn: "https://linkedin.com/login",
  Discord: "https://discord.com/login",
  Reddit: "https://reddit.com/login",
  Google: "https://accounts.google.com",
  Apple: "https://account.apple.com",
  Microsoft: "https://account.microsoft.com",
  Yahoo: "https://login.yahoo.com",
  "Proton Mail": "https://account.proton.me/login",
  GitHub: "https://github.com/login",
  GitLab: "https://gitlab.com/users/sign_in",
  Slack: "https://slack.com/signin",
  Notion: "https://notion.so/login",
  Zoom: "https://zoom.us/signin",
  ChatGPT: "https://chatgpt.com/auth/login",
  OpenAI: "https://platform.openai.com/login",
  Anthropic: "https://console.anthropic.com/login",
  Claude: "https://claude.ai/login",
  Grok: "https://grok.com",
  Gemini: "https://gemini.google.com",
  Kimi: "https://kimi.com",
  Perplexity: "https://perplexity.ai",
  DeepSeek: "https://chat.deepseek.com/sign_in",
  Groq: "https://console.groq.com/login",
  OpenRouter: "https://openrouter.ai/sign-in",
  Netflix: "https://netflix.com/login",
  Spotify: "https://accounts.spotify.com/login",
  Steam: "https://store.steampowered.com/login",
  Twitch: "https://twitch.tv/login",
  YouTube: "https://accounts.google.com",
  Amazon: "https://amazon.com/signin",
  eBay: "https://signin.ebay.com",
  Shopee: "https://shopee.ph/buyer/login",
  Lazada: "https://lazada.com.ph/user/login",
  PayPal: "https://paypal.com/signin",
  Wise: "https://wise.com/login",
  GCash: "https://new.gcash.com",
  Maya: "https://maya.ph",
};
const accountsPerPage = 8;

const emptyAccount = {
  label: "Facebook",
  platform: platformsByCategory.Social[0],
  customPlatform: "",
  username: "",
  email: "",
  password: "",
  loginUrl: "",
  accountType: "social",
  category: accountCategories[0],
  plan: accountPlans[0],
  status: "Active",
  expiresAt: "",
  notes: "",
};

const metricToneStyles = {
  cyan: "bg-cyan-400/10 text-cyan-300",
  violet: "bg-violet-400/10 text-violet-300",
  green: "bg-emerald-400/10 text-emerald-300",
  orange: "bg-orange-400/10 text-orange-300",
};

const accountIcons = [
  Bot,
  Briefcase,
  Gem,
  Globe2,
  KeyRound,
  Mail,
  Rocket,
  Sparkles,
];

export function DashboardOverview({
  accounts,
  activity,
  apiHealthy,
  user,
  emailAddresses,
}) {
  return (
    <section>
      <PageTitle
        eyebrow="Account overview"
        title={`Welcome back, ${user?.displayName || "Admin"}`}
        text="Your vault is secure and everything looks good."
      />
      <div className="mt-7">
        <Metrics accounts={accounts} />
      </div>
      <div className="mt-8">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
            Email overview
          </p>
          <h2 className="mt-2 text-lg font-semibold">Generated email activity</h2>
        </div>
        <EmailMetrics addresses={emailAddresses} />
      </div>
      <div className="panel mt-5">
        <h2 className="text-lg font-semibold">Vault status</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <p className="flex items-center gap-3 text-sm text-slate-400">
            {apiHealthy ? (
              <CheckCircle2 className="size-5 text-emerald-300" />
            ) : (
              <ShieldAlert className="size-5 text-red-400" />
            )}
            {apiHealthy
              ? "D1 and API connected"
              : "API connection needs attention"}
          </p>
          <p className="flex items-center gap-3 text-sm text-slate-400">
            <ShieldCheck className="size-5 text-cyan-300" />
            Encryption active
          </p>
          <p className="flex items-center gap-3 text-sm text-slate-400">
            <Activity className="size-5 text-violet-300" />
            {activity.length} logged events
          </p>
        </div>
      </div>
    </section>
  );
}

export function AccountsView({
  accounts,
  loading,
  onAddAccount,
  onDelete,
  onAccountUpdated,
}) {
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredQuery = useDeferredValue(searchQuery.trim().toLowerCase());
  const filteredAccounts = deferredQuery
    ? accounts
        .map((account, index) => ({
          account,
          index,
          rank: getAccountSearchRank(account, deferredQuery),
        }))
        .filter((result) => result.rank !== -1)
        .sort(
          (first, second) =>
            first.rank - second.rank || first.index - second.index,
        )
        .map((result) => result.account)
    : accounts;

  return (
    <>
      <section>
        <PageTitle
          eyebrow="Credential vault"
          title="Accounts"
          text="Secure social, work, entertainment, and custom online accounts."
          action={
            <button
              type="button"
              onClick={onAddAccount}
              className="flex h-11 items-center gap-2 rounded-lg bg-cyan-500 px-5 text-sm font-semibold text-[#021012]"
            >
              <Plus className="size-4" />
              Add account
            </button>
          }
        />
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="group flex h-11 w-full max-w-md items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-4 text-slate-500 transition focus-within:border-cyan-300/50 focus-within:bg-cyan-300/[0.03] focus-within:text-cyan-300">
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search platform, username, or email..."
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              aria-label="Search accounts by platform, username, or email"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="grid size-7 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-white/5 hover:text-white"
                aria-label="Clear account search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </label>
          {deferredQuery && (
            <p className="text-xs text-slate-500" aria-live="polite">
              {filteredAccounts.length} matching account
              {filteredAccounts.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <div className="panel mt-4 !p-0">
          <AccountsTable
            key={deferredQuery}
            accounts={filteredAccounts}
            loading={loading}
            onDelete={onDelete}
            onView={setSelectedAccount}
            emptyMessage={
              deferredQuery
                ? `No platform, username, or email starts with "${searchQuery.trim()}".`
                : "No accounts saved yet."
            }
          />
        </div>
      </section>
      {selectedAccount && (
        <AccountDetailsModal
          account={selectedAccount}
          onClose={() => setSelectedAccount(null)}
          onUpdated={onAccountUpdated}
        />
      )}
    </>
  );
}

export function AccountModal({ onClose, onCreated }) {
  const [form, setForm] = useState(emptyAccount);
  const [error, setError] = useState("");
  const [duplicateDetails, setDuplicateDetails] = useState(null);
  const [saving, setSaving] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;

    if (name === "category") {
      const platform = platformsByCategory[value][0];
      setForm((current) => ({
        ...current,
        category: value,
        platform,
        customPlatform: "",
        label: platform === "Custom" ? "Custom account" : platform,
        loginUrl: serviceLoginUrls[platform] || "",
        accountType: value.toLowerCase(),
      }));
      return;
    }

    if (name === "platform") {
      setForm((current) => ({
        ...current,
        platform: value,
        customPlatform: "",
        label: value === "Custom" ? "Custom account" : value,
        loginUrl: serviceLoginUrls[value] || "",
      }));
      return;
    }

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setDuplicateDetails(null);

    try {
      const response = await apiFetch("/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          platform:
            form.platform === "Custom" ? form.customPlatform : form.platform,
          accountType: form.platform === "Custom" ? "custom" : "social",
          expiresAt: form.expiresAt || null,
        }),
      });
      const result = await response.json();
      if (
        response.status === 409 &&
        result.code === "ACCOUNT_EMAIL_DUPLICATE"
      ) {
        setDuplicateDetails(result.details);
        return;
      }
      if (!response.ok) {
        throw new Error(result.error || "Unable to save account");
      }

      onCreated(result.data);
      onClose();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add secured account" onClose={onClose}>
      <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Category"
          name="category"
          value={form.category}
          onChange={updateField}
          options={accountCategories}
        />
        <SelectField
          label="Platform / service"
          name="platform"
          value={form.platform}
          onChange={updateField}
          options={platformsByCategory[form.category]}
          getOptionIcon={(platform) =>
            getServiceLogoUrl(serviceLoginUrls[platform])
          }
        />
        {form.platform === "Custom" && (
          <Field
            label="Custom service name *"
            name="customPlatform"
            value={form.customPlatform}
            onChange={updateField}
            required
            placeholder="Enter service name"
          />
        )}
        <Field
          label="Account label"
          name="label"
          value={form.label}
          onChange={updateField}
          required
          placeholder="Personal, Work, Family..."
        />
        <Field
          label="Username"
          name="username"
          value={form.username}
          onChange={updateField}
          required={!form.email}
          placeholder="@username or account ID"
        />
        <Field
          label="Email address"
          name="email"
          type="email"
          value={form.email}
          onChange={updateField}
          required={!form.username}
          placeholder="name@example.com"
        />
        <Field
          label="Password (optional)"
          name="password"
          type="password"
          value={form.password}
          onChange={updateField}
          minLength={8}
          placeholder="Leave blank or enter 8+ characters"
        />
        <Field
          label="Login URL (optional)"
          name="loginUrl"
          type="url"
          value={form.loginUrl}
          onChange={updateField}
          placeholder="https://service.example.com/login"
        />
        <Field
          label="Expiration date (optional)"
          name="expiresAt"
          type="date"
          value={form.expiresAt}
          onChange={updateField}
        />
        <label className="sm:col-span-2">
          <span className="mb-2 block text-xs text-slate-400">Notes</span>
          <textarea
            name="notes"
            value={form.notes}
            onChange={updateField}
            rows="3"
            className="form-control resize-none"
            placeholder="Optional private notes"
          />
        </label>
        {error && (
          <p className="sm:col-span-2 rounded-lg bg-red-400/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}
        {duplicateDetails && (
          <DuplicateAccountNotice details={duplicateDetails} />
        )}
        <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:flex sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-lg border border-white/10 px-4 text-sm text-slate-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-11 rounded-lg bg-cyan-500 px-5 text-sm font-semibold text-[#021012] disabled:opacity-50"
          >
            {saving ? "Encrypting..." : "Save account"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DuplicateAccountNotice({ details }) {
  const account = details.existingAccount;

  return (
    <div className="sm:col-span-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-4">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-300" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-amber-200">
            Account already secured
          </h3>
          <p className="mt-1 break-all text-sm text-slate-300">
            {details.email}
          </p>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Existing record</dt>
              <dd className="mt-0.5 text-slate-300">
                {account.label} · {account.plan} · {getEffectiveStatus(account)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Originally added</dt>
              <dd className="mt-0.5 text-slate-300">
                {formatTimestamp(account.created_at)}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Duplicate detected</dt>
              <dd className="mt-0.5 text-slate-300">
                {formatTimestamp(details.detectedAt)}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

function AccountDetailsModal({ account, onClose, onUpdated }) {
  const [details, setDetails] = useState(null);
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    apiFetch(`/accounts/${account.id}?details=1`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Unable to load account");
        if (active) setDetails(result.data);
      })
      .catch((caught) => {
        if (active) setError(caught.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [account.id]);

  function startEditing() {
    setForm({
      platform: details.platform || "Custom",
      username: details.username || "",
      email: details.email || "",
      loginUrl: details.login_url || "",
      password: details.password || "",
      expiresAt: details.expires_at?.slice(0, 10) || "",
      label: details.label,
      category: details.category,
      plan: details.plan,
      status: details.status === "Inactive" ? "Inactive" : "Active",
      notes: details.notes || "",
    });
    setError("");
    setEditing(true);
  }

  function updateField(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const response = await apiFetch(`/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, expiresAt: form.expiresAt || null }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to update account");

      onUpdated(result.data);
      const detailsResponse = await apiFetch(
        `/accounts/${account.id}?details=1`,
      );
      const detailsResult = await detailsResponse.json();
      if (!detailsResponse.ok) {
        throw new Error(detailsResult.error || "Unable to refresh account");
      }
      setDetails(detailsResult.data);
      setEditing(false);
      setShowPassword(false);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={editing ? "Edit secured account" : "Account details"}
      onClose={onClose}
      size="wide"
      header={(
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full border border-cyan-300/10 bg-cyan-300/[0.07] text-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.08)]">
              {editing ? <ShieldCheck className="size-5" /> : <Mail className="size-5" />}
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-white sm:text-xl">
                {editing ? "Edit secured account" : "Account details"}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400 sm:text-sm">
                {editing
                  ? "Update the details for this account or service."
                  : "View and manage account information"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/[0.06] text-slate-400 transition hover:bg-white/5 hover:text-white"
            aria-label={editing ? "Close account editor" : "Close account details"}
          >
            <X className="size-5" />
          </button>
        </div>
      )}
    >
      {loading && (
        <div className="grid min-h-56 place-items-center text-slate-400">
          <LoaderCircle className="size-6 animate-spin" />
        </div>
      )}
      {!loading && error && !details && (
        <p className="mt-5 rounded-lg bg-red-400/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}
      {!loading && details && !editing && (
        <AccountDetails
          details={details}
          showPassword={showPassword}
          onPasswordVisibility={() => setShowPassword((visible) => !visible)}
          onEdit={startEditing}
          onClose={onClose}
        />
      )}
      {!loading && details && editing && (
        <form onSubmit={save} className="mt-5 grid gap-x-5 gap-y-3 sm:grid-cols-2">
          <Field
            label="Platform / service"
            name="platform"
            value={form.platform}
            onChange={updateField}
            required
          />
          <Field
            label="Username"
            name="username"
            value={form.username}
            onChange={updateField}
            required={!form.email}
          />
          <Field
            label="Email address"
            name="email"
            type="email"
            value={form.email}
            onChange={updateField}
            required={!form.username}
          />
          <Field
            label="Password (optional)"
            name="password"
            type="password"
            value={form.password}
            onChange={updateField}
            minLength={8}
            placeholder="Leave blank for no password"
          />
          <Field
            label="Expiration date (optional)"
            name="expiresAt"
            type="date"
            value={form.expiresAt}
            onChange={updateField}
          />
          <Field
            label="Login URL (optional)"
            name="loginUrl"
            type="url"
            value={form.loginUrl}
            onChange={updateField}
          />
          <SelectField
            label="Account label"
            name="label"
            value={form.label}
            onChange={updateField}
            options={accountLabels}
          />
          <SelectField
            label="Category"
            name="category"
            value={form.category}
            onChange={updateField}
            options={accountCategories}
          />
          <SelectField
            label="Plan"
            name="plan"
            value={form.plan}
            onChange={updateField}
            options={accountPlans}
          />
          <SelectField
            label="Status"
            name="status"
            value={form.status}
            onChange={updateField}
            options={["Active", "Inactive"]}
          />
          <label className="sm:col-span-2">
            <span className="mb-2 block text-xs text-slate-400">Notes</span>
            <textarea
              name="notes"
              value={form.notes}
              onChange={updateField}
              rows="3"
              className="form-control resize-none"
            />
          </label>
          {error && (
            <p className="sm:col-span-2 rounded-lg bg-red-400/10 px-4 py-3 text-sm text-red-300">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:flex sm:justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => setEditing(false)}
              className="h-11 rounded-lg border border-white/10 px-4 text-sm text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-11 rounded-lg bg-cyan-500 px-5 text-sm font-semibold text-[#021012] disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function AccountDetails({
  details,
  showPassword,
  onPasswordVisibility,
  onEdit,
  onClose,
}) {
  const status = getEffectiveStatus(details);

  return (
    <div className="mt-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onEdit}
          className="flex h-9 items-center gap-2 rounded-lg border border-cyan-300/35 px-3 text-xs font-medium text-cyan-300 transition hover:bg-cyan-300/[0.06]"
        >
          <Pencil className="size-4" />
          Edit account
        </button>
      </div>
      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {details.email && (
          <PrimaryDetail label="Email" className="sm:col-span-2 lg:col-span-2">
            <span className="break-all">{details.email}</span>
            <CopyButton value={details.email} label="Copy email" />
          </PrimaryDetail>
        )}
        {details.username && (
          <PrimaryDetail label="Username">
            <span className="break-all">{details.username}</span>
            <CopyButton value={details.username} label="Copy username" />
          </PrimaryDetail>
        )}
        {details.login_url && (
          <PrimaryDetail label="Login URL" className="sm:col-span-2 lg:col-span-2">
            <a
              href={details.login_url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 break-all text-cyan-300 hover:underline"
            >
              {details.login_url}
            </a>
            <CopyButton value={details.login_url} label="Copy login URL" />
          </PrimaryDetail>
        )}
        {details.password && (
          <PrimaryDetail label="Password">
            <span className="min-w-0 flex-1 break-all font-mono">
              {showPassword ? details.password : "••••••••••••"}
            </span>
            <button
              type="button"
              onClick={onPasswordVisibility}
              className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 text-slate-400 hover:text-white"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
            <CopyButton value={details.password} label="Copy password" />
          </PrimaryDetail>
        )}
        <DetailItem label="Account label" icon={Bot}>{details.label}</DetailItem>
        <DetailItem label="Platform" icon={Layers3}>{details.platform || "Custom"}</DetailItem>
        <DetailItem label="Category" icon={Folder}>{details.category}</DetailItem>
        <DetailItem label="Plan" icon={Bookmark}>{details.plan}</DetailItem>
        <DetailItem label="Status" icon={ShieldCheck}>
          <span className={`flex items-center gap-2 ${getStatusTone(status)}`}>
            {status}
            <i className={`size-2 rounded-full ${getStatusDotTone(status)}`} />
          </span>
        </DetailItem>
        <DetailItem label="Expiration" icon={CalendarClock}>
          {formatExpiry(details, true)}
        </DetailItem>
        <DetailItem label="Added" icon={Clock3}>
          {formatTimestamp(details.created_at)}
        </DetailItem>
        {details.notes && (
          <DetailItem
            label="Notes"
            icon={FileText}
            className="sm:col-span-2 lg:col-span-3"
          >
            <span className="whitespace-pre-wrap break-words">
              {details.notes}
            </span>
          </DetailItem>
        )}
      </div>
      <div className="mt-4 flex justify-center">
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-white/10 bg-white/[0.04] px-5 text-xs text-slate-300 transition hover:bg-white/[0.07] hover:text-white">Close</button>
      </div>
    </div>
  );
}

function PrimaryDetail({ label, children, className = "" }) {
  return (
    <div className={`rounded-xl border border-cyan-100/10 bg-gradient-to-br from-white/[0.035] to-cyan-300/[0.015] px-3.5 py-2.5 ${className}`}>
      <p className="text-[11px] uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <div className="mt-1.5 flex min-w-0 items-center justify-between gap-3 text-sm font-medium text-slate-100">
        {children}
      </div>
    </div>
  );
}

function DetailItem({ label, children, icon: Icon, className = "" }) {
  return (
    <div className={`flex min-h-[62px] items-center gap-3 rounded-xl border border-cyan-100/10 bg-gradient-to-br from-white/[0.035] to-cyan-300/[0.015] p-3 ${className}`}>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-cyan-300/[0.06] text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.06)]">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
        <div className="mt-1 break-words text-sm font-medium text-slate-200">{children}</div>
      </div>
    </div>
  );
}

function CopyButton({ value, label, compact = false }) {
  const [copiedAt, setCopiedAt] = useState(0);
  const copied = copiedAt > 0;

  useEffect(() => {
    if (!copiedAt) return undefined;
    const resetTimer = window.setTimeout(() => setCopiedAt(0), 1500);
    return () => window.clearTimeout(resetTimer);
  }, [copiedAt]);

  async function handleCopy() {
    if (!value || !navigator.clipboard) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopiedAt(Date.now());
    } catch {
      setCopiedAt(0);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!value}
      className={`grid shrink-0 place-items-center disabled:cursor-not-allowed disabled:opacity-40 ${copied ? "text-emerald-300" : "text-slate-400 hover:text-cyan-300"} ${compact ? "inline-copy-button size-7 rounded-md hover:bg-white/5" : "size-9 rounded-lg border border-white/10 hover:border-cyan-300/30"}`}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
    >
      {copied ? (
        <Check className={compact ? "size-3.5" : "size-4"} />
      ) : (
        <Copy className={compact ? "size-3.5" : "size-4"} />
      )}
    </button>
  );
}

function Metrics({ accounts }) {
  const metrics = [
    {
      label: "Total Accounts",
      value: accounts.length,
      detail: "All saved accounts",
      icon: Bot,
      tone: "cyan",
    },
    {
      label: "Platforms",
      value: new Set(accounts.map((account) => account.platform || "Custom"))
        .size,
      detail: "Services protected",
      icon: Globe2,
      tone: "violet",
    },
    {
      label: "Active Accounts",
      value: accounts.filter(
        (account) => getEffectiveStatus(account) === "Active",
      ).length,
      detail: "Available right now",
      icon: ShieldCheck,
      tone: "green",
    },
    {
      label: "Expiring Soon",
      value: accounts.filter(
        (account) => getEffectiveStatus(account) === "Expiring Soon",
      ).length,
      detail: "Within the next 5 days",
      icon: CalendarClock,
      tone: "orange",
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ label, value, detail, icon: Icon, tone }) => (
        <article
          key={label}
          className="metric-card rounded-xl border border-white/10 bg-white/[0.025] p-5"
        >
          <div className="flex justify-between">
            <div>
              <p className="text-xs text-slate-400">{label}</p>
              <strong className="mt-2 block text-2xl">{value}</strong>
            </div>
            <span
              className={`grid size-10 place-items-center rounded-xl ${metricToneStyles[tone]}`}
            >
              <Icon className="size-5" />
            </span>
          </div>
          <p className="mt-6 text-xs text-slate-500">{detail}</p>
        </article>
      ))}
    </section>
  );
}

function EmailMetrics({ addresses }) {
  const totalMessages = addresses.reduce(
    (sum, address) => sum + Number(address.messageCount || 0),
    0,
  );
  const unreadMessages = addresses.reduce(
    (sum, address) => sum + Number(address.unreadCount || 0),
    0,
  );
  const storageBytes = addresses.reduce(
    (sum, address) => sum + Number(address.storageBytes || 0),
    0,
  );
  const metrics = [
    {
      label: "Generated Emails",
      value: addresses.length,
      detail: "Private addresses created",
      icon: Mail,
      tone: "cyan",
    },
    {
      label: "Received Messages",
      value: totalMessages,
      detail: "Across all generated emails",
      icon: Inbox,
      tone: "violet",
    },
    {
      label: "Unread Messages",
      value: unreadMessages,
      detail: unreadMessages ? "Waiting in your inbox" : "All caught up",
      icon: Activity,
      tone: "green",
    },
    {
      label: "Email Storage",
      value: formatBytes(storageBytes),
      detail: "Message storage currently used",
      icon: Database,
      tone: "orange",
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ label, value, detail, icon: Icon, tone }) => (
        <article
          key={label}
          className="metric-card rounded-xl border border-white/10 bg-white/[0.025] p-5"
        >
          <div className="flex justify-between gap-4">
            <div>
              <p className="text-xs text-slate-400">{label}</p>
              <strong className="mt-2 block text-2xl">{value}</strong>
            </div>
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-xl ${metricToneStyles[tone]}`}
            >
              <Icon className="size-5" />
            </span>
          </div>
          <p className="mt-6 text-xs text-slate-500">{detail}</p>
        </article>
      ))}
    </section>
  );
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function AccountActions({ account, onDelete, onView }) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        className="action-button"
        onClick={() => onView(account)}
        aria-label="View account"
      >
        <Eye />
      </button>
      <button
        type="button"
        className="action-button hover:!text-red-300"
        onClick={() => onDelete(account)}
        aria-label="Delete account"
      >
        <Trash2 />
      </button>
    </div>
  );
}

function AccountAvatar({ account, compact = false }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const identity = getAccountIdentity(account);
  const Icon = identity.Icon;
  const logoUrl = getServiceLogoUrl(account.login_url);

  if (logoUrl && !logoFailed) {
    return (
      <span
        className={`grid shrink-0 place-items-center rounded-full bg-white p-1.5 ${compact ? "size-8" : "size-10"}`}
        aria-hidden="true"
      >
        <img
          src={logoUrl}
          alt=""
          loading="lazy"
          onError={() => setLogoFailed(true)}
          className="size-full object-contain"
        />
      </span>
    );
  }

  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full text-white ${compact ? "size-8" : "size-10"}`}
      style={{ backgroundColor: identity.color }}
      aria-hidden="true"
    >
      <Icon className={compact ? "size-4" : "size-[18px]"} />
    </span>
  );
}

function getServiceLogoUrl(loginUrl) {
  if (!loginUrl) return null;
  try {
    const domain = new URL(loginUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
  } catch {
    return null;
  }
}

function AccountsTable({ accounts, loading, onDelete, onView, emptyMessage }) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(accounts.length / accountsPerPage));
  const firstAccountIndex = (currentPage - 1) * accountsPerPage;
  const visibleAccounts = accounts.slice(
    firstAccountIndex,
    firstAccountIndex + accountsPerPage,
  );

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  return (
    <div>
      <div className="divide-y divide-white/[0.06] xl:hidden">
        {visibleAccounts.map((account) => (
          <article key={account.id} className="p-4">
            <div className="flex min-w-0 items-start gap-3">
              <AccountAvatar account={account} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium">
                      {account.label}
                    </h3>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                      <span className="min-w-0 break-all">
                        {account.email || account.username || "No identity"}
                      </span>
                      <CopyButton
                        value={account.email || account.username || ""}
                        label="Copy identity"
                        compact
                      />
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-xs ${getStatusTone(getEffectiveStatus(account))}`}
                  >
                    {getEffectiveStatus(account)}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <span className="rounded bg-cyan-400/8 px-2 py-1 text-xs text-cyan-300">
                      {account.platform || "Custom"}
                    </span>
                    <p className="mt-2 text-[11px] text-slate-500">
                      {formatExpiry(account, true)}
                    </p>
                  </div>
                  <AccountActions
                    account={account}
                    onDelete={onDelete}
                    onView={onView}
                  />
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto xl:block">
        <table className="w-full min-w-[860px] text-left">
          <thead>
            <tr className="border-b border-white/8 text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-5 py-4">Account</th>
              <th className="px-5 py-4">Email</th>
              <th className="px-5 py-4">Plan</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4">Expires</th>
              <th className="px-5 py-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleAccounts.map((account) => (
              <tr
                key={account.id}
                className="border-b border-white/[0.06] text-sm hover:bg-white/[0.025]"
              >
                <td className="px-5 py-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <AccountAvatar account={account} compact />
                    <div className="min-w-0">
                      <p className="max-w-40 truncate font-medium">
                        {account.label}
                      </p>
                      <span className="text-[10px] text-cyan-300/70">
                        {account.category}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="max-w-56 px-5 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 truncate">
                      {account.email || account.username || "No identity"}
                    </span>
                    <CopyButton
                      value={account.email || account.username || ""}
                      label="Copy identity"
                      compact
                    />
                  </div>
                </td>
                <td className="px-5">
                  <span className="rounded bg-cyan-400/8 px-2 py-1 text-xs text-cyan-300">
                    {account.platform || "Custom"}
                  </span>
                </td>
                <td className="px-5">
                  <span className={`text-xs ${getStatusTone(getEffectiveStatus(account))}`}>
                    {getEffectiveStatus(account)}
                  </span>
                </td>
                <td className="px-5 text-xs text-slate-400">
                  {formatExpiry(account)}
                </td>
                <td className="px-5">
                  <AccountActions
                    account={account}
                    onDelete={onDelete}
                    onView={onView}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loading && (
        <div className="py-14 text-center text-sm text-slate-400">
          Loading encrypted records...
        </div>
      )}
      {!loading && accounts.length === 0 && (
        <div className="py-14 text-center">
          <KeyRound className="mx-auto size-8 text-slate-600" />
          <p className="mt-3 text-sm text-slate-400">{emptyMessage}</p>
        </div>
      )}
      {!loading && accounts.length > accountsPerPage && (
        <AccountPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalAccounts={accounts.length}
          firstAccountIndex={firstAccountIndex}
          visibleCount={visibleAccounts.length}
          onPageChange={setCurrentPage}
        />
      )}
    </div>
  );
}

function AccountPagination({
  currentPage,
  totalPages,
  totalAccounts,
  firstAccountIndex,
  visibleCount,
  onPageChange,
}) {
  const pageItems = getVisiblePageItems(currentPage, totalPages);

  return (
    <footer className="flex flex-col items-center justify-between gap-3 border-t border-white/[0.07] p-4 sm:flex-row sm:px-5">
      <p className="text-xs text-slate-500">
        Showing {firstAccountIndex + 1}-{firstAccountIndex + visibleCount} of{" "}
        {totalAccounts} accounts
      </p>
      <nav className="flex items-center gap-1.5" aria-label="Account pages">
        <button
          type="button"
          className="pagination-button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Previous page"
        >
          <ChevronLeft />
        </button>
        {pageItems.map((item, index) =>
          item === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              className="grid size-8 place-items-center text-xs text-slate-600"
              aria-hidden="true"
            >
              ...
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={`pagination-button text-xs ${item === currentPage ? "border-cyan-300/40 bg-cyan-300/10 !text-cyan-300" : ""}`}
              onClick={() => onPageChange(item)}
              aria-label={`Page ${item}`}
              aria-current={item === currentPage ? "page" : undefined}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          className="pagination-button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Next page"
        >
          <ChevronRight />
        </button>
      </nav>
    </footer>
  );
}

function getVisiblePageItems(currentPage, totalPages) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([
    1,
    Math.max(2, currentPage - 1),
    currentPage,
    Math.min(totalPages - 1, currentPage + 1),
    totalPages,
  ]);
  const sortedPages = [...pages].sort((first, second) => first - second);
  const items = [];

  sortedPages.forEach((page, index) => {
    if (index > 0 && page - sortedPages[index - 1] > 1) items.push("ellipsis");
    items.push(page);
  });

  return items;
}

function formatExpiry(account, includePrefix = false) {
  if (!account.expires_at) return "No expiry";

  const date = new Date(account.expires_at).toLocaleDateString();
  return includePrefix ? `Expires ${date}` : date;
}

function formatTimestamp(value) {
  if (!value) return "Unknown";

  const normalized = value.includes("T")
    ? value
    : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function getStatusTone(status) {
  if (status === "Expired") return "text-red-300";
  if (status === "Expiring Soon") return "text-amber-300";
  if (status === "Inactive") return "text-slate-400";
  return "text-emerald-300";
}

function getStatusDotTone(status) {
  if (status === "Expired") return "bg-red-300 shadow-[0_0_8px_rgba(252,165,165,0.65)]";
  if (status === "Expiring Soon") return "bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.65)]";
  if (status === "Inactive") return "bg-slate-400";
  return "bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.65)]";
}

function getEffectiveStatus(account) {
  if (account.status === "Inactive") return "Inactive";
  if (!account.expires_at) return "Active";

  const expiryDate = new Date(`${account.expires_at.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(expiryDate.getTime())) return account.status || "Active";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntilExpiry = Math.round(
    (expiryDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (daysUntilExpiry < 0) return "Expired";
  if (daysUntilExpiry <= 5) return "Expiring Soon";
  return "Active";
}

function getAccountIdentity(account) {
  const hash = hashString(
    account.id || account.email || account.username || "account",
  );
  return {
    Icon: accountIcons[hash % accountIcons.length],
    color: `hsl(${hash % 360} 72% 38%)`,
  };
}

function getAccountSearchRank(account, query) {
  const prioritizedValues = [account.platform, account.username, account.email];
  return prioritizedValues.findIndex((value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .startsWith(query),
  );
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

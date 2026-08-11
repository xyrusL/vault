import { useDeferredValue, useEffect, useMemo, useState } from "react";
import * as OTPAuth from "otpauth";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Bookmark,
  Briefcase,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Copy,
  Clock3,
  CloudUpload,
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
  MessageSquareText,
  LoaderCircle,
  Pencil,
  Plus,
  Rocket,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Zap,
  X,
} from "lucide-react";
import { apiFetch } from "../api";
import { Field, Modal, SelectField } from "./DashboardUi";
import { getServiceLogoUrl } from "./serviceLogos";

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
const accountSortOptions = [
  { value: "recent", label: "Recently added" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A-Z" },
  { value: "expiry", label: "Expiring first" },
];
const emailActivityRanges = [
  { value: "1", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

const emptyAccount = {
  label: "Facebook",
  platform: platformsByCategory.Social[0],
  customPlatform: "",
  username: "",
  email: "",
  password: "",
  loginUrl: "",
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
  onNavigate,
  onAddAccount,
}) {
  return (
    <section className="dashboard-overview">
      <h2 className="sr-only">Welcome back, {user?.displayName || "Admin"}</h2>
      <div className="dashboard-mobile-intro mb-5 hidden">
        <h1 className="text-2xl font-semibold tracking-[-0.035em] text-white">Dashboard</h1>
        <p className="mt-1.5 text-sm text-slate-400">Overview of your vault and system activity</p>
      </div>
      <div>
        <Metrics accounts={accounts} />
      </div>
      <div className="overview-panel mt-5 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="overview-heading">Email overview</h2>
          <button type="button" onClick={() => onNavigate("email-generator")} className="dashboard-overview-link hidden items-center gap-1.5 text-xs text-cyan-300">View all <ChevronRight className="size-4" /></button>
        </div>
        <div className="mt-4"><EmailMetrics addresses={emailAddresses} /></div>
      </div>
      <div className="dashboard-overview-grid mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="dashboard-insights-grid grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(250px,.8fr)]">
          <EmailActivityChart />
          <div className="dashboard-status-stack grid gap-5">
            <div className="overview-panel p-5">
              <h2 className="text-base font-semibold">Vault status</h2>
              <div className="mt-6 space-y-6">
                <StatusItem icon={apiHealthy ? CheckCircle2 : ShieldAlert} tone={apiHealthy ? "text-emerald-300" : "text-red-400"} text={apiHealthy ? "D1 and API connected" : "API connection needs attention"} />
                <StatusItem icon={ShieldCheck} tone="text-cyan-300" text="Encryption active" />
                <StatusItem icon={Activity} tone="text-violet-300" text={`${activity.length} logged events`} />
              </div>
              <button type="button" onClick={() => onNavigate("activity")} className="dashboard-status-link mt-5 hidden h-11 w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/40 text-xs text-cyan-300">View system details <ChevronRight className="size-4" /></button>
            </div>
            <ExpiringSummary accounts={accounts} />
          </div>
        </div>
        <RecentActivity activity={activity} onViewAll={() => onNavigate("activity")} />
      </div>
      <QuickAccess onNavigate={onNavigate} onAddAccount={onAddAccount} />
    </section>
  );
}

export function AccountsView({
  accounts,
  loading,
  onAddAccount,
  onDelete,
  onAccountUpdated,
  onContextChange,
}) {
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [sortOpen, setSortOpen] = useState(false);
  const [authenticatorEntries, setAuthenticatorEntries] = useState([]);
  const [authenticatorNow, setAuthenticatorNow] = useState(Date.now());
  const deferredQuery = useDeferredValue(searchQuery.trim().toLowerCase());
  const sortedAccounts = [...accounts].sort((first, second) => compareAccounts(first, second, sortBy));
  const filteredAccounts = deferredQuery
    ? sortedAccounts
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
    : sortedAccounts;
  const authenticatorByAccount = useMemo(() => new Map(accounts.map((account) => [
    account.id,
    findMatchingAuthenticator(account, authenticatorEntries),
  ])), [accounts, authenticatorEntries]);
  const activeAccounts = accounts.filter((account) => getEffectiveStatus(account) === "Active").length;
  const expiringAccounts = accounts.filter((account) => getEffectiveStatus(account) === "Expiring Soon").length;

  useEffect(() => {
    let active = true;
    apiFetch("/authenticator")
      .then((response) => response.ok ? response.json() : null)
      .then((result) => { if (active && result) setAuthenticatorEntries(result.data || []); })
      .catch(() => {});
    const timer = window.setInterval(() => setAuthenticatorNow(Date.now()), 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    onContextChange?.({
      searchQuery,
      matchingAccountCount: filteredAccounts.length,
      selectedAccount: selectedAccount ? {
        id: selectedAccount.id,
        label: selectedAccount.label,
        platform: selectedAccount.platform,
        email: selectedAccount.email,
        username: selectedAccount.username,
        hasPassword: Boolean(selectedAccount.hasPassword ?? selectedAccount.has_password),
      } : null,
    });
    return () => onContextChange?.(null);
  }, [filteredAccounts.length, onContextChange, searchQuery, selectedAccount]);

  return (
    <>
      <section className="accounts-page">
        <div className="accounts-mobile-summary sm:hidden">
          <MobileAccountMetric icon={KeyRound} label="Total Accounts" value={accounts.length} detail="All accounts" tone="cyan" />
          <MobileAccountMetric icon={ShieldCheck} label="Active" value={activeAccounts} detail="Healthy" tone="green" />
          <MobileAccountMetric icon={CalendarClock} label="Expiring Soon" value={expiringAccounts} detail="Within 5 days" tone="orange" />
        </div>
        <div className="accounts-toolbar flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="accounts-mobile-search sm:contents">
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
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            {deferredQuery && (
              <p className="text-xs text-slate-500" aria-live="polite">
                {filteredAccounts.length} matching account
                {filteredAccounts.length === 1 ? "" : "s"}
              </p>
            )}
            <button type="button" onClick={onAddAccount} className="hidden h-11 shrink-0 items-center gap-2 rounded-lg bg-cyan-500 px-5 text-sm font-semibold text-[#021012] sm:flex">
              <Plus className="size-4" /> Add account
            </button>
          </div>
        </div>
        <div className="accounts-mobile-list-heading sm:hidden">
          <h2>Your Accounts</h2>
          <div className="accounts-sort-control">
            <button type="button" onClick={() => setSortOpen((open) => !open)} aria-expanded={sortOpen} aria-haspopup="listbox">
              <span>Sort by:</span>
              <strong>{accountSortOptions.find((option) => option.value === sortBy)?.label}</strong>
              <ChevronDown className={sortOpen ? "rotate-180" : ""} />
            </button>
            {sortOpen && (
              <div className="accounts-sort-menu" role="listbox" aria-label="Sort accounts">
                {accountSortOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={sortBy === option.value}
                    className={sortBy === option.value ? "is-active" : ""}
                    onClick={() => {
                      setSortBy(option.value);
                      setSortOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                    {sortBy === option.value && <Check />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="panel accounts-list-panel mt-4 !p-0">
          <AccountsTable
            key={deferredQuery}
            accounts={filteredAccounts}
            loading={loading}
            authenticatorByAccount={authenticatorByAccount}
            authenticatorNow={authenticatorNow}
            onDelete={onDelete}
            onView={setSelectedAccount}
            emptyMessage={
              deferredQuery
                ? `No platform, username, or email starts with "${searchQuery.trim()}".`
                : "No accounts saved yet."
            }
          />
        </div>
        <button type="button" onClick={onAddAccount} className="accounts-mobile-fab sm:hidden" aria-label="Add account">
          <Plus />
        </button>
      </section>
      {selectedAccount && (
        <AccountDetailsModal
          account={selectedAccount}
          authenticatorEntry={authenticatorByAccount.get(selectedAccount.id)}
          authenticatorNow={authenticatorNow}
          onClose={() => setSelectedAccount(null)}
          onUpdated={onAccountUpdated}
        />
      )}
    </>
  );
}

function MobileAccountMetric({ icon: Icon, label, value, detail, tone }) {
  return (
    <article className={`accounts-mobile-metric is-${tone}`}>
      <span><Icon /></span>
      <div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div>
    </article>
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
    <Modal title="Add secured account" onClose={onClose} size="account" className="account-create-modal">
      <form onSubmit={submit} className="account-create-form mt-6 grid gap-4 sm:grid-cols-2">
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
            rows="2"
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

function AccountDetailsModal({ account, authenticatorEntry, authenticatorNow, onClose, onUpdated }) {
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
      className={`account-details-modal account-modal-sheet ${editing ? "account-editor-modal" : ""}`}
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
          authenticatorEntry={authenticatorEntry}
          authenticatorNow={authenticatorNow}
          showPassword={showPassword}
          onPasswordVisibility={() => setShowPassword((visible) => !visible)}
          onEdit={startEditing}
        />
      )}
      {!loading && details && editing && (
        <form onSubmit={save} className="account-edit-form mt-5 grid gap-x-5 gap-y-3 sm:grid-cols-2">
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
            rows="2"
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
  authenticatorEntry,
  authenticatorNow,
  showPassword,
  onPasswordVisibility,
  onEdit,
}) {
  const status = getEffectiveStatus(details);

  return (
    <div className="account-details-content mt-5">
      <div className="account-details-toolbar">
        <div className="account-details-status">
          <span className={`account-details-status-dot ${getStatusDotTone(status)}`} />
          <span className={getStatusTone(status)}>{status}</span>
          <span className="text-slate-600">Secured record</span>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="account-details-edit flex h-10 items-center gap-2 rounded-lg border border-cyan-300/30 px-3.5 text-sm font-medium text-cyan-300 transition hover:bg-cyan-300/[0.06]"
        >
          <Pencil className="size-4" />
          Edit account
        </button>
      </div>
      <div className="account-details-layout">
        <section className="account-credentials-section" aria-labelledby="account-signin-heading">
          <div className="account-details-section-heading">
            <h3 id="account-signin-heading">Sign-in information</h3>
            <p>Credentials and access details for this account.</p>
          </div>
          <div className="account-credential-list">
            {details.email && (
              <PrimaryDetail label="Email address">
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
              <PrimaryDetail label="Login URL">
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
                <span className="min-w-0 flex-1 break-all font-mono tracking-[0.12em]">
                  {showPassword ? details.password : "••••••••••••"}
                </span>
                <button
                  type="button"
                  onClick={onPasswordVisibility}
                  className="account-credential-action grid size-10 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white"
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
            <PrimaryDetail label="2FA code">
              <VerificationCode
                entry={authenticatorEntry}
                now={authenticatorNow}
                emptyLabel="No value"
              />
            </PrimaryDetail>
          </div>
          {details.notes && (
            <div className="account-details-notes">
              <div className="account-details-section-heading">
                <h3>Private notes</h3>
              </div>
              <p className="whitespace-pre-wrap break-words">{details.notes}</p>
            </div>
          )}
        </section>

        <aside className="account-profile-section" aria-labelledby="account-profile-heading">
          <div className="account-details-section-heading">
            <h3 id="account-profile-heading">Account profile</h3>
            <p>Classification and lifecycle details.</p>
          </div>
          <dl className="account-profile-list">
            <DetailItem label="Account label" icon={Bot}>{details.label}</DetailItem>
            <DetailItem label="Platform" icon={Layers3}>{details.platform || "Custom"}</DetailItem>
            <DetailItem label="Category" icon={Folder}>{details.category}</DetailItem>
            <DetailItem label="Plan" icon={Bookmark}>{details.plan}</DetailItem>
            <DetailItem label="Expiration" icon={CalendarClock}>{formatExpiry(details, true)}</DetailItem>
            <DetailItem label="Added" icon={Clock3}>{formatTimestamp(details.created_at)}</DetailItem>
          </dl>
        </aside>
      </div>
    </div>
  );
}

function PrimaryDetail({ label, children }) {
  return (
    <div className="account-primary-detail">
      <p>{label}</p>
      <div>
        {children}
      </div>
    </div>
  );
}

function DetailItem({ label, children, icon: Icon }) {
  return (
    <div className="account-detail-item">
      <dt><Icon aria-hidden="true" />{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function CopyButton({ value, label, compact = false, showText = false }) {
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
      className={`${showText ? "flex gap-2 px-4" : "grid"} shrink-0 place-items-center disabled:cursor-not-allowed disabled:opacity-40 ${copied ? "text-emerald-300" : "text-slate-400 hover:text-cyan-300"} ${compact ? "inline-copy-button size-7 rounded-md hover:bg-white/5" : showText ? "h-10 rounded-xl border border-white/10" : "size-9 rounded-lg border border-white/10 hover:border-cyan-300/30"}`}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
    >
      <span key={copied ? "copied" : "copy"} className="copy-feedback-icon">{copied ? <Check className={compact ? "size-3.5" : "size-4"} /> : <Copy className={compact ? "size-3.5" : "size-4"} />}</span>
      {showText && <span>{copied ? "Copied" : "Copy"}</span>}
    </button>
  );
}

function StatusItem({ icon: Icon, tone, text }) {
  return (
    <p className="flex items-center gap-3 text-sm text-slate-400">
      <Icon className={`size-5 shrink-0 ${tone}`} />
      {text}
    </p>
  );
}

function EmailActivityChart() {
  const [range, setRange] = useState("7");
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const hasActivity = series.some((day) => day.received || day.generated);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    apiFetch(`/activity/email-stats?days=${range}`)
      .then(async (response) => {
        const result = await response.json();
        if (response.status === 404) {
          if (active) setSeries(createEmptyEmailSeries(Number(range)));
          return;
        }
        if (!response.ok) throw new Error(result.error || "Unable to load email activity");
        if (active) setSeries(result.data || []);
      })
      .catch((caught) => {
        if (active) {
          setSeries([]);
          setError(caught.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [range]);

  return (
    <article className="overview-panel overflow-hidden p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Email activity</h2>
          <p className="mt-1 text-xs text-slate-400">Generated addresses and received emails</p>
        </div>
        <SelectField
          name="email-activity-range"
          value={range}
          onChange={(event) => setRange(event.target.value)}
          options={emailActivityRanges}
          ariaLabel="Email activity date range"
          className="min-h-10 min-w-36 bg-white/[0.025] py-2 text-xs"
        />
      </div>
      <div className="mt-5 flex gap-5 text-xs text-slate-400">
        <span className="flex items-center gap-2"><i className="size-2 rounded-full bg-cyan-300" />Received</span>
        <span className="flex items-center gap-2"><i className="size-2 rounded-full bg-violet-400" />Generated</span>
      </div>
      <div className="mt-3 h-44 sm:h-48" aria-live="polite">
        {loading && <div className="grid h-full place-items-center text-xs text-slate-500">Loading email activity...</div>}
        {!loading && error && <div className="grid h-full place-items-center px-4 text-center text-xs text-red-300">{error}</div>}
        {!loading && !error && (
          <div className="relative h-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="received-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3c5" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#22d3c5" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="generated-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="day" tickFormatter={(value) => formatChartDate(value, Number(range))} tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} domain={[0, "dataMax + 1"]} tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} width={34} />
                <Tooltip content={<EmailChartTooltip />} cursor={{ stroke: "rgba(103,232,249,0.22)", strokeDasharray: "4 4" }} />
                <Area type="monotone" dataKey="received" name="Received" stroke="#22d3c5" strokeWidth={2} fill="url(#received-area)" activeDot={{ r: 4, fill: "#22d3c5", stroke: "#042129", strokeWidth: 2 }} />
                <Area type="monotone" dataKey="generated" name="Generated" stroke="#8b5cf6" strokeWidth={2} fill="url(#generated-area)" activeDot={{ r: 4, fill: "#8b5cf6", stroke: "#17102c", strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
            {!hasActivity && <p className="pointer-events-none absolute inset-0 grid place-items-center pt-5 text-xs text-slate-500">No email activity in this period</p>}
          </div>
        )}
      </div>
    </article>
  );
}

function createEmptyEmailSeries(days) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const bucketCount = days === 1 ? 24 : days;

  return Array.from({ length: bucketCount }, (_, index) => {
    const date = new Date(today);
    if (days === 1) date.setUTCHours(index);
    else date.setUTCDate(date.getUTCDate() - (days - 1 - index));
    return {
      day: days === 1
        ? `${date.toISOString().slice(0, 13)}:00:00Z`
        : date.toISOString().slice(0, 10),
      received: 0,
      generated: 0,
    };
  });
}

function EmailChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-[#071219]/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="mb-2 text-[0.7rem] font-medium text-slate-300">{formatFullChartDate(label)}</p>
      {payload.map((item) => <p key={item.dataKey} className="mt-1 flex min-w-32 items-center justify-between gap-5 text-[0.7rem]"><span style={{ color: item.color }}>{item.name}</span><strong className="text-white">{item.value}</strong></p>)}
    </div>
  );
}

function formatChartDate(value, days) {
  const date = new Date(days === 1 ? value : `${value}T00:00:00Z`);
  if (days === 1) return date.toLocaleTimeString(undefined, { hour: "numeric" });
  if (days <= 7) return date.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatFullChartDate(value) {
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00Z`);
  return date.toLocaleString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    ...(value.includes("T") ? { hour: "numeric" } : { timeZone: "UTC" }),
  });
}

function parseActivityTimestamp(value) {
  return new Date(`${value}${value?.endsWith("Z") ? "" : "Z"}`);
}

function RecentActivity({ activity, onViewAll }) {
  const recentItems = activity.slice(0, 5);

  return (
    <article className="dashboard-recent-activity overview-panel flex min-h-[300px] flex-col p-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="overview-heading">Activity log</h2>
        <button type="button" onClick={onViewAll} className="dashboard-overview-link hidden items-center gap-1.5 text-xs text-cyan-300">View all <ChevronRight className="size-4" /></button>
      </div>
      <div className="mt-3 flex-1 divide-y divide-white/[0.055]">
        {recentItems.map((item) => {
          const detail = item.metadata?.fullAddress || item.metadata?.email || item.metadata?.platform || item.event_type;
          return (
            <div key={item.id} className="flex items-center gap-3 py-3 first:pt-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-cyan-300/[0.065] text-cyan-300">
                {item.event_type?.startsWith("email.") ? <Mail className="size-4" /> : item.event_type?.startsWith("auth.") ? <ShieldCheck className="size-4" /> : <Activity className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-100">{item.description}</p>
                <p className="mt-1 truncate text-[0.7rem] text-slate-500">{detail}</p>
              </div>
              <time className="shrink-0 text-[0.65rem] text-slate-500">{formatRelativeTime(item.created_at)}</time>
            </div>
          );
        })}
        {!recentItems.length && <p className="py-8 text-center text-xs text-slate-500">No activity recorded yet.</p>}
      </div>
      <button type="button" onClick={onViewAll} className="mt-3 flex h-10 items-center justify-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] text-xs text-slate-300 transition hover:border-cyan-300/20 hover:text-cyan-300">
        View full activity log <ArrowRight className="size-4" />
      </button>
    </article>
  );
}

function QuickAccess({ onNavigate, onAddAccount }) {
  const actions = [
    { label: "Add account", detail: "Save new account", icon: Plus, tone: "text-emerald-300 bg-emerald-300/[0.08]", onClick: onAddAccount },
    { label: "Generate email", detail: "Create new email", icon: Mail, tone: "text-violet-300 bg-violet-300/[0.08]", onClick: () => onNavigate("email-generator") },
    { label: "Open AI chat", detail: "Start conversation", icon: MessageSquareText, tone: "text-cyan-300 bg-cyan-300/[0.08]", onClick: () => onNavigate("chat-ai") },
    { label: "Create note", detail: "Write something", icon: FileText, tone: "text-amber-300 bg-amber-300/[0.08]", onClick: () => onNavigate("notes") },
    { label: "Run backup", detail: "Backup vault now", icon: CloudUpload, tone: "text-sky-300 bg-sky-300/[0.08]", onClick: () => onNavigate("backup") },
  ];

  return (
    <section className="dashboard-quick-access overview-panel mt-5 p-4 sm:p-5">
      <h2 className="overview-heading">Quick access</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {actions.map(({ label, detail, icon: Icon, tone, onClick }) => (
          <button key={label} type="button" onClick={onClick} className="group flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.065] bg-white/[0.02] p-3 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/15 hover:bg-cyan-300/[0.025]">
            <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${tone}`}><Icon className="size-[18px]" /></span>
            <span className="min-w-0"><strong className="block truncate text-xs font-medium text-slate-100 group-hover:text-white">{label}</strong><small className="mt-1 block truncate text-[0.68rem] text-slate-500">{detail}</small></span>
          </button>
        ))}
      </div>
    </section>
  );
}

function formatRelativeTime(value) {
  const date = parseActivityTimestamp(value);
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (Number.isNaN(seconds)) return "Recently";
  if (seconds < 60) return "Now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
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
    <section className="dashboard-metrics-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ label, value, detail, icon: Icon, tone }) => (
        <article
          key={label}
          className={`metric-card metric-card-${tone} rounded-xl border border-white/[0.09] p-5`}
        >
          <div className="flex justify-between">
            <div>
              <p className={`metric-label-${tone} text-xs font-medium`}>{label}</p>
              <strong className="mt-2 block text-2xl tracking-[-0.03em]">{value}</strong>
            </div>
            <span
              className={`grid size-10 place-items-center rounded-xl ${metricToneStyles[tone]}`}
            >
              <Icon className="size-5" />
            </span>
          </div>
          <p className="mt-5 text-xs text-slate-400">{detail}</p>
        </article>
      ))}
    </section>
  );
}

function ExpiringSummary({ accounts }) {
  const expiringCount = accounts.filter(
    (account) => getEffectiveStatus(account) === "Expiring Soon",
  ).length;

  return (
    <article className="expiring-summary overview-panel relative overflow-hidden p-5">
      <CalendarClock className="absolute -bottom-1 right-4 size-20 text-white/[0.08]" aria-hidden="true" />
      <p className="relative text-sm font-semibold text-orange-300">Expiring soon</p>
      <strong className="relative mt-2 block text-3xl tracking-[-0.04em] text-white">{expiringCount}</strong>
      <p className="relative mt-2 text-xs text-slate-400">Within the next 5 days</p>
    </article>
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
    <section className="dashboard-email-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ label, value, detail, icon: Icon, tone }) => (
        <article
          key={label}
          className="email-metric-card rounded-xl border border-white/[0.075] bg-white/[0.018] p-4"
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
          <p className="mt-4 text-xs text-slate-500">{detail}</p>
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

function findMatchingAuthenticator(account, entries) {
  const email = normalizeAuthenticatorIdentity(account.email);
  const username = normalizeAuthenticatorIdentity(account.username);
  if (email) {
    const emailMatch = entries.find((entry) => normalizeAuthenticatorIdentity(entry.accountName) === email);
    if (emailMatch) return emailMatch;
  }
  if (!username) return null;

  return entries.find((entry) => (
    normalizeAuthenticatorIdentity(entry.accountName) === username
    && serviceFamily(entry.issuer) === serviceFamily(account.platform || account.label)
  )) || null;
}

function normalizeAuthenticatorIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

function serviceFamily(value) {
  const normalized = String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["chatgpt", "openai"].includes(normalized)) return "openai";
  if (["google", "gmail", "youtube", "gemini"].includes(normalized)) return "google";
  if (["microsoft", "outlook", "office", "azure"].includes(normalized)) return "microsoft";
  if (["twitter", "x", "xcom"].includes(normalized)) return "x";
  return normalized;
}

function makeAuthenticatorCode(entry, now) {
  try {
    return new OTPAuth.TOTP({
      issuer: entry.issuer,
      label: entry.accountName,
      algorithm: entry.algorithm,
      digits: entry.digits,
      period: entry.period,
      secret: entry.secret,
    }).generate({ timestamp: now });
  } catch {
    return "";
  }
}

function VerificationCode({ entry, now, compact = false, emptyLabel = "—" }) {
  if (!entry) return <span className="verification-code-empty text-xs text-slate-600" title="No matching authenticator account">{emptyLabel}</span>;
  const code = makeAuthenticatorCode(entry, now);
  if (!code) return <span className="verification-code-empty text-xs text-slate-600">{emptyLabel}</span>;

  return (
    <span className={`verification-code flex items-center gap-1.5 ${compact ? "mt-3" : ""}`} title={`Matched to ${entry.issuer}`}>
      <span className="font-mono text-xs font-semibold tracking-[0.14em] text-cyan-200">{code.replace(/(.{3})/, "$1 ")}</span>
      <CopyButton value={code} label="Copy verification code" compact />
    </span>
  );
}

function AccountsTable({ accounts, loading, authenticatorByAccount, authenticatorNow, onDelete, onView, emptyMessage }) {
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
          <article key={account.id} className="account-mobile-card p-4">
            <div className="flex min-w-0 items-start gap-3">
              <AccountAvatar account={account} />
              <div className="min-w-0 flex-1">
                <div className="account-mobile-head flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="account-mobile-title truncate text-sm font-medium">{account.label}</h3>
                      <span className={`account-mobile-status ${getEffectiveStatus(account) === "Active" ? "is-active" : ""}`}>
                        <i className={getStatusDotTone(getEffectiveStatus(account))} /> {getEffectiveStatus(account)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                      <span className="account-mobile-email min-w-0 truncate" title={account.email || account.username || "No identity"}>
                        {account.email || account.username || "No identity"}
                      </span>
                      <CopyButton
                        value={account.email || account.username || ""}
                        label="Copy identity"
                        compact
                      />
                    </div>
                  </div>
                  <span className="account-mobile-expiry"><Zap /> {formatExpiry(account, true)}</span>
                </div>
                <div className="account-mobile-code">
                  {authenticatorByAccount.get(account.id)
                    ? <VerificationCode entry={authenticatorByAccount.get(account.id)} now={authenticatorNow} compact />
                    : <span>No verification code</span>}
                </div>
                <div className="account-mobile-actions">
                  <CopyButton value={account.email || account.username || ""} label="Copy identity" showText />
                  <button type="button" onClick={() => onView(account)}><Eye /> View</button>
                  <button type="button" className="is-delete" onClick={() => onDelete(account)}><Trash2 /> Delete</button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto xl:block">
        <table className="w-full min-w-[1020px] text-left">
          <thead>
            <tr className="border-b border-white/8 text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-5 py-4">Account</th>
              <th className="px-5 py-4">Email</th>
              <th className="px-5 py-4">Plan</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4">Expires</th>
              <th className="px-5 py-4">Verification code</th>
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
                <td className="px-5"><VerificationCode entry={authenticatorByAccount.get(account.id)} now={authenticatorNow} /></td>
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
    <footer className="account-pagination flex flex-col items-center justify-between gap-3 border-t border-white/[0.07] p-4 sm:flex-row sm:px-5">
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

function compareAccounts(first, second, sortBy) {
  if (sortBy === "name") {
    return String(first.label || first.platform || "").localeCompare(String(second.label || second.platform || ""));
  }
  if (sortBy === "expiry") {
    const firstExpiry = first.expires_at ? new Date(first.expires_at).getTime() : Number.POSITIVE_INFINITY;
    const secondExpiry = second.expires_at ? new Date(second.expires_at).getTime() : Number.POSITIVE_INFINITY;
    return firstExpiry - secondExpiry;
  }

  const firstCreated = new Date(first.created_at || 0).getTime();
  const secondCreated = new Date(second.created_at || 0).getTime();
  return sortBy === "oldest" ? firstCreated - secondCreated : secondCreated - firstCreated;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { apiFetch, clearDevelopmentToken } from "./api";
import {
  AccountModal,
  AccountsView,
  DashboardOverview,
} from "./dashboard/AccountsViews";
import ActivityView from "./dashboard/ActivityView";
import BackupView from "./dashboard/BackupView";
import { DashboardHeader, Sidebar } from "./dashboard/DashboardChrome";
import { Modal } from "./dashboard/DashboardUi";
import SettingsView from "./dashboard/SettingsView";

const notificationStorageKey = "vault_notifications_read_at";
const themeStorageKey = "vault_theme";

function Dashboard() {
  const [activePage, setActivePage] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [activity, setActivity] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiHealthy, setApiHealthy] = useState(true);
  const [notificationsReadAt, setNotificationsReadAt] = useState(
    () => localStorage.getItem(notificationStorageKey) || "",
  );
  const [theme, setTheme] = useState(
    () => localStorage.getItem(themeStorageKey) || "midnight",
  );

  async function loadData() {
    setLoading(true);

    try {
      const [accountResponse, activityResponse, userResponse, healthResponse] =
        await Promise.all([
          apiFetch("/accounts"),
          apiFetch("/activity"),
          apiFetch("/auth/me"),
          apiFetch("/health").catch(() => null),
        ]);

      setApiHealthy(Boolean(healthResponse?.ok));

      const protectedResponses = [
        accountResponse,
        activityResponse,
        userResponse,
      ];
      if (protectedResponses.some((response) => response.status === 401)) {
        window.location.replace("/");
        return;
      }

      const [accountData, activityData, userData] = await Promise.all([
        accountResponse.json(),
        activityResponse.json(),
        userResponse.json(),
      ]);
      setAccounts(accountData.data || []);
      setActivity(activityData.data || []);
      setUser(userData.data || null);
    } catch {
      setApiHealthy(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function refreshActivity() {
    try {
      const response = await apiFetch("/activity");
      if (!response.ok) return;
      const data = await response.json();
      setActivity(data.data || []);
    } catch {
      setApiHealthy(false);
    }
  }

  async function removeAccount() {
    if (!accountToDelete) return;
    setDeletingAccount(true);

    try {
      const response = await apiFetch(`/accounts/${accountToDelete.id}`, {
        method: "DELETE",
      });
      if (!response.ok) return;

      setAccounts((current) =>
        current.filter((item) => item.id !== accountToDelete.id),
      );
      setAccountToDelete(null);

      await refreshActivity();
    } finally {
      setDeletingAccount(false);
    }
  }

  async function logout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } finally {
      clearDevelopmentToken();
      window.location.assign("/");
    }
  }

  function changeTheme(value) {
    setTheme(value);
    localStorage.setItem(themeStorageKey, value);
  }

  function openNotifications() {
    const now = new Date().toISOString();
    setNotificationsReadAt(now);
    localStorage.setItem(notificationStorageKey, now);
    setActivePage("activity");
  }

  function handleAccountCreated(account) {
    setAccounts((current) => [
      account,
      ...current.filter((item) => item.id !== account.id),
    ]);
    refreshActivity();
  }

  function handleAccountUpdated(account) {
    setAccounts((current) =>
      current.map((item) => (item.id === account.id ? account : item)),
    );
    refreshActivity();
  }

  const unreadActivity = activity.filter(
    (item) =>
      !notificationsReadAt ||
      new Date(`${item.created_at}Z`) > new Date(notificationsReadAt),
  );
  const notificationLevel = getNotificationLevel(apiHealthy, unreadActivity);

  function renderActivePage() {
    switch (activePage) {
      case "accounts":
        return (
          <AccountsView
            accounts={accounts}
            loading={loading}
            onAddAccount={() => setAccountModalOpen(true)}
            onDelete={setAccountToDelete}
            onAccountUpdated={handleAccountUpdated}
          />
        );
      case "activity":
        return <ActivityView activity={activity} loading={loading} />;
      case "backup":
        return <BackupView accounts={accounts} />;
      case "settings":
        return (
          <SettingsView
            user={user}
            onUserChange={setUser}
            theme={theme}
            onThemeChange={changeTheme}
          />
        );
      default:
        return (
          <DashboardOverview
            accounts={accounts}
            activity={activity}
            apiHealthy={apiHealthy}
            user={user}
          />
        );
    }
  }

  return (
    <main
      className={`dashboard-shell theme-${theme} min-h-screen text-slate-100`}
    >
      <Sidebar
        activePage={activePage}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNavigate={setActivePage}
        onLogout={() => setLogoutOpen(true)}
      />
      <div className="lg:pl-[256px]">
        <DashboardHeader
          user={user}
          notificationLevel={notificationLevel}
          onMenuOpen={() => setMenuOpen(true)}
          onNotifications={openNotifications}
          onNavigate={setActivePage}
          onLogout={() => setLogoutOpen(true)}
        />
        <div className="mx-auto max-w-[1360px] px-4 py-7 sm:px-7 lg:py-9">
          {renderActivePage()}
        </div>
      </div>

      {accountModalOpen && (
        <AccountModal
          onClose={() => setAccountModalOpen(false)}
          onCreated={handleAccountCreated}
        />
      )}
      {accountToDelete && (
        <Modal
          title="Delete secured account?"
          onClose={() => !deletingAccount && setAccountToDelete(null)}
        >
          <div className="mt-5 flex gap-4 rounded-xl border border-red-400/15 bg-red-400/[0.05] p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-red-400/10 text-red-300">
              <Trash2 className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="font-medium text-white">{accountToDelete.label}</p>
              <p className="mt-1 break-all text-sm text-slate-400">
                {accountToDelete.email}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            This permanently removes the encrypted credentials. This action
            cannot be undone.
          </p>
          <div className="mt-7 grid grid-cols-2 gap-3 sm:flex sm:justify-end">
            <button
              type="button"
              disabled={deletingAccount}
              onClick={() => setAccountToDelete(null)}
              className="h-11 rounded-lg border border-white/10 px-4 text-sm text-slate-300"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deletingAccount}
              onClick={removeAccount}
              className="flex h-11 items-center justify-center gap-2 rounded-lg bg-red-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Trash2 className="size-4" />
              {deletingAccount ? "Deleting..." : "Delete account"}
            </button>
          </div>
        </Modal>
      )}
      {logoutOpen && (
        <Modal
          title="Sign out of Vault?"
          onClose={() => setLogoutOpen(false)}
        >
          <p className="mt-4 text-sm text-slate-400">
            Your secure session will be revoked immediately.
          </p>
          <div className="mt-7 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setLogoutOpen(false)}
              className="h-10 rounded-lg border border-white/10 px-4 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={logout}
              className="h-10 rounded-lg bg-red-500 px-4 text-sm font-semibold"
            >
              Sign out
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}

function getNotificationLevel(apiHealthy, unreadActivity) {
  if (!apiHealthy || unreadActivity.some((item) => item.severity === "error")) {
    return "critical";
  }

  return unreadActivity.length ? "new" : "none";
}

export default Dashboard;

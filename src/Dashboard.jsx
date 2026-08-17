import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { apiFetch, clearDevelopmentToken } from "./api";
import {
  AccountModal,
  AccountsView,
  DashboardOverview,
} from "./dashboard/AccountsViews";
import ActivityView from "./dashboard/ActivityView";
import AuthenticatorView from "./dashboard/AuthenticatorView";
import BackupView from "./dashboard/BackupView";
import { DashboardHeader } from "./dashboard/DashboardChrome";
import DesktopSidebar from "./dashboard/desktop/DesktopSidebar";
import MobileDrawer from "./dashboard/mobile/MobileDrawer";
import MobileNavigation from "./dashboard/mobile/MobileNavigation";
import { Modal } from "./dashboard/DashboardUi";
import EmailGeneratorView from "./dashboard/EmailGeneratorView";
import FloatingAiChat from "./dashboard/FloatingAiChat";
import NotesView from "./dashboard/NotesView";
import PluginsView from "./dashboard/PluginsView";
import SettingsView from "./dashboard/SettingsView";
import VaultView from "./dashboard/VaultView";
import {
  getDashboardPageFromPath,
  getDashboardPagePath,
  pageDetails,
} from "./dashboard/shared/navigation";

const notificationStorageKey = "vault_notifications_read_at";
const themeStorageKey = "vault_theme";
const dashboardThemes = new Set(["dark", "gray", "midnight"]);
function Dashboard() {
  const [activePage, setActivePage] = useState(() =>
    getDashboardPageFromPath(window.location.pathname),
  );
  const [pageInteractionContext, setPageInteractionContext] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [emailAddresses, setEmailAddresses] = useState([]);
  const [activity, setActivity] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiHealthy, setApiHealthy] = useState(true);
  const [notificationsReadAt, setNotificationsReadAt] = useState(
    () => localStorage.getItem(notificationStorageKey) || "",
  );
  const [theme, setTheme] = useState(
    () => {
      const savedTheme = localStorage.getItem(themeStorageKey);
      return dashboardThemes.has(savedTheme) ? savedTheme : "midnight";
    },
  );

  const navigate = useCallback((page, { replace = false } = {}) => {
    if (!Object.hasOwn(pageDetails, page)) return;
    const nextPath = getDashboardPagePath(page);
    const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
    setPageInteractionContext(null);
    setActivePage(page);
    setMenuOpen(false);
    if (currentPath === nextPath) return;
    window.history[replace ? "replaceState" : "pushState"]({}, "", nextPath);
  }, []);

  async function loadData() {
    setLoading(true);

    try {
      const [
        accountResponse,
        activityResponse,
        userResponse,
        healthResponse,
        emailResponse,
      ] =
        await Promise.all([
          apiFetch("/accounts"),
          apiFetch("/activity"),
          apiFetch("/auth/me"),
          apiFetch("/health").catch(() => null),
          apiFetch("/email/addresses").catch(() => null),
        ]);

      setApiHealthy(Boolean(healthResponse?.ok));

      const protectedResponses = [
        accountResponse,
        activityResponse,
        userResponse,
        emailResponse,
      ].filter(Boolean);
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
      if (emailResponse?.ok) {
        const emailData = await emailResponse.json();
        setEmailAddresses(emailData.data || []);
      }
    } catch {
      setApiHealthy(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const canonicalPath = getDashboardPagePath(activePage);
    const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
    if (currentPath !== canonicalPath) {
      window.history.replaceState({}, "", canonicalPath);
    }
    document.title = `${pageDetails[activePage]?.title || "Dashboard"} | Vault`;
  }, [activePage]);

  useEffect(() => {
    function handlePopState() {
      setPageInteractionContext(null);
      setMenuOpen(false);
      setActivePage(getDashboardPageFromPath(window.location.pathname));
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    function handleAiThemeChange(event) {
      if (!dashboardThemes.has(event.detail?.theme)) return;
      changeTheme(event.detail.theme);
    }
    window.addEventListener("vault:theme", handleAiThemeChange);
    return () => window.removeEventListener("vault:theme", handleAiThemeChange);
  }, []);

  useEffect(() => {
    function handleAiNavigation(event) {
      const pageId = event.detail?.pageId;
      if (!Object.hasOwn(pageDetails, pageId)) return;
      navigate(pageId);
    }
    window.addEventListener("vault:navigate", handleAiNavigation);
    return () => window.removeEventListener("vault:navigate", handleAiNavigation);
  }, [navigate]);

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
    markNotificationsRead();
    navigate("activity");
  }

  function markNotificationsRead() {
    const now = new Date().toISOString();
    setNotificationsReadAt(now);
    localStorage.setItem(notificationStorageKey, now);
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

  const handleEmailAddressesChange = useCallback((addresses) => {
    setEmailAddresses(addresses);
  }, []);

  const handlePageContextChange = useCallback((context) => {
    setPageInteractionContext(context);
  }, []);

  const unreadActivity = activity.filter(
    (item) =>
      !notificationsReadAt ||
      new Date(`${item.created_at}Z`) > new Date(notificationsReadAt),
  );
  const notificationLevel = getNotificationLevel(apiHealthy, unreadActivity);
  const pageContext = {
    pageId: activePage,
    pageTitle: pageDetails[activePage]?.title || "Dashboard",
    accountCount: accounts.length,
    emailAddressCount: emailAddresses.length,
    receivedEmailCount: emailAddresses.reduce(
      (sum, address) => sum + Number(address.messageCount || 0),
      0,
    ),
    unreadEmailCount: emailAddresses.reduce(
      (sum, address) => sum + Number(address.unreadCount || 0),
      0,
    ),
    emailStorageBytes: emailAddresses.reduce(
      (sum, address) => sum + Number(address.storageBytes || 0),
      0,
    ),
    unreadActivityCount: unreadActivity.length,
    activityCount: activity.length,
    apiHealthy,
    interaction: pageInteractionContext,
  };
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
            onContextChange={handlePageContextChange}
          />
        );
      case "vault":
        return <VaultView />;
    case "email-generator":
        return (
          <EmailGeneratorView
            onAddressesChange={handleEmailAddressesChange}
          />
      );

    case "authenticator":
      return <AuthenticatorView />;
      case "chat-ai":
        return null;
      case "notes":
        return <NotesView />;
      case "plugins":
        return <PluginsView />;
      case "activity":
        return (
          <ActivityView
            activity={activity}
            loading={loading}
            notificationsReadAt={notificationsReadAt}
            onMarkAllRead={markNotificationsRead}
            onContextChange={handlePageContextChange}
          />
        );
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
            emailAddresses={emailAddresses}
            onNavigate={navigate}
            onAddAccount={() => setAccountModalOpen(true)}
          />
        );
    }
  }

  return (
    <main
      className={`dashboard-shell theme-${theme} min-h-screen text-slate-100`}
    >
      <DesktopSidebar
        activePage={activePage}
        user={user}
        onNavigate={navigate}
        onLogout={() => setLogoutOpen(true)}
      />
      <MobileDrawer
        activePage={activePage}
        user={user}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNavigate={navigate}
        onLogout={() => setLogoutOpen(true)}
      />
      <div className="dashboard-main lg:pl-[256px]">
        <DashboardHeader
          activePage={activePage}
          user={user}
          notificationLevel={notificationLevel}
          onMenuOpen={() => setMenuOpen(true)}
          onNotifications={openNotifications}
          onNavigate={navigate}
          onLogout={() => setLogoutOpen(true)}
        />
        <div className="dashboard-content mx-auto max-w-[1440px] px-4 py-5 sm:px-7 sm:py-6">
          {activePage !== "chat-ai" && renderActivePage()}
          <FloatingAiChat
            fullPage={activePage === "chat-ai"}
            pageContext={pageContext}
          />
        </div>
      </div>
      <MobileNavigation
        activePage={activePage}
        onNavigate={navigate}
        onMore={() => setMenuOpen(true)}
      />

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
          className="account-delete-modal account-modal-sheet"
        >
          <div className="account-delete-summary mt-5 flex gap-4 rounded-xl border border-red-400/15 bg-red-400/[0.05] p-4">
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
          <p className="account-delete-message mt-4 text-sm leading-relaxed text-slate-400">
            This permanently removes the encrypted credentials. This action
            cannot be undone.
          </p>
          <div className="account-delete-actions mt-7 grid grid-cols-2 gap-3 sm:flex sm:justify-end">
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

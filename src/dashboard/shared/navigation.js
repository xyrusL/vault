import {
  Blocks,
  CircleGauge,
  CloudDownload,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  MessageSquareText,
  Settings,
  ShieldCheck,
  StickyNote,
  Users,
} from "lucide-react";

export const navigationItems = [
  { id: "dashboard", label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, group: "Main" },
  { id: "vault", label: "Vault", path: "/dashboard/vault", icon: LockKeyhole, group: "Main" },
  { id: "accounts", label: "Accounts", path: "/dashboard/accounts", icon: Users, group: "Main" },
  { id: "authenticator", label: "Auth 2FA", path: "/dashboard/authenticator", icon: ShieldCheck, group: "Main" },
  { id: "email-generator", label: "Email Generator", path: "/dashboard/email-generator", icon: Mail, group: "Tools" },
  { id: "chat-ai", label: "AI Chat", path: "/dashboard/chat-ai", icon: MessageSquareText, group: "Tools" },
  { id: "notes", label: "Notes", path: "/dashboard/notes", icon: StickyNote, group: "Tools" },
  { id: "plugins", label: "Plugins", path: "/dashboard/plugins", icon: Blocks, group: "Tools" },
  { id: "activity", label: "Activity Log", path: "/dashboard/activity", icon: CircleGauge, group: "Tools" },
  { id: "backup", label: "Backup", path: "/dashboard/backup", icon: CloudDownload, group: "Tools" },
  { id: "settings", label: "Settings", path: "/dashboard/settings", icon: Settings, group: "Settings" },
];

export const navigationGroups = ["Main", "Tools", "Settings"];

export const mobileNavigationItems = navigationItems.filter(({ id }) =>
  ["dashboard", "vault", "accounts", "authenticator"].includes(id),
);

export const pageDetails = Object.fromEntries(
  navigationItems.map(({ id, label }) => [id, {
    title: label,
    eyebrow: id === "plugins" ? "Connected workspace" : id === "settings" ? "Personal controls" : "",
    text: id === "dashboard"
      ? "Overview of your vault and system activity"
      : id === "vault"
        ? "Store encrypted secrets and control when AI can access them."
        : id === "notes"
          ? "Capture ideas, reminders, and details in your encrypted vault."
          : id === "plugins"
            ? "Configure Spotify, Facebook, Discord, and Google Workspace for secure AI discovery."
            : id === "settings"
              ? "Manage your identity, password, two-factor authentication, and appearance."
              : `Manage your ${label.toLowerCase()} securely`,
  }]),
);

export function getDashboardPagePath(pageId) {
  return navigationItems.find(({ id }) => id === pageId)?.path || "/dashboard";
}

export function getDashboardPageFromPath(pathname) {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  return navigationItems.find(({ path }) => path === normalizedPath)?.id || "dashboard";
}

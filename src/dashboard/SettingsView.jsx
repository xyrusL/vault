import { useEffect, useState } from "react";
import { Eye, EyeOff, LoaderCircle, ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { apiFetch } from "../api";
import { Field, Modal } from "./DashboardUi";

const themes = ["dark", "gray", "midnight"];
const emptyPasswords = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};
const emptyDisableForm = { currentPassword: "", code: "" };

function getErrorMessage(result, fallback) {
  return result?.error || fallback;
}

function formatSecret(secret) {
  return secret.match(/.{1,4}/g)?.join(" ") || secret;
}

export default function SettingsView({
  user,
  onUserChange,
  theme,
  onThemeChange,
}) {
  const [profile, setProfile] = useState({
    email: user?.email || "",
    displayName: user?.displayName || "",
  });
  const [passwords, setPasswords] = useState(emptyPasswords);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [message, setMessage] = useState("");
  const [twoFactor, setTwoFactor] = useState({
    enabled: false,
    confirmedAt: null,
  });
  const [twoFactorLoading, setTwoFactorLoading] = useState(true);
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState("");
  const [twoFactorMessage, setTwoFactorMessage] = useState("");
  const [setup, setSetup] = useState(null);
  const [setupCode, setSetupCode] = useState("");
  const [setupError, setSetupError] = useState("");
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableForm, setDisableForm] = useState(emptyDisableForm);
  const [disableError, setDisableError] = useState("");

  useEffect(() => {
    if (!user) return;

    setProfile({
      email: user.email || "",
      displayName: user.displayName || "",
    });
  }, [user]);

  useEffect(() => {
    let active = true;

    apiFetch("/settings/2fa")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            getErrorMessage(result, "Unable to load two-factor settings."),
          );
        }
        if (active) setTwoFactor(result.data);
      })
      .catch((error) => {
        if (active) setTwoFactorError(error.message);
      })
      .finally(() => {
        if (active) setTwoFactorLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function updateProfile(event) {
    setProfile((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  function updatePassword(event) {
    setPasswords((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  function togglePassword(name) {
    setVisiblePasswords((current) => ({
      ...current,
      [name]: !current[name],
    }));
  }

  async function saveProfile(event) {
    event.preventDefault();
    setMessage("");

    try {
      const response = await apiFetch("/settings/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      });
      const result = await response.json();
      setMessage(response.ok ? "Profile updated." : result.error);
      if (response.ok) onUserChange(result.data);
    } catch {
      setMessage("Unable to update the profile.");
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setMessage("");

    if (passwords.newPassword !== passwords.confirmPassword) {
      setMessage("New passwords do not match.");
      return;
    }

    try {
      const response = await apiFetch("/settings/password", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword,
        }),
      });
      const result = await response.json();
      setMessage(response.ok ? "Password updated securely." : result.error);
      if (response.ok) {
        setPasswords(emptyPasswords);
        setVisiblePasswords({});
      }
    } catch {
      setMessage("Unable to update the password.");
    }
  }

  function closeSetup() {
    setSetup(null);
    setSetupCode("");
    setSetupError("");
  }

  function closeDisable() {
    setDisableOpen(false);
    setDisableForm(emptyDisableForm);
    setDisableError("");
  }

  async function startTwoFactorSetup() {
    setTwoFactorBusy(true);
    setTwoFactorError("");
    setTwoFactorMessage("");

    try {
      const response = await apiFetch("/settings/2fa/setup", {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          getErrorMessage(result, "Unable to start two-factor setup."),
        );
      }
      setSetup(result.data);
    } catch (error) {
      setTwoFactorError(error.message);
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function confirmTwoFactor(event) {
    event.preventDefault();
    setTwoFactorBusy(true);
    setSetupError("");

    try {
      const response = await apiFetch("/settings/2fa/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: setupCode }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          getErrorMessage(result, "Unable to confirm two-factor setup."),
        );
      }
      setTwoFactor(result.data);
      closeSetup();
      setTwoFactorMessage("Two-factor authentication is now enabled.");
    } catch (error) {
      setSetupError(error.message);
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function disableTwoFactor(event) {
    event.preventDefault();
    setTwoFactorBusy(true);
    setDisableError("");

    try {
      const response = await apiFetch("/settings/2fa", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(disableForm),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          getErrorMessage(result, "Unable to disable two-factor authentication."),
        );
      }
      setTwoFactor(result.data);
      closeDisable();
      setTwoFactorMessage("Two-factor authentication has been disabled.");
    } catch (error) {
      setDisableError(error.message);
    } finally {
      setTwoFactorBusy(false);
    }
  }

  function updateNumericCode(setValue) {
    return (event) => setValue(event.target.value.replace(/\D/g, "").slice(0, 6));
  }

  return (
    <section>
      <div className="grid gap-5 xl:grid-cols-2">
        <form onSubmit={saveProfile} className="panel space-y-4">
          <h2 className="text-lg font-semibold">Account profile</h2>
          <Field
            label="Display name"
            name="displayName"
            value={profile.displayName}
            onChange={updateProfile}
            autoComplete="name"
            required
          />
          <Field
            label="Login email"
            name="email"
            type="email"
            value={profile.email}
            onChange={updateProfile}
            autoComplete="email"
            required
          />
          <button className="h-10 rounded-lg bg-cyan-500 px-4 text-sm font-semibold text-[#021012]">
            Save profile
          </button>
        </form>

        <form onSubmit={savePassword} className="panel space-y-4">
          <h2 className="text-lg font-semibold">Change password</h2>
          <PasswordField
            label="Current password"
            name="currentPassword"
            value={passwords.currentPassword}
            onChange={updatePassword}
            visible={visiblePasswords.currentPassword}
            onVisibilityChange={() => togglePassword("currentPassword")}
            autoComplete="current-password"
            placeholder="Enter your current password"
            required
          />
          <PasswordField
            label="New password"
            name="newPassword"
            minLength={8}
            value={passwords.newPassword}
            onChange={updatePassword}
            visible={visiblePasswords.newPassword}
            onVisibilityChange={() => togglePassword("newPassword")}
            autoComplete="new-password"
            placeholder="Minimum 8 characters"
            required
          />
          <PasswordField
            label="Confirm new password"
            name="confirmPassword"
            minLength={8}
            value={passwords.confirmPassword}
            onChange={updatePassword}
            visible={visiblePasswords.confirmPassword}
            onVisibilityChange={() => togglePassword("confirmPassword")}
            autoComplete="new-password"
            placeholder="Repeat the new password"
            required
          />
          <button className="h-10 rounded-lg border border-cyan-300/30 px-4 text-sm text-cyan-300">
            Update password
          </button>
        </form>

        <div className="panel xl:col-span-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-cyan-300" aria-hidden="true" />
                <h2 className="text-lg font-semibold">Two-factor authentication</h2>
              </div>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                Add a rotating authenticator code after your password when you sign in.
                Compatible with Google Authenticator, Microsoft Authenticator, Authy,
                1Password, and other TOTP authenticator apps.
              </p>
            </div>
            {!twoFactorLoading && !twoFactorError && (
              <div className="flex shrink-0 items-center gap-3">
                <span
                  className={`inline-flex h-10 min-w-24 items-center justify-center rounded-lg border px-4 text-xs font-semibold ${twoFactor.enabled ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-300" : "border-white/10 text-slate-400"}`}
                >
                  {twoFactor.enabled ? "Enabled" : "Disabled"}
                </span>
                <button
                  type="button"
                  onClick={
                    twoFactor.enabled
                      ? () => {
                          setTwoFactorMessage("");
                          setDisableOpen(true);
                        }
                      : startTwoFactorSetup
                  }
                  disabled={twoFactorBusy}
                  className={`h-10 min-w-24 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 ${twoFactor.enabled ? "border border-red-300/30 text-red-300" : "bg-cyan-500 text-[#021012]"}`}
                >
                  {twoFactorBusy ? "Please wait..." : twoFactor.enabled ? "Disable" : "Enable"}
                </button>
              </div>
            )}
          </div>
          {twoFactorLoading && (
            <p className="mt-4 flex items-center gap-2 text-sm text-slate-400" role="status">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Loading two-factor settings...
            </p>
          )}
          {twoFactorError && (
            <p className="mt-4 rounded-lg bg-red-400/10 px-4 py-3 text-sm text-red-300" role="alert">
              {twoFactorError}
            </p>
          )}
          {twoFactorMessage && (
            <p className="mt-4 rounded-lg bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300" role="status">
              {twoFactorMessage}
            </p>
          )}
        </div>

        <div className="panel xl:col-span-2">
          <h2 className="text-lg font-semibold">Appearance</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {themes.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onThemeChange(item)}
                className={`rounded-lg border px-4 py-2 text-sm capitalize ${theme === item ? "border-cyan-300 bg-cyan-300/10 text-cyan-300" : "border-white/10 text-slate-400"}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>
      {message && <p className="mt-4 text-sm text-cyan-300">{message}</p>}
      {setup && (
        <Modal title="Set up two-factor authentication" onClose={closeSetup} size="wide">
          <form
            onSubmit={confirmTwoFactor}
            className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)] lg:gap-5"
          >
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300 sm:p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-cyan-400/10 text-xs font-semibold text-cyan-300">
                  1
                </span>
                <p className="font-medium text-white">Add your account</p>
              </div>
              <p className="mt-1 text-slate-400">
                Open Google Authenticator, Microsoft Authenticator, Authy, 1Password,
                or any TOTP-compatible app. Choose to add an account, then scan this QR code.
              </p>
              <div className="mt-4 flex justify-center">
                <div className="rounded-xl bg-white p-3">
                  <QRCodeSVG
                    value={setup.uri}
                    size={184}
                    level="M"
                    title="Two-factor authentication setup QR code"
                  />
                </div>
              </div>
              <p className="mt-4 text-xs text-slate-400">
                Cannot scan it? Enter this secret manually in your app:
              </p>
              <code className="mt-2 block break-all rounded-lg bg-black/30 px-3 py-2 text-center text-sm tracking-[0.16em] text-cyan-200">
                {formatSecret(setup.secret)}
              </code>
            </div>
            <div className="flex min-w-0 flex-col rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-cyan-400/10 text-xs font-semibold text-cyan-300">
                  2
                </span>
                <p className="text-sm font-medium text-white">Verify the account</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Enter the current 6-digit code from your authenticator app. Two-factor
                authentication remains disabled until this code is confirmed.
              </p>
              <div className="mt-5">
                <Field
                  label="6-digit authenticator code"
                  name="setupCode"
                  value={setupCode}
                  onChange={updateNumericCode(setSetupCode)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  required
                />
              </div>
              {setupError && (
                <p className="mt-4 rounded-lg bg-red-400/10 px-4 py-3 text-sm text-red-300" role="alert">
                  {setupError}
                </p>
              )}
              <div className="mt-6 grid grid-cols-2 gap-3 lg:mt-auto lg:pt-6">
                <button
                  type="button"
                  onClick={closeSetup}
                  disabled={twoFactorBusy}
                  className="h-11 rounded-lg border border-white/10 px-4 text-sm text-slate-300 transition-colors hover:bg-white/5 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={twoFactorBusy || setupCode.length !== 6}
                  className="h-11 rounded-lg bg-cyan-500 px-4 text-sm font-semibold text-[#021012] transition-colors hover:bg-cyan-400 disabled:opacity-50"
                >
                  {twoFactorBusy ? "Confirming..." : "Confirm and enable"}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}
      {disableOpen && (
        <Modal title="Disable two-factor authentication" onClose={closeDisable}>
          <form onSubmit={disableTwoFactor} className="mt-5 space-y-4">
            <p className="text-sm text-slate-400">
              Confirm this security change with your current password and the current
              6-digit code from your authenticator app.
            </p>
            <Field
              label="Current password"
              name="currentPassword"
              type="password"
              className="password-masked"
              value={disableForm.currentPassword}
              onChange={(event) =>
                setDisableForm((current) => ({
                  ...current,
                  currentPassword: event.target.value,
                }))
              }
              autoComplete="current-password"
              placeholder="Enter your current password"
              required
            />
            <Field
              label="6-digit authenticator code"
              name="code"
              value={disableForm.code}
              onChange={(event) =>
                setDisableForm((current) => ({
                  ...current,
                  code: event.target.value.replace(/\D/g, "").slice(0, 6),
                }))
              }
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              required
            />
            {disableError && (
              <p className="rounded-lg bg-red-400/10 px-4 py-3 text-sm text-red-300" role="alert">
                {disableError}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:flex sm:justify-end">
              <button
                type="button"
                onClick={closeDisable}
                disabled={twoFactorBusy}
                className="h-11 rounded-lg border border-white/10 px-4 text-sm text-slate-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  twoFactorBusy ||
                  !disableForm.currentPassword ||
                  disableForm.code.length !== 6
                }
                className="h-11 rounded-lg border border-red-300/30 px-5 text-sm font-semibold text-red-300 disabled:opacity-50"
              >
                {twoFactorBusy ? "Disabling..." : "Disable 2FA"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

function PasswordField({ label, visible, onVisibilityChange, ...inputProps }) {
  return (
    <label className="block min-w-0">
      <span className="mb-2 block text-xs text-slate-400">{label}</span>
      <span className="relative block">
        <input
          {...inputProps}
          type={visible ? "text" : "password"}
          className={`form-control pr-12 ${visible ? "" : "password-masked"}`}
          spellCheck="false"
          autoCapitalize="none"
        />
        <button
          type="button"
          onClick={onVisibilityChange}
          className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-cyan-300"
          aria-label={
            visible
              ? `Hide ${label.toLowerCase()}`
              : `Show ${label.toLowerCase()}`
          }
          aria-pressed={Boolean(visible)}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </span>
    </label>
  );
}

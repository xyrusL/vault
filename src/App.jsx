import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck } from "lucide-react";
import Dashboard from "./Dashboard";
import { apiFetch, setDevelopmentToken } from "./api";

const benefits = [
  {
    icon: Lock,
    title: "Private & Secure",
    description: "Your data is encrypted\nand stays private.",
  },
  {
    icon: KeyRound,
    title: "Easy Access",
    description: "View your accounts,\nemails, and passwords\nanytime.",
  },
  {
    icon: ShieldCheck,
    title: "For Your Personal Use",
    description: "Designed for your own\npersonal access only.",
  },
];

function App() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(false);
  const [loginMode, setLoginMode] = useState("password");
  const [challengeToken, setChallengeToken] = useState("");
  const [authStatus, setAuthStatus] = useState("checking");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isDashboard =
    window.location.pathname.replace(/\/$/, "") === "/dashboard";

  useEffect(() => {
    let active = true;
    apiFetch("/auth/me")
      .then((response) => {
        if (!active) return;
        if (response.ok) {
          if (!isDashboard) window.location.replace("/dashboard");
          else setAuthStatus("authenticated");
        } else if (isDashboard) {
          window.location.replace("/");
        } else {
          setAuthStatus("anonymous");
        }
      })
      .catch(() => {
        if (!active) return;
        if (isDashboard) window.location.replace("/");
        else setAuthStatus("anonymous");
      });

    return () => {
      active = false;
    };
  }, [isDashboard]);

  function completeLogin(data) {
    setDevelopmentToken(data?.token, data?.expiresAt);
    window.location.assign("/dashboard");
  }

  function getErrorMessage(result, fallback) {
    if (typeof result.error === "string") return result.error;
    return result.error?.message || fallback;
  }

  function switchLoginMode(mode) {
    setLoginMode(mode);
    setCode("");
    setChallengeToken("");
    setError("");
    setPassword("");
    setShowPassword(false);
  }

  function handleCodeChange(event) {
    setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
  }

  async function handlePasswordLogin(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await apiFetch("/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, remember }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(
          getErrorMessage(result, "Unable to sign in. Please try again."),
        );
        return;
      }
      if (result.data?.requiresTwoFactor) {
        if (!result.data.challengeToken) {
          setError("Unable to start two-factor authentication.");
          return;
        }
        setChallengeToken(result.data.challengeToken);
        setCode("");
        setError("");
        setLoginMode("challenge");
        return;
      }
      completeLogin(result.data);
    } catch {
      setError("Unable to reach the secure login service.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTwoFactor(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await apiFetch("/auth/2fa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeToken, code }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(
          getErrorMessage(
            result,
            "Unable to verify the code. Please try again.",
          ),
        );
        return;
      }
      completeLogin(result.data);
    } catch {
      setError("Unable to reach the secure login service.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAuthenticatorLogin(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await apiFetch("/auth/totp-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code, remember }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(
          getErrorMessage(result, "Unable to sign in. Please try again."),
        );
        return;
      }
      completeLogin(result.data);
    } catch {
      setError("Unable to reach the secure login service.");
    } finally {
      setSubmitting(false);
    }
  }

  if (authStatus === "checking") {
    return (
      <main className="vault-shell grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-4 text-sm text-slate-400">
          <span className="auth-spinner size-8 rounded-full border-2 border-cyan-300/20 border-t-cyan-300" />{" "}
          Securing your vault...
        </div>
      </main>
    );
  }

  if (isDashboard && authStatus === "authenticated") {
    return <Dashboard />;
  }

  return (
    <main className="vault-shell">
      <div className="dot-field" aria-hidden="true" />
      <div className="curve-field" aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index} />
        ))}
      </div>

      <div className="vault-content relative z-10 mx-auto grid min-h-screen w-full max-w-[960px] items-center gap-5 px-4 py-4 sm:gap-6 sm:px-5 sm:py-5 lg:grid-cols-[260px_460px] lg:justify-between lg:gap-12 lg:px-8">
        <section
          className="brand-panel mx-auto w-full max-w-[260px] lg:mx-0"
          aria-labelledby="brand-name"
        >
          <div className="text-center lg:mb-6">
            <h1 id="brand-name" className="sr-only">
              Vault
            </h1>
            <img
              src="/vault-logo.svg"
              alt="Vault"
              className="mx-auto h-auto w-[160px] sm:w-[180px]"
            />
            <p className="mx-auto mt-1.5 max-w-[240px] text-sm leading-relaxed text-slate-400">
              Securely store and manage
              <br />
              every important online account
              <br />
              in one private place.
            </p>
          </div>

          <div className="mx-auto hidden w-fit flex-col gap-4 lg:flex lg:mx-0">
            {benefits.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#0b171b] text-[#23d5c7] ring-1 ring-white/[0.03]">
                  <Icon className="size-4 stroke-[1.5]" />
                </div>
                <div>
                  <h2 className="text-sm font-medium text-white">{title}</h2>
                  <p className="mt-0.5 whitespace-pre-line text-xs leading-[1.4] text-slate-400">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="login-panel min-w-0 w-full max-w-[460px] justify-self-center">
          <div className="login-card rounded-2xl border border-slate-500/60 px-4 py-5 sm:px-7 sm:py-6">
            <header className="mb-5 text-center">
              <h2 className="text-[1.4rem] font-bold tracking-[-0.025em] text-white sm:text-[1.5rem]">
                Welcome Back
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Login to access your Vault
              </p>
            </header>

            <form
              onSubmit={
                loginMode === "challenge"
                  ? handleTwoFactor
                  : loginMode === "authenticator"
                    ? handleAuthenticatorLogin
                    : handlePasswordLogin
              }
              className="space-y-4"
            >
              {loginMode !== "challenge" && (
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1.5 block text-xs font-medium text-white"
                  >
                    Email
                  </label>
                  <div className="input-shell flex items-center gap-3 rounded-lg border border-slate-600/60 px-3.5">
                    <Mail
                      className="size-[18px] shrink-0 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      placeholder="Enter your email"
                      className="h-11 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-400"
                    />
                  </div>
                </div>
              )}

              {loginMode === "password" ? (
                <div>
                  <label
                    htmlFor="password"
                    className="mb-1.5 block text-xs font-medium text-white"
                  >
                    Password
                  </label>
                  <div className="input-shell flex items-center gap-3 rounded-lg border border-slate-600/60 px-3.5">
                    <Lock
                      className="size-[18px] shrink-0 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      placeholder="Enter your password"
                      className="h-11 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      className="-mr-3 grid size-11 shrink-0 place-items-center text-slate-400 transition-colors hover:text-[#25d5c7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25d5c7]"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="size-5" />
                      ) : (
                        <Eye className="size-5" />
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="authenticator-code"
                    className="mb-1.5 block text-xs font-medium text-white"
                  >
                    Authenticator code
                  </label>
                  <div className="input-shell flex items-center gap-3 rounded-lg border border-slate-600/60 px-3.5">
                    <ShieldCheck
                      className="size-[18px] shrink-0 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="authenticator-code"
                      name="code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      pattern="[0-9]{6}"
                      value={code}
                      onChange={handleCodeChange}
                      required
                      placeholder="Enter 6-digit code"
                      className="h-11 min-w-0 flex-1 bg-transparent text-sm tracking-[0.2em] text-white outline-none placeholder:tracking-normal placeholder:text-slate-400"
                    />
                  </div>
                  {loginMode === "challenge" && (
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                      This verification challenge expires shortly. Return to
                      login to request a new one.
                    </p>
                  )}
                </div>
              )}

              {loginMode !== "challenge" && (
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[13px]">
                  <label className="flex cursor-pointer items-center gap-2.5 text-slate-400">
                    <input
                      type="checkbox"
                      name="remember"
                      checked={remember}
                      onChange={(event) => setRemember(event.target.checked)}
                      className="peer sr-only"
                    />
                    <span className="check-box grid size-[18px] place-items-center rounded-[4px] border border-slate-500 bg-transparent peer-checked:border-[#25d5c7] peer-checked:bg-[#25d5c7] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#25d5c7]">
                      <svg
                        viewBox="0 0 14 14"
                        className="size-3 stroke-[#061012] stroke-[2.3]"
                        aria-hidden="true"
                      >
                        <path d="m2 7 3 3 7-7" fill="none" />
                      </svg>
                    </span>
                    Remember me
                  </label>
                  {loginMode === "password" && (
                    <a
                      href="mailto:admin@deze.me?subject=Vault password reset"
                      className="text-[#25d5c7] transition-colors hover:text-[#7af8ec]"
                    >
                      Forgot password?
                    </a>
                  )}
                </div>
              )}

              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-400/20 bg-red-400/8 px-4 py-3 text-sm text-red-300"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="primary-button h-11 w-full rounded-lg text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#25d5c7] active:scale-[0.99] disabled:opacity-60"
              >
                {submitting
                  ? loginMode === "challenge"
                    ? "Verifying..."
                    : "Signing in..."
                  : loginMode === "challenge"
                    ? "Verify Code"
                    : loginMode === "authenticator"
                      ? "Sign In with Authenticator"
                      : "Log In"}
              </button>

              {loginMode !== "challenge" && (
                <div
                  className="flex items-center gap-4 text-[11px] text-slate-400"
                  aria-hidden="true"
                >
                  <span className="h-px flex-1 bg-slate-700/60" />
                  OR
                  <span className="h-px flex-1 bg-slate-700/60" />
                </div>
              )}

              <button
                type="button"
                onClick={() =>
                  switchLoginMode(
                    loginMode === "password" ? "authenticator" : "password",
                  )
                }
                disabled={submitting}
                className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-[#15988f] text-sm font-medium text-white transition hover:border-[#25d5c7] hover:bg-[#25d5c7]/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#25d5c7] disabled:opacity-60"
              >
                {loginMode === "challenge" ? (
                  <>Back to login</>
                ) : loginMode === "password" ? (
                  <>
                    <ShieldCheck className="size-[18px]" /> Login with
                    Authenticator
                  </>
                ) : (
                  <>
                    <Lock className="size-[18px]" /> Login with Password
                  </>
                )}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-slate-400">
              Not registered?{" "}
              <a
                href="mailto:admin@deze.me"
                className="text-[#25d5c7] hover:text-[#7af8ec]"
              >
                Contact your admin.
              </a>
            </p>
          </div>

          <p className="mt-3 flex items-center justify-center gap-2 text-[11px] text-slate-500">
            <Lock className="size-4 text-[#25d5c7]" /> Your data is encrypted
            and securely stored.
          </p>
        </section>
      </div>
    </main>
  );
}

export default App;

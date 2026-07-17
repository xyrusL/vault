import { usesDevelopmentToken } from "./apiSession";

const API_URL = import.meta.env.DEV ? "/api" : "https://api.vault.deze.me/v1";
const developmentTokenKey = "vault_dev_session";
const developmentTokensEnabled = usesDevelopmentToken(import.meta.env.MODE);

export function setDevelopmentToken(token, expiresAt) {
  if (!developmentTokensEnabled) {
    clearDevelopmentToken();
    return;
  }

  if (token) {
    localStorage.setItem(
      developmentTokenKey,
      JSON.stringify({ token, expiresAt }),
    );
  }
}

export function clearDevelopmentToken() {
  localStorage.removeItem(developmentTokenKey);
  sessionStorage.removeItem(developmentTokenKey);
}

export function apiFetch(path, options = {}) {
  const token = getDevelopmentToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);

  return fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
}

function getDevelopmentToken() {
  if (!developmentTokensEnabled) {
    clearDevelopmentToken();
    return null;
  }

  const stored = localStorage.getItem(developmentTokenKey);
  if (!stored) return sessionStorage.getItem(developmentTokenKey);

  try {
    const session = JSON.parse(stored);
    if (!session.token || new Date(session.expiresAt) <= new Date()) {
      clearDevelopmentToken();
      return null;
    }
    return session.token;
  } catch {
    clearDevelopmentToken();
    return null;
  }
}

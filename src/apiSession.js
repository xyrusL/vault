export function usesDevelopmentToken(mode) {
  return mode === "local-dev";
}

export function getDevelopmentTokenStorage(remember) {
  return remember ? "local" : "session";
}

export function localizeDevelopmentCookie(cookie) {
  return cookie
    .replace(/;\s*Domain=[^;]+/gi, "")
    .replace(/;\s*Secure(?=;|$)/gi, "");
}

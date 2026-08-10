export function usesDevelopmentToken(mode) {
  return mode === "local-dev";
}

export function localizeDevelopmentCookie(cookie) {
  return cookie
    .replace(/;\s*Domain=[^;]+/gi, "")
    .replace(/;\s*Secure(?=;|$)/gi, "");
}

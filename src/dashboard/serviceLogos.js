const knownServiceDomains = {
  adobe: "adobe.com",
  amazon: "amazon.com",
  anthropic: "anthropic.com",
  apple: "apple.com",
  chatgpt: "openai.com",
  claude: "claude.ai",
  cloudflare: "cloudflare.com",
  deepseek: "deepseek.com",
  discord: "discord.com",
  dropbox: "dropbox.com",
  ebay: "ebay.com",
  facebook: "facebook.com",
  gemini: "google.com",
  github: "github.com",
  gitlab: "gitlab.com",
  google: "google.com",
  grok: "x.ai",
  groq: "groq.com",
  instagram: "instagram.com",
  linkedin: "linkedin.com",
  microsoft: "microsoft.com",
  netflix: "netflix.com",
  notion: "notion.so",
  openai: "openai.com",
  openrouter: "openrouter.ai",
  paypal: "paypal.com",
  perplexity: "perplexity.ai",
  proton: "proton.me",
  reddit: "reddit.com",
  slack: "slack.com",
  spotify: "spotify.com",
  steam: "steampowered.com",
  telegram: "telegram.org",
  tiktok: "tiktok.com",
  twitch: "twitch.tv",
  twitter: "x.com",
  vercel: "vercel.com",
  yahoo: "yahoo.com",
  youtube: "youtube.com",
  zoom: "zoom.us",
};

export function getServiceLogoUrl(loginUrl) {
  if (!loginUrl) return null;
  try {
    return faviconUrl(new URL(loginUrl).hostname);
  } catch {
    return null;
  }
}

export function detectServiceLogoUrl(issuer, accountName = "") {
  const normalized = String(issuer || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const known = Object.entries(knownServiceDomains).find(([name]) => normalized === name || normalized.includes(name));
  if (known) return faviconUrl(known[1]);

  const issuerDomain = String(issuer || "").match(/(?:https?:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i)?.[1];
  if (issuerDomain) return faviconUrl(issuerDomain);

  const accountDomain = String(accountName).match(/@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i)?.[1];
  return accountDomain ? faviconUrl(accountDomain) : null;
}

function faviconUrl(domain) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

/**
 * Centralized env reading + validation.
 * Throws early at boot if a required variable is missing or malformed.
 */

const REQUIRED = [
  "GH_TOKEN",
  "OPENAI_API_KEY",
  "RESEND_API_KEY",
  "RESEND_FROM",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
] as const;

function readString(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function readInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

function readBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return /^(1|true|yes|on)$/i.test(v);
}

function normalizeBasePath(raw: string): string {
  if (!raw) return "";
  let p = raw.trim();
  if (p === "/") return "";
  if (!p.startsWith("/")) p = "/" + p;
  if (p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

function parseRepos(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && /^[^/]+\/[^/]+$/.test(s));
}

export interface AppConfig {
  port: number;
  basePath: string;
  cronSecret: string;
  ghToken: string;
  watchedRepos: string[];
  openaiApiKey: string;
  openaiModel: string;
  resendApiKey: string;
  resendFrom: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  isDev: boolean;
}

export function loadConfig(): AppConfig {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  // In dev we warn but don't crash, so `npm run dev` works before keys are set.
  if (missing.length > 0 && !readBool("ALLOW_MISSING_KEYS", false)) {
    const msg = `Missing required env: ${missing.join(", ")}. ` +
      `Set ALLOW_MISSING_KEYS=1 to boot anyway (services will return errors until filled).`;
    if (readBool("ALLOW_MISSING_KEYS", false)) {
      console.warn("[config] " + msg);
    } else {
      throw new Error(msg);
    }
  }

  const isDev = !readBool("NODE_ENV", false) || readString("NODE_ENV") === "development";

  return {
    port: readInt("PORT", 8787),
    basePath: normalizeBasePath(readString("APP_BASE_PATH")),
    cronSecret: readString("CRON_SECRET"),
    ghToken: readString("GH_TOKEN"),
    watchedRepos: parseRepos(readString("WATCHED_REPOS", "resend/resend-node,supabase/supabase,NangoHQ/nango")),
    openaiApiKey: readString("OPENAI_API_KEY"),
    openaiModel: readString("OPENAI_MODEL", "gpt-4o-mini"),
    resendApiKey: readString("RESEND_API_KEY"),
    resendFrom: readString("RESEND_FROM"),
    supabaseUrl: readString("SUPABASE_URL"),
    supabaseServiceRoleKey: readString("SUPABASE_SERVICE_ROLE_KEY"),
    isDev,
  };
}

export type AppConfigT = AppConfig;

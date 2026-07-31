import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface DbConfig {
  url: string;
  serviceRoleKey: string;
}

/**
 * Create a Supabase client using the service_role key.
 * This key bypasses RLS — only use it server-side, never in the browser.
 */
export function createDbClient(opts: DbConfig): SupabaseClient {
  if (!opts.url) throw new Error("SUPABASE_URL is not set");
  if (!opts.serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(opts.url, opts.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

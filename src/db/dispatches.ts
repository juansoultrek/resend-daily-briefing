import type { SupabaseClient } from "@supabase/supabase-js";

export type DispatchStatus = "sent" | "failed" | "skipped";

export interface Dispatch {
  id: string;
  run_date: string;
  subscriber_id: string;
  repos_included: string[];
  status: DispatchStatus;
  resend_id: string | null;
  error: string | null;
  created_at: string;
}

export interface CreateDispatchInput {
  run_date: string;
  subscriber_id: string;
  repos_included: string[];
  status: DispatchStatus;
  resend_id?: string | null;
  error?: string | null;
}

export class DispatchesRepo {
  constructor(private db: SupabaseClient) {}

  /** Insert a dispatch record. */
  async create(input: CreateDispatchInput): Promise<Dispatch> {
    const { data, error } = await this.db
      .from("dispatches")
      .insert({
        run_date: input.run_date,
        subscriber_id: input.subscriber_id,
        repos_included: input.repos_included,
        status: input.status,
        resend_id: input.resend_id ?? null,
        error: input.error ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(`dispatches.create: ${error.message}`);
    return data as Dispatch;
  }

  /** Check if a dispatch already exists for a subscriber on a given date. */
  async existsForDate(subscriberId: string, runDate: string): Promise<boolean> {
    const { count, error } = await this.db
      .from("dispatches")
      .select("*", { count: "exact", head: true })
      .eq("subscriber_id", subscriberId)
      .eq("run_date", runDate)
      .eq("status", "sent");
    if (error) throw new Error(`dispatches.existsForDate: ${error.message}`);
    return (count ?? 0) > 0;
  }
}

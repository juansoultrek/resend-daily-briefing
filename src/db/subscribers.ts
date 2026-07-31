import type { SupabaseClient } from "@supabase/supabase-js";

export interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  token: string;
  providers: string[];
  confirmed: boolean;
  created_at: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
}

export interface CreateSubscriberInput {
  email: string;
  name?: string | null;
  token: string;
  providers: string[];
}

export interface UpdateProvidersInput {
  email: string;
  providers: string[];
}

export class SubscribersRepo {
  constructor(private db: SupabaseClient) {}

  /** Find an active (non-unsubscribed) subscriber by email. */
  async findByEmail(email: string): Promise<Subscriber | null> {
    const { data, error } = await this.db
      .from("subscribers")
      .select("*")
      .eq("email", email.toLowerCase())
      .is("unsubscribed_at", null)
      .maybeSingle();
    if (error) throw new Error(`subscribers.findByEmail: ${error.message}`);
    return (data as Subscriber | null) ?? null;
  }

  /** Find an active subscriber by their unsubscribe/confirm token. */
  async findByToken(token: string): Promise<Subscriber | null> {
    const { data, error } = await this.db
      .from("subscribers")
      .select("*")
      .eq("token", token)
      .is("unsubscribed_at", null)
      .maybeSingle();
    if (error) throw new Error(`subscribers.findByToken: ${error.message}`);
    return (data as Subscriber | null) ?? null;
  }

  /** Insert a new subscriber. Throws on duplicate email (unique constraint). */
  async create(input: CreateSubscriberInput): Promise<Subscriber> {
    const { data, error } = await this.db
      .from("subscribers")
      .insert({
        email: input.email.toLowerCase(),
        name: input.name ?? null,
        token: input.token,
        providers: input.providers,
        confirmed: false,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new Error("Email already subscribed");
      }
      throw new Error(`subscribers.create: ${error.message}`);
    }
    return data as Subscriber;
  }

  /** Mark a subscriber as confirmed (double opt-in). */
  async confirm(token: string): Promise<Subscriber | null> {
    const { data, error } = await this.db
      .from("subscribers")
      .update({ confirmed: true, confirmed_at: new Date().toISOString() })
      .eq("token", token)
      .is("unsubscribed_at", null)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`subscribers.confirm: ${error.message}`);
    return (data as Subscriber | null) ?? null;
  }

  /** Update which providers a subscriber receives. */
  async updateProviders(input: UpdateProvidersInput): Promise<Subscriber | null> {
    const { data, error } = await this.db
      .from("subscribers")
      .update({ providers: input.providers })
      .eq("email", input.email.toLowerCase())
      .is("unsubscribed_at", null)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`subscribers.updateProviders: ${error.message}`);
    return (data as Subscriber | null) ?? null;
  }

  /** Soft-delete: set unsubscribed_at. Preserves dispatch history. */
  async unsubscribe(token: string): Promise<Subscriber | null> {
    const { data, error } = await this.db
      .from("subscribers")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("token", token)
      .is("unsubscribed_at", null)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`subscribers.unsubscribe: ${error.message}`);
    return (data as Subscriber | null) ?? null;
  }

  /** List all confirmed, active subscribers — used by the cron. */
  async listActiveConfirmed(): Promise<Subscriber[]> {
    const { data, error } = await this.db
      .from("subscribers")
      .select("*")
      .eq("confirmed", true)
      .is("unsubscribed_at", null);
    if (error) throw new Error(`subscribers.listActiveConfirmed: ${error.message}`);
    return (data as Subscriber[]) ?? [];
  }
}

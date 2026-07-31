import { Resend } from "resend";

export interface MailerOptions {
  apiKey: string;
  /** Default From address, e.g. "Juan <briefing@juansoultrek.com>". */
  from: string;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  /** Optional Reply-To header. */
  replyTo?: string;
  /** Optional headers (e.g. List-Unsubscribe). */
  headers?: Record<string, string>;
}

export interface SendMailResult {
  id: string;
}

/**
 * Thin wrapper around the Resend SDK so the rest of the app doesn't
 * import the SDK directly — easier to mock in tests and to swap later.
 */
export function createMailer(opts: MailerOptions) {
  const client = new Resend(opts.apiKey);

  return {
    async send(input: SendMailInput): Promise<SendMailResult> {
      const { data, error } = await client.emails.send({
        from: opts.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        replyTo: input.replyTo,
        headers: input.headers,
      } as Parameters<typeof client.emails.send>[0]);
      if (error) {
        throw new Error(`Resend error: ${error.name} — ${error.message}`);
      }
      // Resend returns the email id either as `id` (current) or via `data`.
      const id = (data as { id?: string } | null)?.id ?? "";
      return { id };
    },
  };
}

export type Mailer = ReturnType<typeof createMailer>;

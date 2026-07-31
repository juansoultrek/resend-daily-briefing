import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts.js";
import { parseProviderAnalysis, type ProviderAnalysis } from "./schema.js";
import type { RepoEvent } from "../github/types.js";
import { getProvider } from "../providers.js";

export class AnalyzerError extends Error {
  readonly originalError?: unknown;
  constructor(message: string, readonly provider: string, originalError?: unknown) {
    super(message);
    this.name = "AnalyzerError";
    if (originalError !== undefined) this.originalError = originalError;
  }
}

export interface AnalyzerOptions {
  apiKey: string;
  model: string;
  /** Optional fetch override (for tests). */
  fetchImpl?: typeof fetch;
  /** Max events to send to the model (avoids token blowup on busy days). */
  maxEventsPerProvider?: number;
}

const DEFAULT_MAX_EVENTS = 60;

/**
 * Calls OpenAI with JSON mode to analyze a provider's worth of GitHub events.
 * Returns a structured ProviderAnalysis validated against the zod schema.
 */
export function createAnalyzer(opts: AnalyzerOptions) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxEvents = opts.maxEventsPerProvider ?? DEFAULT_MAX_EVENTS;

  return {
    async analyze(
      providerSlug: string,
      events: RepoEvent[],
    ): Promise<ProviderAnalysis> {
      const provider = getProvider(providerSlug);
      if (!provider) {
        throw new AnalyzerError(`Unknown provider: ${providerSlug}`, providerSlug);
      }
      if (!opts.apiKey) {
        throw new AnalyzerError("OPENAI_API_KEY is not set", providerSlug);
      }

      const trimmed = events.slice(0, maxEvents);
      const userPrompt = buildUserPrompt(provider.slug, provider.displayName, trimmed);

      let raw: string;
      try {
        const res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${opts.apiKey}`,
          },
          body: JSON.stringify({
            model: opts.model,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 2000,
          }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new AnalyzerError(
            `OpenAI ${res.status}: ${text.slice(0, 300)}`,
            providerSlug,
          );
        }

        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        raw = data.choices?.[0]?.message?.content ?? "";
      } catch (err) {
        if (err instanceof AnalyzerError) throw err;
        throw new AnalyzerError(
          `OpenAI request failed: ${err instanceof Error ? err.message : String(err)}`,
          providerSlug,
          err,
        );
      }

      if (!raw) {
        throw new AnalyzerError("OpenAI returned empty content", providerSlug);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new AnalyzerError(
          `OpenAI returned non-JSON: ${raw.slice(0, 200)}`,
          providerSlug,
        );
      }

      try {
        return parseProviderAnalysis(parsed);
      } catch (err) {
        throw new AnalyzerError(
          `Schema validation failed: ${err instanceof Error ? err.message : String(err)}`,
          providerSlug,
          err,
        );
      }
    },
  };
}

export type Analyzer = ReturnType<typeof createAnalyzer>;

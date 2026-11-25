/**
 * What the app's origin answers on the router's paths: its refusals, and the events a
 * streamed turn sends. Shared by `ctx.chat` and `ctx.openai`.
 */
/** A parsed answer or streamed event, as the OpenAI API gives it. */
export type OpenAIResult = Record<string, unknown>;
/** Statuses a completion may already have spent tokens before, so asking again pays twice. */
export declare const SPENT: ReadonlySet<number>;
export declare function refusalOf(response: Response): Promise<Error>;
/** The response a turn's last event carries, or null for an event that ends nothing. */
export declare function endOf(event: OpenAIResult): OpenAIResult | null;
export declare function eventsOf(response: Response): AsyncIterable<OpenAIResult>;

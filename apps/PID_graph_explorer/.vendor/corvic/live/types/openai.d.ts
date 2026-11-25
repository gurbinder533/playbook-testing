/**
 * The model's own API, for what `ctx.chat.ask` does not do: function tools the page
 * runs and answers, structured extraction, a one-off classification.
 *
 * Shaped like the OpenAI SDK, so code written for it works as written:
 * `ctx.openai.responses.create(body)`, `ctx.openai.chat.completions.create(body)` and
 * `ctx.openai.models.list()`, each answering the parsed JSON, or with `stream: true` an
 * async iterable of the server-sent events. The app's origin serves the router's paths
 * and holds every request to the models `app.yaml` `chat` lists: `model` names one of
 * them, and a request that leaves it out asks the first. What a page would get wrong by
 * hand:
 *
 * - **A stream can break off.** A failure after the first event arrives as an `error`
 *   event, not a status; the iterable throws {@link ChatRequestError} on it.
 * - **A completion that failed after the model began may have spent tokens.** It is not
 *   asked again.
 * - **The router takes tools only on a streamed Responses turn.** A Responses turn is
 *   always streamed on the wire; one the page did not ask to stream answers the
 *   response its last event carries. Where that response lists no output, it is built
 *   from the `output_item.done` events, each message's text from its deltas.
 * - **Refusals mean different things**, as for `ctx.chat`: {@link ChatSignInRequiredError}
 *   for a reader without an account, {@link ChatRefusedError} where the app offers no chat.
 */
import type { ChatDeclaration } from "./chat";
import { type OpenAIResult } from "./router";
/** A request body, as the OpenAI API takes it. */
export type OpenAIBody = Readonly<Record<string, unknown>>;
export type { OpenAIResult } from "./router";
export interface OpenAIRequestOptions {
    signal?: AbortSignal;
}
export interface OpenAICreate {
    (body: OpenAIBody & {
        stream: true;
    }, options?: OpenAIRequestOptions): Promise<AsyncIterable<OpenAIResult>>;
    (body: OpenAIBody, options?: OpenAIRequestOptions): Promise<OpenAIResult>;
}
export interface OpenAIClient {
    /**
     * `create` a Responses turn: `input`, `instructions`, `tools` (function tools),
     * `text.format` for structured output, `stream`. Not streamed, the answer carries
     * `output_text`, its text joined, as the SDK's does.
     */
    readonly responses: {
        readonly create: OpenAICreate;
    };
    /** `create` a chat completion: `messages`, `response_format`, `stream`. */
    readonly chat: {
        readonly completions: {
            readonly create: OpenAICreate;
        };
    };
    /** The models the app offers, the first answering a request that names none. */
    readonly models: {
        list(options?: OpenAIRequestOptions): Promise<{
            data: OpenAIResult[];
        }>;
    };
}
/**
 * Build the client for one app session over what the manifest declared.
 *
 * Called by `mountApp`; a page receives the result as `ctx.openai`.
 */
export declare function openaiClient(declared: ChatDeclaration | null): OpenAIClient;

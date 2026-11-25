/**
 * Chatting from a page: asking the models `app.yaml` `chat` names.
 *
 * The app's origin answers the LLM router's own paths, so a page could `fetch`
 * `/openai/v1/chat/completions` itself. This module is what such a page gets wrong:
 *
 * - **A streamed reply is server-sent events, and can break off.** A reply that has
 *   begun reports a failure as an `error` event, not a status, so a page reading only
 *   the deltas shows half an answer as if it were whole. {@link ChatClient.ask}
 *   rejects with it.
 * - **Refusals mean different things.** A public link without an account needs
 *   sign-up, a busy model needs a pause, and an app that declares no chat needs its
 *   builder. The errors here carry those words.
 * - **The model knows only what it is sent.** A reader asks about what is in front of
 *   them; {@link ChatOptions.context} and {@link ChatOptions.page} send it, marked as
 *   data rather than instructions.
 * - **A prompt is the app's, not the page's.** {@link ChatClient.prompt} reads one from
 *   the bundle's `prompts/`, so an app keeps one per way of chatting and edits it without
 *   touching a page.
 * - **A lookup is a tool the page answers.** {@link ChatOptions.tools} lets the model call
 *   the page's functions and go on with what they return, streaming only its text.
 * - **A proposal is structured, not parsed out of prose.** {@link ChatOptions.actions}
 *   asks for the reply as a JSON object holding its text and the actions it proposes,
 *   each matching the schema the page gave it, while `onReply` still sees only the text.
 * - **A decision is not a chat.** A decision model (TypeSafe's System One) answers
 *   questions about a state with a choice, a score or a yes or no, never text;
 *   {@link ChatClient.decide} asks one where the app lists it.
 */
/** The manifest's `chat`, as the host inlined it, each model as the router names it. */
export interface ChatDeclaration {
    /** The models that chat, the first answering an ask that names none. */
    models: string[];
    /** The decision models, the first answering a decision that names none. */
    decisionModels: string[];
}
export type ChatRole = "system" | "user" | "assistant";
/** One turn of a conversation, as the model is sent it. */
export interface ChatMessage {
    role: ChatRole;
    content: string;
}
export interface ChatOptions {
    signal?: AbortSignal;
    /**
     * Which of {@link ChatClient.models} answers; the first when omitted. Name one only
     * where the page offers a choice or a task suits another.
     */
    model?: string;
    /**
     * Called with each piece of the reply as it arrives, and the reply so far: paint
     * `soFar` as text, never as HTML.
     */
    onReply?: (soFar: string, piece: string) => void;
    /** The most output tokens the reply may spend. */
    maxOutputTokens?: number;
    /**
     * What the model should know to answer, each under a label it is told: rows from
     * `ctx.db`, the record on screen, the reader's choices. Strings are sent as written,
     * anything else as JSON.
     */
    context?: Readonly<Record<string, unknown>>;
    /** Also send the page's text as the reader sees it now, cut to 20000 characters. */
    page?: boolean;
    /**
     * What the reply may propose the reader do next, by kind: only these are asked for,
     * and each comes back with a value matching its schema.
     */
    actions?: Readonly<Record<string, ChatActionSpec>>;
    /**
     * Functions the model may call before it answers, by name: it is sent what each
     * `run` returns and goes on, up to four rounds. Not together with `actions`; a tool
     * whose `run` offers the reader a button proposes instead.
     */
    tools?: Readonly<Record<string, ChatTool>>;
}
/** A function the model may call, which the page answers at once. */
export interface ChatTool {
    /** What it does and when to call it, as the model is told. */
    description: string;
    /**
     * The JSON schema of its arguments: an object listing every property in `required`,
     * with `additionalProperties: false`. It takes none when omitted.
     */
    parameters?: Readonly<Record<string, unknown>>;
    /** Answer one call: a string is sent as written, anything else as JSON. */
    run(args: Record<string, unknown>): unknown;
}
/** An action a reply may propose, which the page offers the reader as a button. */
export interface ChatActionSpec {
    /** When to propose it and what its value holds, as the model is told. */
    description: string;
    /**
     * The JSON schema of its value, a string when omitted. An object lists every property
     * in `required` and sets `additionalProperties: false`.
     */
    value?: Readonly<Record<string, unknown>>;
}
/** One action a reply proposes. */
export interface ChatAction {
    readonly kind: string;
    readonly value: unknown;
}
/** A whole reply. */
export interface ChatReply {
    readonly text: string;
    /** What it proposes, of the kinds {@link ChatOptions.actions} offered; none otherwise. */
    readonly actions: readonly ChatAction[];
    /**
     * Why the model stopped: `stop`, `length` when it ran out of output tokens, or
     * `tool_calls` when it was still calling tools after the last round.
     */
    readonly finishReason: string | null;
}
/** One question a decision model answers of the state it is given, by its `type`. */
export type DecisionQuestion = {
    /** Which of `criteria`, keyed by label, the state calls for. */
    type: "choice";
    instructions?: string;
    criteria: Readonly<Record<string, string>>;
} | {
    /** How well the state meets `criteria`. */
    type: "score";
    instructions?: string;
    criteria: readonly string[];
} | {
    /** Yes or no: whether the state meets `criteria.true` rather than `criteria.false`. */
    type: "noul";
    instructions?: string;
    criteria?: {
        true?: string;
        false?: string;
    };
};
/** A decision model's answer to one question, by the question's `type`. */
export type DecisionAnswer = {
    readonly type: "choice";
    /** The label of `criteria` the state calls for. */
    readonly choice: string;
    readonly confidence: number;
    /** How likely each label is, from 0 to 1. */
    readonly probabilities: Readonly<Record<string, number>>;
} | {
    readonly type: "noul";
    /** How likely the state meets `criteria.true`, from 0 to 1. */
    readonly noul: number;
} | {
    readonly type: "score";
    /** Which of `criteria` the state is, by its index in the list. */
    readonly score: number;
    readonly confidence: number;
    /** Each criterion by its index, as a string. */
    readonly legend: Readonly<Record<string, string>>;
    /** How likely each index is, from 0 to 1. */
    readonly probabilities: Readonly<Record<string, number>>;
};
export interface DecideOptions {
    signal?: AbortSignal;
    /** Which of {@link ChatClient.decisionModels} answers; the first when omitted. */
    model?: string;
}
export interface ChatClient {
    /**
     * The models the app's readers chat with, as the router names them, the first
     * answering an ask that names none; empty where `app.yaml` declares no `chat`.
     */
    readonly models: readonly string[];
    /**
     * The decision models the app lists, the first answering a decision that names none;
     * empty where it lists none.
     */
    readonly decisionModels: readonly string[];
    /**
     * Ask the model, streaming its reply to `onReply`; resolves with the whole of it.
     *
     * Send the whole conversation each time, oldest first, with any `system` message
     * leading: the model remembers nothing between calls.
     */
    ask(messages: readonly ChatMessage[], options?: ChatOptions): Promise<ChatReply>;
    /**
     * The prompt the bundle keeps at `prompts/<name>.md`, with each `{{key}}` in it
     * replaced by `values[key]`. A placeholder `values` does not name is left as written.
     */
    prompt(name: string, values?: Readonly<Record<string, string | number>>): Promise<string>;
    /**
     * Ask a decision model every one of `questions` about `state` (text, or anything as
     * JSON) in one call; resolves with each answer by the question's name.
     */
    decide(state: unknown, questions: Readonly<Record<string, DecisionQuestion>>, options?: DecideOptions): Promise<Readonly<Record<string, DecisionAnswer>>>;
}
/** Where the page's chat is asked, and what it can read of the app around it. */
export interface ChatSurroundings {
    /** The bundle root, which `prompts/` is under. */
    base: string;
    /** The page the reader sees, which {@link ChatOptions.page} sends the text of. */
    page: () => HTMLElement | null;
}
/**
 * Build the client for one app session over what the manifest declared.
 *
 * Called by `mountApp`; a page receives the result as `ctx.chat`.
 */
export declare function chatClient(declared: ChatDeclaration | null, surroundings: ChatSurroundings): ChatClient;

/**
 * The errors `@corvic/live` rejects with.
 *
 * Call sites are generated app bundles; failures surface as rejections. The
 * mount wraps every page render and listens for `unhandledrejection` and
 * `error`, so a failure that arrives after the render returns is shown too
 * (see `reportUncaught` in `mount.ts`).
 */
/**
 * Base class for every error this runtime raises.
 *
 * Branch on {@link CorvicError.kind}: bundlers mangle class names, and an error
 * that crosses the worker boundary arrives as a structured clone with no
 * prototype. `kind` survives both.
 */
export declare abstract class CorvicError extends Error {
    abstract readonly kind: string;
}
/** SQL that the engine refused or failed to execute. */
export declare class QueryError extends CorvicError {
    readonly sql: string;
    readonly kind = "query";
    constructor(sql: string, cause: unknown);
}
/**
 * A query the caller stopped waiting for, because its signal aborted.
 *
 * Distinct from {@link QueryError}: navigation away is a normal outcome and is
 * not shown on an error surface; a failed SQL statement is a defect and is.
 */
export declare class QueryAbortedError extends CorvicError {
    readonly sql: string;
    readonly kind = "query-aborted";
    constructor(sql: string);
}
/** A source that could not be read: it 404s, is unreachable, or is not Parquet. */
export declare class SourceUnavailableError extends CorvicError {
    readonly source: string;
    readonly url: string;
    readonly kind = "source-unavailable";
    constructor(source: string, url: string, cause: unknown);
}
/**
 * A write the runtime refused before asking the server: the app is at fault.
 *
 * A target no manifest declares, a target used as the wrong kind, or a path that
 * climbs out of the one it was given. Separate from the two below because nothing
 * about the reader's situation changed — the same click will fail the same way
 * until the bundle is fixed.
 */
export declare class WriteRefusedError extends CorvicError {
    readonly target: string;
    readonly kind = "write-refused";
    constructor(target: string, reason: string);
}
/**
 * The reader's user-content session lapsed mid-write.
 *
 * Its own class because it is the one write failure that is nobody's mistake and
 * has a remedy a page can offer: the token lives five minutes, the embedder
 * re-mints it, and reloading picks up the fresh one. Reported as a lost
 * connection rather than a rejected upload, which is what it is.
 */
export declare class WriteSessionExpiredError extends CorvicError {
    readonly target: string;
    readonly kind = "write-session-expired";
    constructor(target: string);
}
/**
 * The reader opened a public link without an account, and the link saves only for
 * people who have one.
 *
 * Anyone can read a public app; changing its data is for app users, whom its owner
 * can see and stop. The page embedding the app offers sign-up when this is
 * raised, so a page need only say that saving waits on it.
 */
export declare class WriteSignInRequiredError extends CorvicError {
    readonly target: string;
    readonly kind = "write-sign-in-required";
    constructor(target: string);
}
/**
 * The server declined a write, or it never arrived.
 *
 * Carries the status and the server's own detail, because the refusals an app
 * provokes are specific and say what to fix: a row that does not match the
 * target's schema, a file posted to a row collection, a path that no longer
 * exists. `status` is 0 when the request itself failed.
 */
export declare class WriteRejectedError extends CorvicError {
    readonly target: string;
    readonly url: string;
    readonly status: number;
    readonly detail: string;
    readonly kind = "write-rejected";
    constructor(target: string, url: string, status: number, detail: string);
}
/**
 * A form was submitted and no page handler claimed it.
 *
 * Raised for a POST submission that reaches the router, which means the page
 * rendered a form and never called `preventDefault`. Its fields would go to a
 * path that serves the bundle, tearing the app down mid-entry.
 *
 * A GET form is not this: its fields are in the query string, so the router
 * handles it as an ordinary route change.
 */
export declare class FormNotHandledError extends CorvicError {
    readonly action: string;
    readonly kind = "form-not-handled";
    constructor(action: string);
}
/**
 * The frame this app is shown in refuses form submission.
 *
 * An iframe whose `sandbox` lacks `allow-forms` drops a submit before the
 * `submit` event fires, so no page handler runs and nothing is logged. Every
 * Save, Add and search box in the app does nothing. The page cannot fix this;
 * the embedder has to grant `allow-forms`.
 */
export declare class FormsBlockedError extends CorvicError {
    readonly kind = "forms-blocked";
    constructor();
}
/**
 * A source whose bytes exceed the engine's limit, refused before it is fetched.
 */
export declare class SourceTooLargeError extends CorvicError {
    readonly source: string;
    readonly url: string;
    readonly bytes: number;
    readonly limit: number;
    readonly kind = "source-too-large";
    constructor(source: string, url: string, bytes: number, limit: number);
}
/**
 * A playbook the runtime refused before asking the server: the app is at fault.
 *
 * A name no manifest declares, or a run handle missing the ids it needs. The same
 * press fails the same way until the bundle is fixed.
 */
export declare class PlaybookRefusedError extends CorvicError {
    readonly playbook: string;
    readonly kind = "playbook-refused";
    constructor(playbook: string, reason: string);
}
/**
 * The reader opened a public link without an account, and running a playbook is for
 * people who have one. The embedding page offers sign-up when this is raised.
 */
export declare class PlaybookSignInRequiredError extends CorvicError {
    readonly playbook: string;
    readonly kind = "playbook-sign-in-required";
    constructor(playbook: string);
}
/** What a page was doing with a playbook when the server said no. */
export type PlaybookStep = "start" | "list the runs of" | "check on" | "read the output of";
/**
 * The server declined a playbook request, or it never arrived.
 *
 * The message is written for the reader: a refusal says they may not run it here,
 * a busy server says to wait, and anything else names the step and the status.
 * `status` is 0 when the request itself failed.
 */
export declare class PlaybookRequestError extends CorvicError {
    readonly playbook: string;
    readonly step: PlaybookStep;
    readonly status: number;
    readonly detail: string;
    readonly retryAfterSeconds: number | null;
    readonly kind = "playbook-request";
    constructor(playbook: string, step: PlaybookStep, status: number, detail: string, retryAfterSeconds?: number | null);
}
/**
 * A run is over and none of its outputs holds the file a page asked for.
 *
 * `checked` says why each output was passed over, which is what tells a run that
 * published elsewhere from one that published nothing.
 */
export declare class PlaybookOutputMissingError extends CorvicError {
    readonly playbook: string;
    readonly path: string;
    readonly checked: readonly string[];
    readonly kind = "playbook-output-missing";
    constructor(playbook: string, path: string, checked: readonly string[]);
}
/**
 * The app offers no chat, or not with what the page asked: `app.yaml` declares no `chat`,
 * or the page named a model other than the one it declares.
 */
export declare class ChatRefusedError extends CorvicError {
    readonly kind = "chat-refused";
    constructor(reason: string);
}
/**
 * The reader opened a public link without an account, and chatting is for people who
 * have one. The embedding page offers sign-up when this is raised.
 */
export declare class ChatSignInRequiredError extends CorvicError {
    readonly kind = "chat-sign-in-required";
    constructor();
}
/**
 * The server declined a chat request, it never arrived, or the reply broke off.
 *
 * The message is written for the reader. `status` is 0 when the request itself failed,
 * and the status the stream reported when a reply that had begun broke off.
 */
export declare class ChatRequestError extends CorvicError {
    readonly status: number;
    readonly detail: string;
    readonly retryAfterSeconds: number | null;
    readonly kind = "chat-request";
    constructor(status: number, detail: string, retryAfterSeconds?: number | null);
}

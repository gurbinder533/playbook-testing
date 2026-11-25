/**
 * Running a playbook from a page: what `app.yaml` `playbooks[]` lets a reader start.
 *
 * Each reader runs a playbook through an agent of their own, adopted from the room's
 * playbook the first time they use it. A page names the playbook by the id it
 * declared and gets back a run it can wait on and read outputs from.
 *
 * Why this is a module and not a handful of `fetch` calls in each app: each of these
 * is a failure a hand-rolled page got wrong where nobody was watching.
 *
 * - **A run can stop without saying how it went.** One whose agent never reported
 *   its stages is neither completed nor failed; a page waiting on those two alone
 *   spins forever. The edge names that state `ended`, and {@link PlaybookClient.wait}
 *   treats it as over once it holds across two polls, since a turn can end and the
 *   next start between polls.
 * - **A run has several outputs, and an empty one can come first.** A page that
 *   reads the first output whose name looks right shows nothing.
 *   {@link PlaybookClient.file} asks each output for the file and says what it found
 *   in every one when none holds it.
 * - **Refusals mean different things.** A public link without an account needs
 *   sign-up, a busy server needs a pause, and anything else needs words a reader can
 *   act on. The errors here carry those words.
 */
/** One manifest playbook, as the host inlined it. */
export interface PlaybookDeclaration {
    name: string;
    /** Where the reader's agent is adopted: `/ensure-playbook/<name>`. */
    url: string;
    label?: string;
}
/** What a run starts with. Every field is optional. */
export interface PlaybookInput {
    /**
     * The playbook's own form fields, by name. Include the key of the record the run is
     * for: {@link PlaybookClient.runs} reports it back as `input.values`.
     */
    values?: Readonly<Record<string, unknown>>;
    /** What the reader asked for in words, beside the fields. */
    message?: string;
    /** Context for the run that is not the reader's words, such as which record it is about. */
    runContext?: string;
}
/**
 * A run a page started. Never store it: {@link PlaybookClient.runs} lists it again on
 * another visit, with the input it was started with.
 */
export interface PlaybookRun {
    readonly playbook: string;
    readonly agentId: string;
    readonly runId: string;
}
/**
 * Where a run stands.
 *
 * `waiting` is a run held on something outside it, such as an approval; it is not
 * over. `ended` is a run that stopped without reporting how it went: over, with
 * `answer` the only account of it.
 */
export type PlaybookRunState = "running" | "waiting" | "completed" | "failed" | "ended";
/** One table the run published with `allocate_artifact` and `write_artifact`. */
export interface PlaybookOutput {
    readonly name: string;
    /** The table as `<id>:<tag>`, what `/artifact/<table>/<path>` serves a file of. */
    readonly table: string;
    /** An app of its own: show its name, never embed it. */
    readonly isApp: boolean;
}
/** Where a run stands, as {@link PlaybookClient.runs} lists it. */
export interface PlaybookRunSummary extends PlaybookRun {
    readonly state: PlaybookRunState;
    /** Whether the run will not change again: `completed`, `failed` or `ended`. */
    readonly over: boolean;
    readonly startedAt: Date;
    readonly completedAt: Date | null;
    readonly failedAt: Date | null;
    /**
     * Exactly what {@link PlaybookClient.start} sent: the only link from a run to the record
     * it was for. Label a run from it, and find a record's run by its key in `input.values`.
     */
    readonly input: Readonly<Required<PlaybookInput>>;
}
/** One step of the playbook's plan, as the run last reported it. */
export interface PlaybookStage {
    readonly id: string;
    /** The step's label from the plan, to show the reader. */
    readonly label: string;
    /** `pending` until the run reports the step. */
    readonly status: "pending" | "started" | "done" | "failed";
}
/** Where a run stands, with how far it got and what it produced. */
export interface PlaybookRunStatus extends PlaybookRunSummary {
    /**
     * Every step of the playbook's plan, in order, with how far the run got; empty for a
     * playbook without a plan. While it runs, show each `label` as text, or
     * "Step 2 of 3: <label>" from the last stage not `pending`.
     */
    readonly stages: readonly PlaybookStage[];
    /** The playbook's last reply, as text: show it escaped, never as HTML. */
    readonly answer: string | null;
    readonly outputs: readonly PlaybookOutput[];
}
/** A file one of a run's outputs holds. */
export interface PlaybookFile {
    readonly output: PlaybookOutput;
    readonly path: string;
    /** Where the file is served, for a link or an `<img>`. */
    readonly url: string;
    readonly response: Response;
}
export interface PlaybookRequestOptions {
    /** Pass `ctx.signal` so a navigation abandons the request. */
    signal?: AbortSignal;
}
export interface PlaybookRunsOptions extends PlaybookRequestOptions {
    /** The `cursor` of the page before, to read the one after it. */
    cursor?: string | null;
}
/** One page of a reader's runs, newest first. */
export interface PlaybookRunPage {
    readonly runs: readonly PlaybookRunSummary[];
    /** What to pass as `cursor` for the next page; `null` on the last. */
    readonly cursor: string | null;
}
export interface PlaybookWaitOptions extends PlaybookRequestOptions {
    /** How long between checks. Defaults to five seconds; never under two. */
    intervalMs?: number;
    /** Called with every status, the last included, to show progress. */
    onStatus?: (status: PlaybookRunStatus) => void;
}
export interface PlaybookJsonOptions<T> extends PlaybookRequestOptions {
    /**
     * Whether a parsed file is the one this run wrote, when runs share an output: compare
     * the key the playbook wrote into it with `status.input`. A rejected file counts as
     * missing.
     */
    accept?: (value: unknown) => value is T;
}
/** The governed path to playbooks. A declared playbook is the whole interface. */
export interface PlaybookClient {
    /**
     * Start a run of `playbook`, adopting the reader's agent the first time. Answers with
     * where the run stands once started, as {@link PlaybookClient.status} does; follow it
     * with {@link PlaybookClient.wait}. Each call starts a run of its own, with its own
     * outputs, even with the same input: never add an id field to keep runs apart. Disable
     * the press that called it until it answers, then allow another.
     */
    start(playbook: string, input?: PlaybookInput, options?: PlaybookRequestOptions): Promise<PlaybookRunStatus>;
    /**
     * The reader's own runs of `playbook`, newest first, a page at a time, each with the
     * `input` it was started with. Pass `cursor` back for older ones.
     *
     * This is how a page shows past runs and resumes one on a later visit. A listed run
     * has no `stages`, `answer` or `outputs`: pass it to {@link PlaybookClient.status} or
     * {@link PlaybookClient.wait} for those. A listed `ended` run may be between turns,
     * which only `wait` settles.
     */
    runs(playbook: string, options?: PlaybookRunsOptions): Promise<PlaybookRunPage>;
    /** Where `run`, started or listed, stands now, with its stages, answer and outputs. */
    status(run: PlaybookRun, options?: PlaybookRequestOptions): Promise<PlaybookRunStatus>;
    /** Check `run` until it is over, and answer with how it ended. */
    wait(run: PlaybookRun, options?: PlaybookWaitOptions): Promise<PlaybookRunStatus>;
    /**
     * The file at `path` in whichever of the run's outputs holds it.
     *
     * Rejects with {@link PlaybookOutputMissingError} when none does.
     */
    file(status: PlaybookRunStatus, path: string, options?: PlaybookRequestOptions): Promise<PlaybookFile>;
    /** {@link PlaybookClient.file}, parsed as JSON, skipping files `accept` rejects. */
    json<T = unknown>(status: PlaybookRunStatus, path: string, options?: PlaybookJsonOptions<T>): Promise<T>;
    /** The playbooks the manifest declared. */
    declared(): readonly PlaybookDeclaration[];
}
/** Seams for tests, which must not spend the wall-clock time. */
export interface PlaybookClientOptions {
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}
/**
 * Build the client for one app session over what the manifest declared.
 *
 * Called by `mountApp`; a page receives the result as `ctx.playbooks`.
 */
export declare function playbookClient(declared: readonly PlaybookDeclaration[], options?: PlaybookClientOptions): PlaybookClient;

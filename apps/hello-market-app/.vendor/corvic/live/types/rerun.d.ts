/**
 * Asking for the app's data to be made again, for a request its reader filed.
 *
 * `ctx.reload` re-reads what is there. This makes what is there: the app's sources are
 * filled by a playbook, and the embedder can run it again. An author who wants their
 * reader to argue with how it runs -- a different ticker, a wider window -- builds the
 * control for it out of whatever the rest of the app is built out of, appends what the
 * reader chose to the app's request table with `ctx.write.rows`, and names that row here.
 * There is deliberately no platform-supplied form: the app's own inputs are the point,
 * and a modal that appears over them is what this replaces.
 *
 * **A request is a filing, not a person.** One click of a reader's button is one request,
 * with an id this module mints -- {@link RerunClient.newRequest} -- and the run writes
 * that id onto every row it produces. That is the whole of how one reader's results are
 * told from another's: two people who fill the same form in the same second file two
 * requests and read back only their own rows. Nothing here knows or asks who either of
 * them is, and an app that tells its reader a refresh needs them signed in is describing
 * something this module does not do.
 *
 * The id is minted here rather than by the page so that a page cannot reuse one, collide
 * with one, or invent a value the run's rows are not labelled with. It is remembered for
 * the app's origin, which is why {@link RerunClient.lastRequest} can hand back the one a
 * reader filed before they reloaded -- a run outlives the page that asked for it, and an
 * app that forgot which request was its own would show a reader an empty table while
 * their answer sat in it.
 *
 * **A reader's answers are not arguments to this call. They are rows.** That is the shape
 * the rest of this follows from. The app appends a request -- append-only, checked against
 * the artifact's declared schema, bounded by `writes` like every other write it makes --
 * and the only thing travelling here is which row the run is for. So there is no allowlist
 * of settable inputs, because there is nothing left to allow: a page can no more repoint
 * this app at other data than any other write it makes could.
 *
 * A run is minutes, because there is an agent doing real work in it. That is the fact
 * this module's shape follows from. {@link RerunClient.submit} hands back a
 * {@link RerunHandle} rather than only a promise, so a page can render the run *while it
 * is happening* -- which stage it is on, how far through the plan it is -- instead of
 * disabling a button and going quiet for five minutes. {@link RerunClient.request} is
 * still here and still awaits the whole thing, for a control simple enough not to care.
 *
 * Two things bound what a page may ask for:
 *
 * - **Whether this app files requests at all.** `data[].produced_by.inputs_from` in
 *   `app.yaml` names the target a reader's row goes to, and the host inlines it here.
 *   Where it names one, submitting without a request is the author's own bug -- the run
 *   would read whichever row is newest, which is whatever somebody else last filed -- so
 *   it throws from {@link RerunClient.submit} rather than becoming that run. Where it
 *   names none the playbook takes no arguments, and a bare submit is fine: there is no
 *   row to have written first, so the id is minted on the spot and handed back on the
 *   handle, because the rows still carry it.
 * - **Whether anyone is listening.** Running a playbook is the embedder's to do; this
 *   module only asks. An app open in a bare tab, or in an embedder built before it could
 *   answer, has nobody to ask -- {@link RerunClient.available} is how a page finds out
 *   before it renders a button that cannot work.
 */
/** How this app's readers pass arguments to its playbook, as the host inlined it. */
export interface RerunDeclaration {
    /**
     * The `writes` id from `data[].produced_by.inputs_from`, or null for a playbook this
     * app's readers pass nothing to.
     *
     * The same id `ctx.write.rows` takes, deliberately: writing the request and naming it
     * are two halves of one act, and a page that could spell them differently would file a
     * reader's answers somewhere no run reads.
     */
    requests: string | null;
}
/**
 * How far a submitted run has got.
 *
 * Four states rather than a boolean because "asked for" and "under way" are different
 * things to say to a reader, and the gap between them is a round trip plus whatever the
 * embedder does to start a run. A page that shows "Running…" while nothing has started
 * yet has told its reader something it does not know.
 */
export type RerunStatus = "starting" | "running" | "done" | "failed";
/**
 * Which stage of the playbook's plan is running, as the host reports it.
 *
 * A playbook declares its stages up front and reports crossing each one, which is what
 * makes this more than a spinner: the stage has the author's own label on it, so a page
 * can say "Pulling filings" rather than "Working". Absent for a run whose playbook
 * declares no plan, and absent until the first stage is reported -- so a page reads it as
 * detail it may have rather than as something to wait for.
 */
export interface RerunStage {
    /** The plan step id the playbook reported. */
    readonly id: string;
    /** The step's label from the plan, or its id where the plan gave none. */
    readonly label: string;
    /** How many of the plan's stages have finished. */
    readonly done: number;
    /** How many stages the plan has, or 0 where the plan is not known. */
    readonly total: number;
    /** Whatever note the playbook left with the report. Usually empty. */
    readonly note: string;
}
/**
 * One submitted run, watchable while it happens.
 *
 * The handle is the run, not a request for it: it exists from the moment `submit` returns
 * and keeps its final state afterwards, so a page can hold a list of them and render each
 * one's status without tracking anything itself.
 */
export interface RerunHandle {
    /** This run's id, as the frame and the host both know it. Useful as a list key. */
    readonly id: string;
    /**
     * The request this run is for, which is the value its rows carry in `corvic_request`.
     *
     * What a page selects its own results by: `where corvic_request = handle.request`. Held
     * here as well as remembered for the origin so that a page which submits several runs
     * can tell each one's rows apart without keeping the ids itself, and so the bare
     * submit an app with no request table makes still knows what it was labelled with.
     */
    readonly request: string;
    /** Where the run is now. Read it again after {@link RerunHandle.watch} fires. */
    readonly status: RerunStatus;
    /** The stage now running, where the host has reported one. */
    readonly stage: RerunStage | null;
    /**
     * Resolves once the run has finished and this app's data has been re-read.
     *
     * Rejects with {@link RerunUnavailableError} where nothing answers and
     * {@link RerunFailedError} carrying the embedder's own account of a run that did not
     * finish. Nothing times out: a spinner that gives up at some arbitrary minute would
     * be lying about a run still going.
     *
     * Safe to ignore. A page that renders {@link RerunHandle.status} already knows a run
     * failed, and reading this only to satisfy the promise is not required -- the failure
     * is kept here rather than left on an unattended promise for exactly that reason.
     */
    readonly done: Promise<void>;
    /**
     * Call `listener` whenever {@link RerunHandle.status} or {@link RerunHandle.stage}
     * changes, and stop when the returned function is called.
     *
     * The listener takes no argument: read the handle, which is the state. That keeps a
     * page's render path the same whether it is drawing a run it just submitted or one it
     * is being told about.
     */
    watch(listener: () => void): () => void;
}
/** Asking the embedder to make this app's data again. */
export interface RerunClient {
    /**
     * Mint the id for a request about to be filed, and remember it as this app's latest.
     *
     * Call this first, write it into the request row as `corvic_request` alongside
     * whatever the reader chose, then hand it to {@link RerunClient.submit}. In that order:
     * the id has to be in the row for the run to find the row, and the run has to be told
     * the id to label its output with it.
     *
     * Every call mints a new one, so a reader who edits their answers and files again is
     * filing a second request rather than overwriting the first -- which is what lets both
     * runs finish and both answers be read. Nothing derives it from the arguments: the same
     * arguments filed twice are two requests, not one.
     */
    newRequest(): string;
    /**
     * The last request this app minted or submitted, or null if it has filed none.
     *
     * For the reader who reloads while a run is going, or comes back to the tab later. A
     * run outlives the page that asked for it and its rows are already labelled, so a page
     * that reads this on boot can show a finished answer instead of an empty table. Kept
     * for the app's own origin, so no other app can see it and it does not travel between
     * readers.
     */
    lastRequest(): string | null;
    /**
     * Start a run for `request` and hand back the {@link RerunHandle} for watching it.
     *
     * `request` is the id from {@link RerunClient.newRequest} that the page has already
     * written into the request row: write first, then submit, because a run that reaches
     * the table before the request does finds nothing there. Omit it only for an app that
     * declares no request target, where there is no row to have written and one is minted
     * here so the run's rows are still labelled.
     *
     * Returns immediately, before the host has even been asked, so the control that
     * called it can render the run in the same frame the reader clicked in. Everything
     * that can go wrong afterwards arrives on {@link RerunHandle.done} and as a `failed`
     * status -- with one exception: omitting the request on an app whose playbook reads one
     * throws from here, synchronously, because that is the author's own bug and not a run
     * that failed.
     */
    submit(request?: string): RerunHandle;
    /**
     * Rerun the playbook behind this app's data for `request`, then re-read it.
     *
     * Resolves once new data is in place, so a caller can leave a control disabled for
     * the duration of the await and no more. Exactly `submit(request).done`, for a
     * control with nothing to show in between; anything that wants to say what is
     * happening while it happens wants {@link RerunClient.submit} instead -- as does
     * anything that needs the request id, which only the handle carries.
     *
     * Throws {@link RerunRefusedError} where the request and the manifest disagree,
     * {@link RerunUnavailableError} where nothing answers, and {@link RerunFailedError}
     * carrying the embedder's own account of a run that did not finish.
     */
    request(request?: string): Promise<void>;
    /**
     * The `writes` id a reader's request belongs in, or null where this app files none.
     *
     * The id to hand `ctx.write.rows` before submitting. Reading it from here rather than
     * repeating the literal keeps the write and the run naming one target.
     */
    requests(): string | null;
    /**
     * Whether asking would reach anybody, once the host has had its say.
     *
     * Purely about the embedder now: an app that files no requests can still be rerun, so
     * this no longer folds in whether the author opened anything. Await it before a first
     * render rather than calling it synchronously -- the host's answer races boot.
     */
    available(): Promise<boolean>;
}
/**
 * Build the client for one app session over what the manifest opened.
 *
 * Called by `mountApp`; a page receives the result as `ctx.rerun`. `reread` re-asks for
 * the app's sources without re-rendering the page: the run's whole point is that new rows
 * appear where the old ones were, and a page torn down and rebuilt at that moment loses
 * the very control the reader is watching.
 */
export declare function rerunClient(declared: RerunDeclaration | undefined, reread: () => Promise<void>): RerunClient;

/**
 * Who is using the app, as the server takes them to be.
 *
 * A table whose schema has `__corvic_app_row_owner_id` keeps each row to the person who wrote it,
 * and one with `__corvic_app_row_author_id` records who wrote each row. The server fills both
 * from the reader's account; this is the same account, so a page can tell its reader's
 * rows from the rest. It is not what decides which rows a reader gets: the server
 * does, and a page cannot widen it.
 */
/** The app's reader. */
export interface Reader {
    /** Whether they are signed in. A visitor without an account owns no rows. */
    readonly signedIn: boolean;
    /** What `__corvic_app_row_owner_id` and `__corvic_app_row_author_id` hold for their rows; null when signed out. */
    readonly userId: string | null;
    /**
     * Whether they hold the app's room, and so read every row of a per-person table —
     * the app's builder in the preview, a member with access to the room.
     */
    readonly everyRow: boolean;
    /**
     * The app's roles they hold, by the ids `app.yaml` declares under `roles`, in its
     * order: every one for the app's builder, none in an app declaring no roles. A page
     * uses them to show each reader the view for what they reach; the server is what
     * keeps a reader from the rest.
     */
    readonly roles: readonly string[];
    /**
     * The one of `roles` the app acts as, chosen by `ctx.actAs`, or null acting as all of
     * them. Acting as a role reaches only what it is shared with, so a teacher holding
     * `student` too sees the app as a student does.
     */
    readonly role: string | null;
    readonly firstName: string | null;
    readonly lastName: string | null;
    /** Their first and last name together, as they signed up; null when they gave neither. */
    readonly name: string | null;
    /** Their email, only where their sign-in verified it. */
    readonly email: string | null;
}
/** Asks for the reader, and forgets the answer once the role acted as changes. */
export type ReaderClient = ((signal?: AbortSignal) => Promise<Reader>) & {
    forget(): void;
};
/**
 * The reader for this app session: asked once, and again only after a failure.
 *
 * A reader does not change without the document reloading — signing in or out
 * navigates — so one answer serves every page until the page acts as another role.
 */
export declare function readerClient(): ReaderClient;
/**
 * Act as `role` alone from now on, or as every role held when it is null.
 *
 * Kept for the tab's session, so reloading the app keeps the view the reader chose.
 */
export declare function setActingRole(role: string | null): void;
/** `init` naming the role this session acts as, which the server narrows the request to. */
export declare function withActingRole(init?: RequestInit): RequestInit;

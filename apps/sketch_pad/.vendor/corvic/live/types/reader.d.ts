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
}
/**
 * The reader for this app session: asked once, and again only after a failure.
 *
 * A reader does not change without the document reloading — signing in or out
 * navigates — so one answer serves every page.
 */
export declare function readerClient(): (signal?: AbortSignal) => Promise<Reader>;

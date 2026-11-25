/**
 * Corvic Live App spec.
 *
 * A JSON document describing which live feature views to read, what panels to
 * draw, and how to format them. Produced by the agent, a no-code editor, or a
 * template; rendered by `mountApp`. Structured so agent edits are patches.
 */
import { z } from "zod";
/**
 * A named live data source. The value is a Corvic feature-view Parquet link
 * (see {@link LiveSourceUrlSchema}). The key is the SQL table name panels select
 * from.
 *
 * Example: `{ "sales": "/table/148974:sales" }` → `SELECT ... FROM sales`.
 */
export declare const SourcesSchema: z.ZodRecord<z.ZodString, z.ZodString>;
/**
 * One entry in a multi-page app's in-app navigation. `href` is a bundle-relative
 * link; `label` is the click text. The runtime renders a nav bar on every page
 * and marks the current one active.
 */
export declare const NavLinkSchema: z.ZodObject<{
    label: z.ZodString;
    href: z.ZodString;
}, z.core.$strip>;
export type NavLink = z.infer<typeof NavLinkSchema>;
/** Value/number formatting vocabulary for panels. */
export declare const ValueFormatSchema: z.ZodEnum<{
    number: "number";
    raw: "raw";
    date: "date";
    compact: "compact";
    usd: "usd";
    percent: "percent";
    datetime: "datetime";
}>;
export type ValueFormat = z.infer<typeof ValueFormatSchema>;
/**
 * Declarative binding compiled to SQL by {@link compileBinding}. A panel may
 * supply `query` instead.
 */
export declare const BindingSchema: z.ZodObject<{
    from: z.ZodString;
    x: z.ZodOptional<z.ZodString>;
    y: z.ZodOptional<z.ZodString>;
    agg: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
        sum: "sum";
        avg: "avg";
        count: "count";
        min: "min";
        max: "max";
    }>>>;
    sort: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
        asc: "asc";
        desc: "desc";
    }>>>;
    limit: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type Binding = z.infer<typeof BindingSchema>;
export declare const KpiPanelSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    query: z.ZodOptional<z.ZodString>;
    bind: z.ZodOptional<z.ZodObject<{
        from: z.ZodString;
        x: z.ZodOptional<z.ZodString>;
        y: z.ZodOptional<z.ZodString>;
        agg: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            sum: "sum";
            avg: "avg";
            count: "count";
            min: "min";
            max: "max";
        }>>>;
        sort: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            asc: "asc";
            desc: "desc";
        }>>>;
        limit: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    w: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    accent: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"kpi">;
    value: z.ZodString;
    format: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
        number: "number";
        raw: "raw";
        date: "date";
        compact: "compact";
        usd: "usd";
        percent: "percent";
        datetime: "datetime";
    }>>>;
    sublabel: z.ZodOptional<z.ZodString>;
    variant: z.ZodOptional<z.ZodEnum<{
        bold: "bold";
        plain: "plain";
        tint: "tint";
    }>>;
}, z.core.$strip>;
export declare const BarPanelSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    query: z.ZodOptional<z.ZodString>;
    bind: z.ZodOptional<z.ZodObject<{
        from: z.ZodString;
        x: z.ZodOptional<z.ZodString>;
        y: z.ZodOptional<z.ZodString>;
        agg: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            sum: "sum";
            avg: "avg";
            count: "count";
            min: "min";
            max: "max";
        }>>>;
        sort: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            asc: "asc";
            desc: "desc";
        }>>>;
        limit: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    w: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    accent: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"bar">;
    x: z.ZodString;
    y: z.ZodString;
    format: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
        number: "number";
        raw: "raw";
        date: "date";
        compact: "compact";
        usd: "usd";
        percent: "percent";
        datetime: "datetime";
    }>>>;
    color: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const LinePanelSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    query: z.ZodOptional<z.ZodString>;
    bind: z.ZodOptional<z.ZodObject<{
        from: z.ZodString;
        x: z.ZodOptional<z.ZodString>;
        y: z.ZodOptional<z.ZodString>;
        agg: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            sum: "sum";
            avg: "avg";
            count: "count";
            min: "min";
            max: "max";
        }>>>;
        sort: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            asc: "asc";
            desc: "desc";
        }>>>;
        limit: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    w: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    accent: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"line">;
    x: z.ZodString;
    y: z.ZodString;
    format: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
        number: "number";
        raw: "raw";
        date: "date";
        compact: "compact";
        usd: "usd";
        percent: "percent";
        datetime: "datetime";
    }>>>;
    color: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const TablePanelSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    query: z.ZodOptional<z.ZodString>;
    bind: z.ZodOptional<z.ZodObject<{
        from: z.ZodString;
        x: z.ZodOptional<z.ZodString>;
        y: z.ZodOptional<z.ZodString>;
        agg: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            sum: "sum";
            avg: "avg";
            count: "count";
            min: "min";
            max: "max";
        }>>>;
        sort: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            asc: "asc";
            desc: "desc";
        }>>>;
        limit: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    w: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    accent: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"table">;
    columnFormats: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodEnum<{
        number: "number";
        raw: "raw";
        date: "date";
        compact: "compact";
        usd: "usd";
        percent: "percent";
        datetime: "datetime";
    }>>>;
    pageSize: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
}, z.core.$strip>;
/**
 * Author/agent HTML + JS with access to the runtime (`ctx.query`, `ctx.el`,
 * `ctx.format`). Contained to one panel.
 */
export declare const CustomPanelSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    query: z.ZodOptional<z.ZodString>;
    bind: z.ZodOptional<z.ZodObject<{
        from: z.ZodString;
        x: z.ZodOptional<z.ZodString>;
        y: z.ZodOptional<z.ZodString>;
        agg: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            sum: "sum";
            avg: "avg";
            count: "count";
            min: "min";
            max: "max";
        }>>>;
        sort: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            asc: "asc";
            desc: "desc";
        }>>>;
        limit: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    w: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    accent: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"custom">;
    html: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    script: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const PanelSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    query: z.ZodOptional<z.ZodString>;
    bind: z.ZodOptional<z.ZodObject<{
        from: z.ZodString;
        x: z.ZodOptional<z.ZodString>;
        y: z.ZodOptional<z.ZodString>;
        agg: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            sum: "sum";
            avg: "avg";
            count: "count";
            min: "min";
            max: "max";
        }>>>;
        sort: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            asc: "asc";
            desc: "desc";
        }>>>;
        limit: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    w: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    accent: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"kpi">;
    value: z.ZodString;
    format: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
        number: "number";
        raw: "raw";
        date: "date";
        compact: "compact";
        usd: "usd";
        percent: "percent";
        datetime: "datetime";
    }>>>;
    sublabel: z.ZodOptional<z.ZodString>;
    variant: z.ZodOptional<z.ZodEnum<{
        bold: "bold";
        plain: "plain";
        tint: "tint";
    }>>;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    query: z.ZodOptional<z.ZodString>;
    bind: z.ZodOptional<z.ZodObject<{
        from: z.ZodString;
        x: z.ZodOptional<z.ZodString>;
        y: z.ZodOptional<z.ZodString>;
        agg: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            sum: "sum";
            avg: "avg";
            count: "count";
            min: "min";
            max: "max";
        }>>>;
        sort: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            asc: "asc";
            desc: "desc";
        }>>>;
        limit: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    w: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    accent: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"bar">;
    x: z.ZodString;
    y: z.ZodString;
    format: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
        number: "number";
        raw: "raw";
        date: "date";
        compact: "compact";
        usd: "usd";
        percent: "percent";
        datetime: "datetime";
    }>>>;
    color: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    query: z.ZodOptional<z.ZodString>;
    bind: z.ZodOptional<z.ZodObject<{
        from: z.ZodString;
        x: z.ZodOptional<z.ZodString>;
        y: z.ZodOptional<z.ZodString>;
        agg: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            sum: "sum";
            avg: "avg";
            count: "count";
            min: "min";
            max: "max";
        }>>>;
        sort: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            asc: "asc";
            desc: "desc";
        }>>>;
        limit: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    w: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    accent: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"line">;
    x: z.ZodString;
    y: z.ZodString;
    format: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
        number: "number";
        raw: "raw";
        date: "date";
        compact: "compact";
        usd: "usd";
        percent: "percent";
        datetime: "datetime";
    }>>>;
    color: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    query: z.ZodOptional<z.ZodString>;
    bind: z.ZodOptional<z.ZodObject<{
        from: z.ZodString;
        x: z.ZodOptional<z.ZodString>;
        y: z.ZodOptional<z.ZodString>;
        agg: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            sum: "sum";
            avg: "avg";
            count: "count";
            min: "min";
            max: "max";
        }>>>;
        sort: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            asc: "asc";
            desc: "desc";
        }>>>;
        limit: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    w: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    accent: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"table">;
    columnFormats: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodEnum<{
        number: "number";
        raw: "raw";
        date: "date";
        compact: "compact";
        usd: "usd";
        percent: "percent";
        datetime: "datetime";
    }>>>;
    pageSize: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    query: z.ZodOptional<z.ZodString>;
    bind: z.ZodOptional<z.ZodObject<{
        from: z.ZodString;
        x: z.ZodOptional<z.ZodString>;
        y: z.ZodOptional<z.ZodString>;
        agg: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            sum: "sum";
            avg: "avg";
            count: "count";
            min: "min";
            max: "max";
        }>>>;
        sort: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            asc: "asc";
            desc: "desc";
        }>>>;
        limit: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    w: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    accent: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"custom">;
    html: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    script: z.ZodOptional<z.ZodString>;
}, z.core.$strip>], "type">;
export type Panel = z.infer<typeof PanelSchema>;
/**
 * The theme an app declares: mode, token overrides, and per-kind variant
 * selections. Token space, variant space, and CSS property mapping live in
 * `theme.ts`; this schema validates what a document may say.
 */
export declare const ThemeSchema: z.ZodObject<{
    mode: z.ZodOptional<z.ZodEnum<{
        dark: "dark";
        light: "light";
    }>>;
    tokens: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodDiscriminatedUnion<[z.ZodObject<{
        $type: z.ZodLiteral<"color">;
        $value: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        $type: z.ZodLiteral<"dimension">;
        $value: z.ZodObject<{
            value: z.ZodNumber;
            unit: z.ZodEnum<{
                px: "px";
                rem: "rem";
            }>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        $type: z.ZodLiteral<"fontFamily">;
        $value: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        $type: z.ZodLiteral<"fontWeight">;
        $value: z.ZodNumber;
    }, z.core.$strip>, z.ZodObject<{
        $type: z.ZodLiteral<"number">;
        $value: z.ZodNumber;
    }, z.core.$strip>, z.ZodObject<{
        $type: z.ZodLiteral<"shadow">;
        $value: z.ZodString;
    }, z.core.$strip>], "$type">>>;
    variants: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, z.core.$strip>;
export type Theme = z.infer<typeof ThemeSchema>;
/**
 * Overall page silhouette (same panels, same data):
 *  - `grid` (default): header + tabs on top, panels below.
 *  - `sidebar`: title + nav in a left rail, panels on the right.
 *  - `hero`: full-width banner header, panels below.
 */
export declare const LayoutSchema: z.ZodEnum<{
    grid: "grid";
    sidebar: "sidebar";
    hero: "hero";
}>;
export type Layout = z.infer<typeof LayoutSchema>;
export declare const AppSpecSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    title: z.ZodString;
    subtitle: z.ZodOptional<z.ZodString>;
    nav: z.ZodOptional<z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        href: z.ZodString;
    }, z.core.$strip>>>;
    layout: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
        grid: "grid";
        sidebar: "sidebar";
        hero: "hero";
    }>>>;
    sources: z.ZodRecord<z.ZodString, z.ZodString>;
    refresh: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    theme: z.ZodOptional<z.ZodObject<{
        mode: z.ZodOptional<z.ZodEnum<{
            dark: "dark";
            light: "light";
        }>>;
        tokens: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodDiscriminatedUnion<[z.ZodObject<{
            $type: z.ZodLiteral<"color">;
            $value: z.ZodString;
        }, z.core.$strip>, z.ZodObject<{
            $type: z.ZodLiteral<"dimension">;
            $value: z.ZodObject<{
                value: z.ZodNumber;
                unit: z.ZodEnum<{
                    px: "px";
                    rem: "rem";
                }>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            $type: z.ZodLiteral<"fontFamily">;
            $value: z.ZodString;
        }, z.core.$strip>, z.ZodObject<{
            $type: z.ZodLiteral<"fontWeight">;
            $value: z.ZodNumber;
        }, z.core.$strip>, z.ZodObject<{
            $type: z.ZodLiteral<"number">;
            $value: z.ZodNumber;
        }, z.core.$strip>, z.ZodObject<{
            $type: z.ZodLiteral<"shadow">;
            $value: z.ZodString;
        }, z.core.$strip>], "$type">>>;
        variants: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, z.core.$strip>>;
    panels: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        title: z.ZodOptional<z.ZodString>;
        query: z.ZodOptional<z.ZodString>;
        bind: z.ZodOptional<z.ZodObject<{
            from: z.ZodString;
            x: z.ZodOptional<z.ZodString>;
            y: z.ZodOptional<z.ZodString>;
            agg: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
                sum: "sum";
                avg: "avg";
                count: "count";
                min: "min";
                max: "max";
            }>>>;
            sort: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
                asc: "asc";
                desc: "desc";
            }>>>;
            limit: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        w: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        accent: z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"kpi">;
        value: z.ZodString;
        format: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            number: "number";
            raw: "raw";
            date: "date";
            compact: "compact";
            usd: "usd";
            percent: "percent";
            datetime: "datetime";
        }>>>;
        sublabel: z.ZodOptional<z.ZodString>;
        variant: z.ZodOptional<z.ZodEnum<{
            bold: "bold";
            plain: "plain";
            tint: "tint";
        }>>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        title: z.ZodOptional<z.ZodString>;
        query: z.ZodOptional<z.ZodString>;
        bind: z.ZodOptional<z.ZodObject<{
            from: z.ZodString;
            x: z.ZodOptional<z.ZodString>;
            y: z.ZodOptional<z.ZodString>;
            agg: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
                sum: "sum";
                avg: "avg";
                count: "count";
                min: "min";
                max: "max";
            }>>>;
            sort: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
                asc: "asc";
                desc: "desc";
            }>>>;
            limit: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        w: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        accent: z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"bar">;
        x: z.ZodString;
        y: z.ZodString;
        format: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            number: "number";
            raw: "raw";
            date: "date";
            compact: "compact";
            usd: "usd";
            percent: "percent";
            datetime: "datetime";
        }>>>;
        color: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        title: z.ZodOptional<z.ZodString>;
        query: z.ZodOptional<z.ZodString>;
        bind: z.ZodOptional<z.ZodObject<{
            from: z.ZodString;
            x: z.ZodOptional<z.ZodString>;
            y: z.ZodOptional<z.ZodString>;
            agg: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
                sum: "sum";
                avg: "avg";
                count: "count";
                min: "min";
                max: "max";
            }>>>;
            sort: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
                asc: "asc";
                desc: "desc";
            }>>>;
            limit: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        w: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        accent: z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"line">;
        x: z.ZodString;
        y: z.ZodString;
        format: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
            number: "number";
            raw: "raw";
            date: "date";
            compact: "compact";
            usd: "usd";
            percent: "percent";
            datetime: "datetime";
        }>>>;
        color: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        title: z.ZodOptional<z.ZodString>;
        query: z.ZodOptional<z.ZodString>;
        bind: z.ZodOptional<z.ZodObject<{
            from: z.ZodString;
            x: z.ZodOptional<z.ZodString>;
            y: z.ZodOptional<z.ZodString>;
            agg: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
                sum: "sum";
                avg: "avg";
                count: "count";
                min: "min";
                max: "max";
            }>>>;
            sort: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
                asc: "asc";
                desc: "desc";
            }>>>;
            limit: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        w: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        accent: z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"table">;
        columnFormats: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodEnum<{
            number: "number";
            raw: "raw";
            date: "date";
            compact: "compact";
            usd: "usd";
            percent: "percent";
            datetime: "datetime";
        }>>>;
        pageSize: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        title: z.ZodOptional<z.ZodString>;
        query: z.ZodOptional<z.ZodString>;
        bind: z.ZodOptional<z.ZodObject<{
            from: z.ZodString;
            x: z.ZodOptional<z.ZodString>;
            y: z.ZodOptional<z.ZodString>;
            agg: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
                sum: "sum";
                avg: "avg";
                count: "count";
                min: "min";
                max: "max";
            }>>>;
            sort: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
                asc: "asc";
                desc: "desc";
            }>>>;
            limit: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        w: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        accent: z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"custom">;
        html: z.ZodOptional<z.ZodDefault<z.ZodString>>;
        script: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>], "type">>;
}, z.core.$strip>;
export type LiveAppSpec = z.infer<typeof AppSpecSchema>;
/** Parse + validate an untrusted spec (e.g. straight from the agent). */
export declare function parseAppSpec(input: unknown): LiveAppSpec;
/** Non-throwing variant for editor/preview flows. */
export declare function safeParseAppSpec(input: unknown): z.ZodSafeParseResult<{
    version: 1;
    title: string;
    sources: Record<string, string>;
    panels: ({
        type: "kpi";
        value: string;
        id?: string | undefined;
        title?: string | undefined;
        query?: string | undefined;
        bind?: {
            from: string;
            x?: string | undefined;
            y?: string | undefined;
            agg?: "sum" | "avg" | "count" | "min" | "max" | undefined;
            sort?: "asc" | "desc" | undefined;
            limit?: number | undefined;
        } | undefined;
        w?: number | undefined;
        accent?: string | undefined;
        format?: "number" | "raw" | "date" | "compact" | "usd" | "percent" | "datetime" | undefined;
        sublabel?: string | undefined;
        variant?: "bold" | "plain" | "tint" | undefined;
    } | {
        type: "bar";
        x: string;
        y: string;
        id?: string | undefined;
        title?: string | undefined;
        query?: string | undefined;
        bind?: {
            from: string;
            x?: string | undefined;
            y?: string | undefined;
            agg?: "sum" | "avg" | "count" | "min" | "max" | undefined;
            sort?: "asc" | "desc" | undefined;
            limit?: number | undefined;
        } | undefined;
        w?: number | undefined;
        accent?: string | undefined;
        format?: "number" | "raw" | "date" | "compact" | "usd" | "percent" | "datetime" | undefined;
        color?: string | undefined;
    } | {
        type: "line";
        x: string;
        y: string;
        id?: string | undefined;
        title?: string | undefined;
        query?: string | undefined;
        bind?: {
            from: string;
            x?: string | undefined;
            y?: string | undefined;
            agg?: "sum" | "avg" | "count" | "min" | "max" | undefined;
            sort?: "asc" | "desc" | undefined;
            limit?: number | undefined;
        } | undefined;
        w?: number | undefined;
        accent?: string | undefined;
        format?: "number" | "raw" | "date" | "compact" | "usd" | "percent" | "datetime" | undefined;
        color?: string | undefined;
    } | {
        type: "table";
        id?: string | undefined;
        title?: string | undefined;
        query?: string | undefined;
        bind?: {
            from: string;
            x?: string | undefined;
            y?: string | undefined;
            agg?: "sum" | "avg" | "count" | "min" | "max" | undefined;
            sort?: "asc" | "desc" | undefined;
            limit?: number | undefined;
        } | undefined;
        w?: number | undefined;
        accent?: string | undefined;
        columnFormats?: Record<string, "number" | "raw" | "date" | "compact" | "usd" | "percent" | "datetime"> | undefined;
        pageSize?: number | undefined;
    } | {
        type: "custom";
        id?: string | undefined;
        title?: string | undefined;
        query?: string | undefined;
        bind?: {
            from: string;
            x?: string | undefined;
            y?: string | undefined;
            agg?: "sum" | "avg" | "count" | "min" | "max" | undefined;
            sort?: "asc" | "desc" | undefined;
            limit?: number | undefined;
        } | undefined;
        w?: number | undefined;
        accent?: string | undefined;
        html?: string | undefined;
        script?: string | undefined;
    })[];
    subtitle?: string | undefined;
    nav?: {
        label: string;
        href: string;
    }[] | undefined;
    layout?: "grid" | "sidebar" | "hero" | undefined;
    refresh?: number | undefined;
    theme?: {
        mode?: "dark" | "light" | undefined;
        tokens?: Record<string, {
            $type: "color";
            $value: string;
        } | {
            $type: "dimension";
            $value: {
                value: number;
                unit: "px" | "rem";
            };
        } | {
            $type: "fontFamily";
            $value: string;
        } | {
            $type: "fontWeight";
            $value: number;
        } | {
            $type: "number";
            $value: number;
        } | {
            $type: "shadow";
            $value: string;
        }> | undefined;
        variants?: Record<string, string> | undefined;
    } | undefined;
}>;
/**
 * Compile a declarative `Binding` into SQL. Always projects/aggregates in
 * DuckDB and applies a bounded LIMIT.
 */
export declare function compileBinding(bind: Binding): string;
/** Resolve the effective SQL for a panel; `query` wins over `bind`. */
export declare function panelSql(panel: Panel): string;

/**
 * Handlebars helpers and misc. utilities.
 * Registered during the `init` hook via registerHelpers().
 */

export function registerHelpers() {
  Handlebars.registerHelper("gwSigned", (n) => {
    const num = Number(n) || 0;
    return num >= 0 ? `+${num}` : `${num}`;
  });

  Handlebars.registerHelper("gwMod", (n) => {
    const num = Number(n) || 0;
    const mod = Math.floor((num - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  });

  Handlebars.registerHelper("gwCapitalize", (s) => {
    if (typeof s !== "string" || s.length === 0) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  });

  Handlebars.registerHelper("gwUpper", (s) => {
    return typeof s === "string" ? s.toUpperCase() : s;
  });

  Handlebars.registerHelper("gwLower", (s) => {
    return typeof s === "string" ? s.toLowerCase() : s;
  });

  /** String concat: {{concat "a" "b" "c"}} → "abc". */
  Handlebars.registerHelper("concat", (...args) => {
    // Last arg is the Handlebars options object; drop it.
    args.pop();
    return args.map(String).join("");
  });

  /** Shallow lookup: {{gwLookup obj key}} */
  Handlebars.registerHelper("gwLookup", (obj, key) => obj?.[key]);

  /** Equality comparator for {{#if (gwEq a b)}}...{{/if}}. */
  Handlebars.registerHelper("gwEq", (a, b) => a === b);

  /** Default-value helper: {{gwDefault value fallback}} returns `fallback`
   *  when `value` is null / undefined. Useful for legacy chat cards
   *  rendered before a context field existed. */
  Handlebars.registerHelper("gwDefault", (value, fallback) =>
    (value === undefined || value === null) ? fallback : value
  );

  /** Boolean negation. */
  Handlebars.registerHelper("gwNot", (v) => !v);

  /** Boolean OR. */
  Handlebars.registerHelper("gwOr", (a, b) => !!(a || b));

  /** Boolean AND — treats empty strings / 0 as falsy like the rest of JS. */
  Handlebars.registerHelper("gwAnd", (a, b) => !!(a && b));

  /** Safe length with 0 default. */
  Handlebars.registerHelper("gwLen", (arr) => arr?.length ?? 0);

  /** Concat with a separator. */
  Handlebars.registerHelper("gwJoin", (arr, sep) =>
    Array.isArray(arr) ? arr.join(sep ?? ", ") : ""
  );
}

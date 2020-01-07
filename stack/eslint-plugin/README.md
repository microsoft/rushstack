# @rushstack/eslint-plugin

This plugin implements supplementary rules for use with the `@rushstack/eslint-config` package,
which provides a TypeScript ESLint ruleset tailored for large teams and projects.
Please see [that project's documentation]([@rushstack/eslint-config](
https://www.npmjs.com/package/@rushstack/eslint-config)) for details.  To learn about Rush Stack,
please visit: [https://rushstack.io/](https://rushstack.io/)

## `@rushstack/no-null`

Prevents usage of JavaScript's `null` keyword.

### Rule Details

Most programming languages have a "null" or "nil" value that serves several purposes:

1. the initial value for an uninitialized variable
2. the value of `x.y` or `x["y"]` when `x` has no such key, and
3. a special token that developers can assign to indicate an unknown or empty state.

In JavaScript, the `undefined` value fulfills all three roles.  JavaScript's `null` value is a redundant secondary
token that only fulfills (3), even though its name confusingly implies otherwise.  The `null` value was arguably
a mistake in the original JavaScript language design, but it cannot be banned entirely because it is returned
by some entrenched system APIs such as `JSON.parse()`, and also some popular NPM packages.  To avoid requiring
lint suppressions when interacting with these legacy APIs, this rule prohibits `null` as a literal value, but not
in type annotations.  Comparisons with `null` are also allowed.  In other words, this rule aims to tolerate
preexisting null values but prevents new ones from being introduced.

### Examples

The following patterns are considered problems when `@rushstack/no-null` is enabled:

```ts
let x = null;  // error

f(null); // error

function g() {
    return null; // error
}
```

The following patterns are NOT considered problems:

```ts
let x: number | null = f(); // declaring types as possibly "null" is okay

if (x === null) {  // comparisons are okay
    x = 0;
}
```

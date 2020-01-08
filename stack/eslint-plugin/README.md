# @rushstack/eslint-plugin

This plugin implements supplementary rules for use with the `@rushstack/eslint-config` package,
which provides a TypeScript ESLint ruleset tailored for large teams and projects.
Please see [that project's documentation](https://www.npmjs.com/package/@rushstack/eslint-config)
for details.  To learn about Rush Stack, please visit: [https://rushstack.io/](https://rushstack.io/)

## `@rushstack/no-null`

Prevent usage of JavaScript's `null` keyword.

#### Rule Details

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

#### Examples

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

## `@rushstack/no-untyped-underscore` (Opt-in)

Prevent TypeScript code from accessing legacy JavaScript members whose name has an underscore prefix.

#### Rule Details

JavaScript does not provide a straightforward way to restrict access to object members, so API names commonly
indicate a private member by using an underscore prefix (e.g. `exampleObject._privateMember`).  For inexperienced
developers who may be unfamiliar with this convention, in TypeScript we can mark the APIs as `private` or omit them
from the typings.  However, when migrating a large code base to TypeScript, it may be difficult to declare types
for every legacy API.  In this situation, the `@rushstack/no-untyped-underscore` rule can help.

This rule detects expressions that access a member with an underscore prefix, EXCEPT in cases where:

- The object is typed:  specifically, `exampleObject` has a TypeScript type that declares `_privateMember`; OR
- The object expression uses: the `this` or `super` keywords; OR
- The object expression is a variable named `that`.  (In older ES5 code, `that` was commonly used as an alias
 for `this` in unbound contexts.)

#### Examples

The following patterns are considered problems when `@rushstack/no-untyped-underscore` is enabled:

```ts
let x: any;
x._privateMember = 123;  // error, because x is untyped

let x: { [key: string]: number };
x._privateMember = 123;  // error, because _privateMember is not a declared member of x's type
```

The following patterns are NOT considered problems:

```ts
let x: { _privateMember: any };
x._privateMember = 123;  // okay, because _privateMember is declared by x's type

let x = { _privateMember: 0 };
x._privateMember = 123;  // okay, because _privateMember is part of the inferred type

enum E {
    _PrivateMember
}
let e: E._PrivateMember = E._PrivateMember; // okay, because _PrivateMember is declared by E
```

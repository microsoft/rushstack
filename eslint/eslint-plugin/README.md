# @rushstack/eslint-plugin

This plugin implements supplementary rules for use with the `@rushstack/eslint-config` package,
which provides a TypeScript ESLint ruleset tailored for large teams and projects.
Please see [that project's documentation](https://www.npmjs.com/package/@rushstack/eslint-config)
for details.  To learn about Rush Stack, please visit: [https://rushstack.io/](https://rushstack.io/)

## `@rushstack/hoist-jest-mock`

Require Jest module mocking APIs to be called before any other statements in their code block.

#### Rule Details

Jest module mocking APIs such as "jest.mock()" must be called before the associated module is imported, otherwise
they will have no effect. Transpilers such as `ts-jest` and `babel-jest` automatically "hoist" these calls, however
this can produce counterintuitive behavior. Instead, the `hoist-jest-mocks` lint rule simply requires developers
to write the statements in the correct order.

The following APIs are affected: 'jest.mock()', 'jest.unmock()', 'jest.enableAutomock()', 'jest.disableAutomock()',
'jest.deepUnmock()'.

For technical background, please read the Jest documentation here: https://jestjs.io/docs/en/es6-class-mocks

#### Examples

The following patterns are considered problems when `@rushstack/hoist-jest-mock` is enabled:

```ts
import * as file from './file'; // import statement
jest.mock('./file'); // error

test("example", () => {
  jest.mock('./file2'); // error
});
```

```ts
require('./file'); // import statement
jest.mock('./file'); // error
```

The following patterns are NOT considered problems:

```ts
jest.mock('./file'); // okay, because mock() precedes the import below
import * as file from './file'; // import statement
```

```ts
// These statements are not real "imports" because they import compile-time types
// without any runtime effects
import type { X } from './file';
let y: typeof import('./file');

jest.mock('./file'); // okay
```

## `@rushstack/typedef-var`

Require explicit type annotations for top-level variable declarations, while exempting local variables within function or method scopes.

#### Rule Details

This rule is implemented to supplement the deprecated `@typescript-eslint/typedef` rule. The `@typescript-eslint/typedef` rule was deprecated based on the judgment that "unnecessary type annotations, where type inference is sufficient, can be cumbersome to maintain and generally reduce code readability."

However, we prioritize code reading and maintenance over code authorship. That is, even when the compiler can infer a type, this rule enforces explicit type annotations to ensure that a code reviewer (e.g., when viewing a GitHub Diff) does not have to rely entirely on inference and can immediately ascertain a variable's type. This approach makes writing code harder but significantly improves the more crucial activity of reading and reviewing code.

Therefore, the `@rushstack/typedef-var` rule enforces type annotations for all variable declarations outside of local function or class method scopes. This includes the module's top-level scope and any block scopes that do not belong to a function or method.

To balance this strictness with code authoring convenience, the rule deliberately relaxes the type annotation requirement for the following local variable declarations:

- Variable declarations within a function body.
- Variable declarations within a class method.
- Variables declared via object or array destructuring assignments.

#### Examples

The following patterns are considered problems when `@rushstack/typedef-var` is enabled:

```ts
// Top-level declarations lack explicit type annotations
const x = 123; // error

let x = 123; // error

var x = 123; // error
```

```ts
// Declaration within a non-function block scope
{
  const x = 123; // error
}
```

The following patterns are NOT considered problems:

```ts
// Local variables inside function expressions are exempt
function f() { const x = 123; } // passes

const f = () => { const x = 123; }; // passes

const f = function() { const x = 123; } // passes
```

```ts
// Local variables inside class methods are exempt
class C {
  public m(): void {
    const x = 123; // passes
  }
}

class C {
  public m = (): void => {
    const x = 123; // passes
  }
}
```

```ts
// Array and Object Destructuring assignments are exempt
let { a, b } = { // passes
  a: 123,
  b: 234
}
```

## `@rushstack/no-new-null`

Prevent usage of the JavaScript `null` value, while allowing code to access existing APIs that
may require `null`.

#### Rule Details

Most programming languages have a "null" or "nil" value that serves several purposes:

1. the initial value for an uninitialized variable
2. the value of `x.y` or `x["y"]` when `x` has no such key, and
3. a special token that developers can assign to indicate an unknown or empty state.

In JavaScript, the `undefined` value fulfills all three roles.  JavaScript's `null` value is a redundant secondary
token that only fulfills (3), even though its name confusingly implies otherwise.  The `null` value was arguably
a mistake in the original JavaScript language design, but it cannot be banned entirely because it is returned
by some entrenched system APIs such as `JSON.parse()`, and also some popular NPM packages.  Thus, this rule aims
to tolerate preexisting `null` values while preventing new ones from being introduced.

The `@rushstack/no-new-null` rule flags type definitions with `null` that can be exported or used by others.
The rule ignores declarations that are local variables, private members, or types that are not exported.

If you are designing a new JSON file format, it's a good idea to avoid `null` entirely.  In most cases
there are better representations that convey more information about an item that is unknown, omitted,
or disabled.  If you do need to declare types for JSON structures containing `null`, rather than
suppressing the lint rule, you can use a specialized
[JsonNull](https://api.rushstack.io/pages/node-core-library.jsonnull/)
type as provided by [@rushstack/node-core-library](https://www.npmjs.com/package/@rushstack/node-core-library).


#### Examples

The following patterns are considered problems when `@rushstack/no-new-null` is enabled:

```ts
// interface declaration with null field
interface IHello { hello: null; } // error

// type declaration with null field
type Hello = { hello: null; } // error

// type function alias
type T = (args: string | null) => void; // error

// type alias
type N = null; // error

// type constructor
type C = {new (args: string | null)} // error

// function declaration with null args
function hello(world: string | null): void {}; // error
function legacy(callback: (err: Error| null) => void): void { }; // error

// function with null return type
function hello(): (err: Error | null) => void {}; // error

// const with null type
const nullType: 'hello' | null = 'hello'; // error

// classes with publicly visible properties and methods
class PublicNulls {
  property: string | null; // error
  propertyFunc: (val: string | null) => void; // error
  legacyImplicitPublic(hello: string | null): void {} // error
  public legacyExplicitPublic(hello: string | null): void {} // error
}
```

The following patterns are NOT considered problems:

```ts
// wrapping an null-API
export function ok(hello: string): void {
  const innerCallback: (err: Error | null) => void = (e) => {}; // passes
  return innerCallback(null);
}

// classes where null APIs are used, but are private-only
class PrivateNulls {
  private pField: string | null; // passes
  private pFunc: (val: string | null) => void; // passes
  private legacyPrivate(hello: string | null): void { // passes
    this.pField = hello;
    this.pFunc(this.pField)
    this.pFunc('hello')
  }
}
```

## `@rushstack/no-null`

(Deprecated) Prevent usage of JavaScript's `null` keyword.

#### Rule Details

This rule has been superseded by `@rushstack/no-new-null`, and is maintained to support code that has not
migrated to the new rule yet. The `@rushstack/no-null` rule prohibits `null` as a literal value, but allows
it in type annotations.  Comparisons with `null` are also allowed.

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

- The object is typed: specifically, `exampleObject` has a TypeScript type that declares `_privateMember`; OR
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


## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/eslint/eslint-plugin/CHANGELOG.md) - Find
  out what's new in the latest version

`@rushstack/eslint-plugin` is part of the [Rush Stack](https://rushstack.io/) family of projects.

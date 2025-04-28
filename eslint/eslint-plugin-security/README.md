# @rushstack/eslint-plugin-security

This plugin implements a collection of security rules for ESLint.

Our ambition is to eventually provide a comprehensive set of recommended security rules for:
- web browser applications
- Node.js tools
- Node.js services

If you would like to request or contribute a new security rule, you are encouraged to
[create a GitHub issue](https://github.com/microsoft/rushstack/issues) in the
[Rush Stack](https://rushstack.io/) monorepo where this project is developed.
Thanks!

## `@rushstack/security/no-unsafe-regexp`

Require regular expressions to be constructed from string constants rather than dynamically
building strings at runtime.

#### Rule Details

Regular expressions should be constructed from string constants. Dynamically building strings at runtime may
introduce security vulnerabilities, performance concerns, and bugs involving incorrect escaping of special characters.

#### Examples

The following patterns are considered problems when `@rushstack/security/no-unsafe-regexp` is enabled:

```ts
function parseRestResponse(request: ICatalogRequest,
  items: ICatalogItem[]): ICatalogItem[] {

  // Security vulnerability: A malicious user could invoke the REST service using a
  // "searchPattern" with a complex RegExp that causes a denial of service.
  const regexp: RegExp = new RegExp(request.searchPattern);
  return items.filter(item => regexp.test(item.title));
}
```

```ts
function hasExtension(filePath: string, extension: string): boolean {
  // Escaping mistake: If the "extension" string contains a special character such as ".",
  // it will be interpreted as a regular expression operator. Correctly escaping an arbitrary
  // string is a nontrivial problem due to RegExp implementation differences, as well as contextual
  // issues (since which characters are special changes inside RegExp nesting constructs).
  // In most cases, this problem is better solved without regular expressions.
  const regexp: RegExp = new RegExp(`\.${extension}$`);
  return regexp.test(filePath);
}
```

The following patterns are NOT considered problems:

```ts
function isInteger(s: string): boolean {
  return /[0-9]+/.test(s);
}
```

```ts
function isInteger(s: string): boolean {
  return new RegExp('[0-9]+').test(s);
}
```

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/eslint/eslint-plugin-security/CHANGELOG.md) - Find
  out what's new in the latest version

`@rushstack/eslint-plugin-security` is part of the [Rush Stack](https://rushstack.io/) family of projects.

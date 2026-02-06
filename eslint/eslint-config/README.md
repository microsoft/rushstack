# @rushstack/eslint-config

A TypeScript ESLint ruleset designed for large teams and projects.

## Philosophy

When you work in a small repo, you spend most of your time writing code.  You know what each file does.  You want lint
rules that keep things concise and won't slow you down.  That's the situation for the 99% of open source projects
that shape popular coding conventions.

But as your organization scales up, things may change.  People come and go.  Projects frequently get handed off between
teams.  Every day, you find yourself working with files that you've never seen before, created by strangers whom
you may never meet.  It's annoying to constantly come across inconsistent styles.  It can be frustrating to decipher
expressions that seem to require a TypeScript Ph.D. -- especially for newcomers and junior contributors.  When
refactoring in bulk, you may edit lots of files without reading them very carefully.  In short, the linting needs
reflect different priorities:

**Small scale:** We can assume developers are _familiar_ with the project.  We want code to be _easy to write_.

**Large scale:** Developers are generally _unfamiliar_ with projects.  Code must be _easy to read_.  If not,
there's a risk of fragmentation, duplication of efforts, and costly rewrites.  (Enabling people to churn out
lots of code really fast is still a goal of course; just not the #1 priority.)

Welcome to the world of [Rush Stack](https://rushstack.io/)!  The `@rushstack/eslint-config` package was specifically
designed around the the requirements of large teams and projects.


## Implementation

- **Monorepo friendly:** The `@rushstack/eslint-config` package has direct dependencies on all the ESLint plugins
  that it needs.  This avoids encumbering each consuming project with the obligation to satisfy a peer dependencies.
  It also ensures that the installed plugin versions were tested for compatibility together.

- **Battle tested:**  The `@rushstack/eslint-config` rules have been vetted on large production monorepos, across
  a broad set of projects, teams, and requirements.  These rules embody a way of working that scales.  Quite
  a lot of discussion and evolution went into them.

- **Designed for Prettier:** The `@rushstack/eslint-config` ruleset is designed to be used together with
  the [Prettier](https://prettier.io/) code formatter.  This separation of workflows avoids hassling developers with
  lint "errors" for frivolous issues like spaces and commas.  Instead, those issues get fixed automatically whenever
  you save or commit a file.  Prettier also avoids frivolous debates: its defaults have already been debated
  at length and adopted by a sizeable community.  No need to reinvent the wheel!

- **Explicit:**  The ruleset does not import any "recommended" templates from other ESLint packages.  This avoids
  worrying about precedence issues due to import order.  It also eliminates confusion caused by files
  overriding/undoing settings from another file.  Each rule is configured once, in one
  [easy-to-read file](https://github.com/microsoft/rushstack/blob/main/eslint/eslint-config/profile/_common.js).

- **Minimal configuration:**  To use this ruleset, your **.eslintrc.js** will need to choose one **"profile"**
  and possibly one or two **"mixins"** that cover special cases.  Beyond that, our goal is to reduce monorepo
  maintenance by providing a small set of **.eslintrc.js** recipes that can be reused across many different projects.
  (This sometimes means that rules will be included which have no effect for a particular project, however in practice
  the installation/execution cost for unused rules turns out to be negligible.)


## Getting started in 3 steps

Applying the ruleset to your project is quick and easy. You install the package, then create an **.eslintrc.js** file
and select an appropriate project profile.  Optionally you can also add some "mixins" to enable additional rules.
Let's walk through those three steps in more detail.

### 1. Install the package

To install the package, do this:

```sh
$ cd your-project-folder
$ npm install --save-dev eslint
$ npm install --save-dev typescript
$ npm install --save-dev @rushstack/eslint-config
```

### 2. Choose one profile

The ruleset currently supports three different "profile" strings, which select lint rules applicable for
your project:

- `@rushstack/eslint-config/profile/node` - This profile enables lint rules intended for a general Node.js project,
  typically a web service.  It enables security rules that assume the service could receive malicious inputs from an
  untrusted user.

- `@rushstack/eslint-config/profile/node-trusted-tool` - This profile enables lint rules intended for a Node.js project
  whose inputs will always come from a developer or other trusted source.  Most build system tasks are like this,
  since they operate exclusively on files prepared by a developer.  This profile disables certain security rules that
  would otherwise prohibit APIs that could cause a denial-of-service by consuming too many resources, or which might
  interact with the filesystem in unsafe ways.  Such activities are safe and commonplace for a trusted tool.
  **DO NOT use this profile for a library project that might also be loaded by a Node.js service.**

- `@rushstack/eslint-config/profile/web-app` - This profile enables lint rules intended for a web application, for
  example security rules that are relevant to web browser APIs such as DOM.
  _Also use this profile if you are creating a library that can be consumed by both Node.js and web applications._

After choosing a profile, create an **.eslintrc.js** config file that provides the NodeJS `__dirname` context
for TypeScript. Add your profile string in the `extends` field, as shown below:

**.eslintrc.js**
```ts
// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('@rushstack/eslint-config/patch/modern-module-resolution');

module.exports = {
  extends: [ "@rushstack/eslint-config/profile/node" ],  // <---- put your profile string here
  parserOptions: { tsconfigRootDir: __dirname }
};
```

The `@rushstack/eslint-config` ruleset is intended to be used with the Prettier code formatter.  For general
instructions on setting that up, please refer to the [Prettier docs](https://prettier.io/docs/en/index.html).
For Rush-specific settings, see the article
[Rush: Enabling Prettier](https://rushjs.io/pages/maintainer/enabling_prettier/).


### 3. Add any relevant mixins

Optionally, you can add some "mixins" to your `extends` array to opt-in to some extra behaviors.

Important: Your **.eslintrc.js** `"extends"` field must load mixins after the profile entry.


#### `@rushstack/eslint-config/mixins/friendly-locals`

Requires explicit type declarations for local variables.

For the first 5 years of Rush, our lint rules required explicit types for most declarations
such as function parameters, function return values, and exported variables.  Although more verbose,
declaring types (instead of relying on type inference) encourages engineers to create interfaces
that inspire discussions about data structure design.  It also makes source files easier
to understand for code reviewers who may be unfamiliar with a particular project.  Once developers get
used to the extra work of declaring types, it turns out to be a surprisingly popular practice.

However in 2020, to make adoption easier for existing projects, this rule was relaxed.  Explicit
type declarations are now optional for local variables (although still required in other contexts).
See [GitHub #2206](https://github.com/microsoft/rushstack/issues/2206) for background.

If you are onboarding a large existing code base, this new default will make adoption easier:

Example source file without `mixins/friendly-locals`:
```ts
export class MyDataService {
  . . .
  public queryResult(provider: IProvider): IResult {
    // Type inference is concise, but what are "item", "index", and "data"?
    const item = provider.getItem(provider.title);
    const index = item.fetchIndex();
    const data = index.get(provider.state);
    return data.results.filter(x => x.title === provider.title);
  }
}
```

On the other hand, if your priority is make source files more friendly for other people to read, you can enable
the `"@rushstack/eslint-config/mixins/friendly-locals"` mixin.  This restores the requirement that local variables
should have explicit type declarations.

Example source file with `mixins/friendly-locals`:
```ts
export class MyDataService {
  . . .
  public queryResult(provider: IProvider): IResult {
    // This is more work for the person writing the code... but definitely easier to understand
    // for a code reviewer if they are unfamiliar with your project
    const item: ISalesReport = provider.getItem(provider.title);
    const index: Map<string, IGeographicData> = item.fetchIndex();
    const data: IGeographicData | undefined = index.get(provider.state);
    return data.results.filter(x => x.title === provider.title);
  }
}
```

Add the mixin to your `"extends"` field like this:

**.eslintrc.js**
```ts
// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('@rushstack/eslint-config/patch/modern-module-resolution');

module.exports = {
  extends: [
    "@rushstack/eslint-config/profile/node",
    "@rushstack/eslint-config/mixins/friendly-locals" // <----
  ],
  parserOptions: { tsconfigRootDir: __dirname }
};
```


#### `@rushstack/eslint-config/mixins/packlets`

Packlets provide a lightweight alternative to NPM packages for organizing source files within a single project.
This system is described in the [@rushstack/eslint-plugin-packlets](https://www.npmjs.com/package/@rushstack/eslint-plugin-packlets)
documentation.

To use packlets, add the mixin to your `"extends"` field like this:

**.eslintrc.js**
```ts
// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('@rushstack/eslint-config/patch/modern-module-resolution');

module.exports = {
  extends: [
    "@rushstack/eslint-config/profile/node",
    "@rushstack/eslint-config/mixins/packlets" // <----
  ],
  parserOptions: { tsconfigRootDir: __dirname }
};
```


#### `@rushstack/eslint-config/mixins/tsdoc`

If your project is using [API Extractor](https://api-extractor.com/) or another tool that uses
the [TSDoc](https://github.com/Microsoft/tsdoc) standard for doc comments, it's recommended to use the
`"@rushstack/eslint-config/mixins/tsdoc"` mixin.  It will enable
[eslint-plugin-tsdoc](https://www.npmjs.com/package/eslint-plugin-tsdoc) validation for TypeScript doc comments.

Add the mixin to your `"extends"` field like this:

**.eslintrc.js**
```ts
// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('@rushstack/eslint-config/patch/modern-module-resolution');

module.exports = {
  extends: [
    "@rushstack/eslint-config/profile/node",
    "@rushstack/eslint-config/mixins/tsdoc" // <----
  ],
  parserOptions: { tsconfigRootDir: __dirname }
};
```


#### `@rushstack/eslint-config/mixins/react`

For projects using the [React](https://reactjs.org/) library, the `"@rushstack/eslint-config/mixins/react"` mixin
enables some recommended additional rules.  These rules are selected via a mixin because they require you to:

- Add `"jsx": "react"` to your **tsconfig.json**
- Configure your `settings.react.version` as shown below.  This determines which React APIs will be considered
  to be deprecated.  (If you omit this, the React version will be detected automatically by
  [loading the entire React library](https://github.com/yannickcr/eslint-plugin-react/blob/4da74518bd78f11c9c6875a159ffbae7d26be693/lib/util/version.js#L23)
  into the linter's process, which is costly.)

Add the mixin to your `"extends"` field like this:

**.eslintrc.js**
```ts
// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('@rushstack/eslint-config/patch/modern-module-resolution');

module.exports = {
  extends: [
    "@rushstack/eslint-config/profile/web-app",
    "@rushstack/eslint-config/mixins/react" // <----
  ],
  parserOptions: { tsconfigRootDir: __dirname },

  settings: {
    react: {
      "version": "16.9" // <----
    }
  }
};
```


#### `@rushstack/eslint-config/mixins/sort-package-json`

This mixin enforces a standardized ordering of properties and alphabetically sorted dependency collections
in `package.json` files.  It leverages the
[eslint-plugin-package-json](https://www.npmjs.com/package/eslint-plugin-package-json) plugin, which provides
autofixable rules for both property ordering (`order-properties`) and collection sorting (`sort-collections`).

Add the mixin to your `"extends"` field like this:

**.eslintrc.js**
```ts
// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('@rushstack/eslint-config/patch/modern-module-resolution');

module.exports = {
  extends: [
    "@rushstack/eslint-config/profile/node",
    "@rushstack/eslint-config/mixins/sort-package-json" // <----
  ],
  parserOptions: { tsconfigRootDir: __dirname }
};
```


## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/eslint/eslint-config/CHANGELOG.md) - Find
  out what's new in the latest version

`@rushstack/eslint-config` is part of the [Rush Stack](https://rushstack.io/) family of projects.

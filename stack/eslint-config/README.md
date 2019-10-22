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

**Small scale:** We can assume developers are *familiar* with the project.  We want code to be *easy to write*.

**Large scale:** Developers are generally *unfamiliar* with projects.  Code must be *easy to read*.  If not,
there's a risk of fragmentation, duplication of efforts, and costly rewrites.

Welcome to the world of [Rush Stack](https://rushstack.io/)!  The `@rushstack/eslint-config` package was specifically
designed around the the requirements of large teams and projects.


## Implementation

- **Monorepo friendly:** The `@rushstack/eslint-config` package has direct dependencies on all the ESLint plugins
  that it needs.  This avoids encumbering each consuming project with a bunch of peer dependencies.  It also ensures
  that the installed plugin versions were tested for compatibility.

- **Explicit:**  The ruleset does not "extend" configs from other ESLint packages.  This avoids worrying about
  precedence issues due to import order.  It also eliminates confusion caused by settings overriding/undoing settings
  from another file.  The [index.js](./index.js) file is a centralized, complete inventory of all rules.

- **Battle tested:**  The `@rushstack/eslint-config` rules have been vetted on large production monorepos.
  The [index.js](./index.js) file includes code comments explaining the rationale behind each rule.

- **Minimal configuration:**  Rather than providing opt-in entry points for different setups, we've rolled most of
  the rules into a single entry point.  When you have hundreds of projects in a monorepo, a unified ruleset avoids
  having to maintain custom **.eslintrc.js** configs for each project.  The extra cost for applying irrelevant
  ESLint rules turns out to be negligible in practice.

- **Designed for Prettier:** The `@rushstack/eslint-config` ruleset is designed to be used with
  the [Prettier](https://prettier.io/) code formatter.  This separation of workflows avoids hassling developers with
  lint "errors" for frivolous issues like spaces and commas.  Instead, those issues get fixed automatically whenever
  you save or commit a file.  Prettier also avoids frivolous debates -- its defaults have already been debated
  at length and adopted by a sizeable community.  No need to reinvent the wheel!


## Usage

To install the package, do this:

```sh
$ cd your-project-folder
$ npm install --save-dev eslint
$ npm install --save-dev typescript
$ npm install --save-dev @rushstack/eslint-config
```

Next, create an **.eslintrc** config file that provides the NodeJS `__dirname` context:

**.eslintrc**
```ts
// This is a workaround for https://github.com/eslint/eslint/issues/3458
require("@rushstack/eslint-config/patch-eslint6");

module.exports = {
  extends: [ "@rushstack/eslint-config" ],
  parserOptions: { tsconfigRootDir: __dirname }
};
```

For projects using React, you'll need a **tsconfig.json** with `"jsx": "react"`.  You also need to configure your
React version, which the lint rules use to determine deprecated APIs.  Specify it like this:

**.eslintrc**
```ts
// This is a workaround for https://github.com/eslint/eslint/issues/3458
require("@rushstack/eslint-config/patch-eslint6");

module.exports = {
  extends: [
    "@rushstack/eslint-config",
    "@rushstack/eslint-config/react"
  ],
  parserOptions: { tsconfigRootDir: __dirname },

  settings: {
    react: {
      "version": "16.9"
    }
  }
};
```

The `@rushstack/eslint-config` ruleset is intended to be used with the Prettier code formatter.  For instructions
on setting that up, please refer to the [Prettier docs](https://prettier.io/docs/en/index.html).


## Learn more

This package is part of the Rush Stack project.  Please visit [https://rushstack.io/](https://rushstack.io/)
for more guidance as well as [help resources](https://rushstack.io/pages/help/support/).

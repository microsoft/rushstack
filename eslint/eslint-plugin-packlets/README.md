# @rushstack/eslint-plugin-packlets

Packlets provide a lightweight alternative to NPM packages for organizing source files within a single project.  The formalism is validated using ESLint rules.

## Motivation

When building a large application, it's a good idea to organize source files into modules, so that their dependencies can be managed.  For example, suppose an application's source files can be grouped as follows:

- `src/logging/*.ts` - the logging system
- `src/data-model/*.ts` - the data model
- `src/reports/*.ts` - the report engine
- `src/*.ts` - other arbitrary files such as startup code and the main application

Using file folders is helpful, but it's not very strict. Files under `src/logging` can easily import files from `/src/reports`, creating a confusing circular import.  They can also import arbitrary application files.  Also, there is no clear distinction between which files are the "public API" for `src/logging` versus its private implementation details.

All these problems can be solved by reorganizing the project into NPM packages (or [Rush projects](https://rushjs.io/)).  Something like this:

- `@my-app/logging` - the logging system
- `@my-app/data-model` - the data model
- `@my-app/reports` - the report engine
- `@my-app/application` - other arbitrary files such as startup code and the main application

However, separating code in this way has some downsides.  The projects need to build separately, which has some tooling costs (for example, "watch mode" now needs to consider multiple projects).  In a large monorepo, the library may attract other consumers, before the API has been fully worked out.

Packlets provide a lightweight alternative that offers many of the same benefits of packages, but without the `package.json` file.  It's a great way to prototype your project organization before later graduating your packlets into proper NPM packages.

## 5 rules for packlets

With packlets, our folders would be reorganized as follows:

- `src/packlets/logging/*.ts` - the logging system
- `src/packlets/data-model/*.ts` - the data model
- `src/packlets/reports/*.ts` - the report engine
- `src/*.ts` - other arbitrary files such as startup code and the main application

The [packlets-tutorial](https://github.com/microsoft/rushstack-samples/tree/main/other/packlets-tutorial) sample project illustrates this layout in full detail.

The basic design can be summarized in 5 rules:

1. A "packlet" is defined to be a folder path `./src/packlets/<packlet-name>/index.ts`. The **index.ts** file will have the exported APIs. The `<packlet-name>` name must consist of lower case words separated by hyphens, similar to an NPM package name.

    Example file paths:
    ```
    src/packlets/controls
    src/packlets/logger
    src/packlets/my-long-name
    ```

    > **NOTE:** The `packlets` cannot be nested deeper in the tree. Like with NPM packages, `src/packlets` is a flat namespace.

2. Files outside the packlet folder can only import the packlet root **index.ts**:

    **src/app/App.ts**
    ```ts
    // Okay
    import { MainReport } from '../packlets/reports';

    // Error: The import statement does not use the packlet's entry point (@rushstack/packlets/mechanics)
    import { MainReport } from '../packlets/reports/index';

    // Error: The import statement does not use the packlet's entry point (@rushstack/packlets/mechanics)
    import { MainReport } from '../packlets/reports/MainReport';
    ```

3. Files inside a packlet folder should import their siblings directly, not via their own **index.ts** (which might create a circular reference):

    **src/packlets/logging/Logger.ts**
    ```ts
    // Okay
    import { MessageType } from "./MessageType";

    // Error: Files under a packlet folder must not import from their own index.ts file (@rushstack/packlets/mechanics)
    import { MessageType } from ".";

    // Error: Files under a packlet folder must not import from their own index.ts file (@rushstack/packlets/mechanics)
    import { MessageType} from "./index";
    ```


4. Packlets may reference other packlets, but not in a way that would introduce a circular dependency:

    **src/packlets/data-model/DataModel.ts**
    ```ts
    // Okay
    import { Logger } from '../../packlets/logging';
    ```

    **src/packlets/logging/Logger.ts**
    ```ts
    // Error: Packlet imports create a circular reference:  (@rushstack/packlets/circular-deps)
    //   "logging" is referenced by src/packlets/data-model/DataModel.ts
    //   "data-model" is referenced by src/packlets/logging/Logger.ts
    import { DataModel } from '../../packlets/data-model';
    ```

5. Other source files are allowed outside the **src/packlets** folder. They may import a packlet, but packlets must only import from other packlets or NPM packages.

    **src/app/App.ts**

    ```ts
    // Okay
    import { MainReport } from '../packlets/reports';
    ```

    **src/packlets/data-model/ExampleModel.ts**
    ```ts
    // Error: A local project file cannot be imported. A packlet's dependencies must be
    // NPM packages and/or other packlets. (@rushstack/packlets/mechanics)
    import { App } from '../../app/App';
    ```


## Getting Started

To enable packlet validation for a simple `typescript-eslint` setup, reference the `@rushstack/eslint-plugin-packlets` project like this:

**\<my-project\>/.eslintrc.js**
```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@rushstack/eslint-plugin-packlets/recommended' // <--- ADD THIS
  ],
  parserOptions: {
    project: './tsconfig.json',
    sourceType: 'module',
    tsconfigRootDir: __dirname
  }
};
```

Or, if you are using the [@rushstack/eslint-config](https://www.npmjs.com/package/@rushstack/eslint-config) ruleset, add the `"packlets"` mixin like this:

**\<my-project\>/.eslintrc.js**
```ts
// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('@rushstack/eslint-config/patch/modern-module-resolution');

module.exports = {
  extends: [
    "@rushstack/eslint-config/profile/node",
    "@rushstack/eslint-config/mixins/packlets" // <--- ADD THIS
  ],
  parserOptions: { tsconfigRootDir: __dirname }
};
```

The `@rushstack/eslint-plugin-packlets` plugin implements three separate rules:

- `@rushstack/packlets/mechanics` - validates most of the import path rules outlined above.
- `@rushstack/packlets/circular-deps` - detects circular dependencies between packlets.  This rule requires an ESLint configuration that enables full type information from the TypeScript compiler.
- `@rushstack/packlets/readme` - requires each packlet to have a README.md file. This rule is disabled by default.

## Requiring a README.md file

If you'd like to require a README.md file in each packlet folder, enable the optional `@rushstack/packlets/readme` rule.

The `minimumReadmeWords` option allows you to specify a minimum number of words of documentation in the README.md file.  The default value is `10` words.

Example configuration with the `@rushstack/packlets/readme` rule enabled:

**\<my-project\>/.eslintrc.js**
```ts
// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('@rushstack/eslint-config/patch/modern-module-resolution');

module.exports = {
  extends: [
    "@rushstack/eslint-config/profile/node",
    "@rushstack/eslint-config/mixins/packlets"
  ],
  parserOptions: { tsconfigRootDir: __dirname },
  overrides: [
    {
      files: ['*.ts', '*.tsx'],

      rules: {
        '@rushstack/packlets/readme': [ // <--- ADD THIS
          'warn',
          { minimumReadmeWords: 10 }
        ]
      }
    }
  ]
};
```

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/stack/eslint-plugin-packlets/CHANGELOG.md) - Find
  out what's new in the latest version
- [@rushstack/eslint-config](https://www.npmjs.com/package/@rushstack/eslint-config) documentation

`@rushstack/eslint-plugin-packlets` is part of the [Rush Stack](https://rushstack.io/) family of projects.
The idea for packlets was originally proposed by [@bartvandenende-wm](https://github.com/bartvandenende-wm)
and [@victor-wm](https://github.com/victor-wm).

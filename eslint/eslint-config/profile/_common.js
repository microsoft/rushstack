// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const macros = require('./_macros');

const namingConventionRuleOptions = [
  {
    // We should be stricter about 'enumMember', but it often functions legitimately as an ad hoc namespace.
    selectors: ['variable', 'enumMember', 'function'],

    format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
    leadingUnderscore: 'allow',

    filter: {
      regex: [
        // This is a special exception for naming patterns that use an underscore to separate two camel-cased
        // parts.  Example:  "checkBox1_onChanged" or "_checkBox1_onChanged"
        '^_?[a-z][a-z0-9]*([A-Z][a-z]?[a-z0-9]*)*_[a-z][a-z0-9]*([A-Z][a-z]?[a-z0-9]*)*$'
      ]
        .map((x) => `(${x})`)
        .join('|'),
      match: false
    }
  },

  {
    selectors: ['parameter'],

    format: ['camelCase'],

    filter: {
      regex: [
        // Silently accept names with a double-underscore prefix; we would like to be more strict about this,
        // pending a fix for https://github.com/typescript-eslint/typescript-eslint/issues/2240
        '^__'
      ]
        .map((x) => `(${x})`)
        .join('|'),
      match: false
    }
  },

  // Genuine properties
  {
    selectors: ['parameterProperty', 'accessor'],
    enforceLeadingUnderscoreWhenPrivate: true,

    format: ['camelCase', 'UPPER_CASE'],

    filter: {
      regex: [
        // Silently accept names with a double-underscore prefix; we would like to be more strict about this,
        // pending a fix for https://github.com/typescript-eslint/typescript-eslint/issues/2240
        '^__',
        // Ignore quoted identifiers such as { "X+Y": 123 }.  Currently @typescript-eslint/naming-convention
        // cannot detect whether an identifier is quoted or not, so we simply assume that it is quoted
        // if-and-only-if it contains characters that require quoting.
        '[^a-zA-Z0-9_]',
        // This is a special exception for naming patterns that use an underscore to separate two camel-cased
        // parts.  Example:  "checkBox1_onChanged" or "_checkBox1_onChanged"
        '^_?[a-z][a-z0-9]*([A-Z][a-z]?[a-z0-9]*)*_[a-z][a-z0-9]*([A-Z][a-z]?[a-z0-9]*)*$'
      ]
        .map((x) => `(${x})`)
        .join('|'),
      match: false
    }
  },

  // Properties that incorrectly match other contexts
  // See issue https://github.com/typescript-eslint/typescript-eslint/issues/2244
  {
    selectors: ['property'],
    enforceLeadingUnderscoreWhenPrivate: true,

    // The @typescript-eslint/naming-convention "property" selector matches cases like this:
    //
    //   someLegacyApiWeCannotChange.invokeMethod({ SomeProperty: 123 });
    //
    // and this:
    //
    //   const { CONSTANT1, CONSTANT2 } = someNamespace.constants;
    //
    // Thus for now "property" is more like a variable than a class member.
    format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
    leadingUnderscore: 'allow',

    filter: {
      regex: [
        // Silently accept names with a double-underscore prefix; we would like to be more strict about this,
        // pending a fix for https://github.com/typescript-eslint/typescript-eslint/issues/2240
        '^__',
        // Ignore quoted identifiers such as { "X+Y": 123 }.  Currently @typescript-eslint/naming-convention
        // cannot detect whether an identifier is quoted or not, so we simply assume that it is quoted
        // if-and-only-if it contains characters that require quoting.
        '[^a-zA-Z0-9_]',
        // This is a special exception for naming patterns that use an underscore to separate two camel-cased
        // parts.  Example:  "checkBox1_onChanged" or "_checkBox1_onChanged"
        '^_?[a-z][a-z0-9]*([A-Z][a-z]?[a-z0-9]*)*_[a-z][a-z0-9]*([A-Z][a-z]?[a-z0-9]*)*$'
      ]
        .map((x) => `(${x})`)
        .join('|'),
      match: false
    }
  },

  {
    selectors: ['method'],
    enforceLeadingUnderscoreWhenPrivate: true,

    // A PascalCase method can arise somewhat legitimately in this way:
    //
    // class MyClass {
    //    public static MyReactButton(props: IButtonProps): JSX.Element {
    //      . . .
    //    }
    // }
    format: ['camelCase', 'PascalCase'],
    leadingUnderscore: 'allow',

    filter: {
      regex: [
        // Silently accept names with a double-underscore prefix; we would like to be more strict about this,
        // pending a fix for https://github.com/typescript-eslint/typescript-eslint/issues/2240
        '^__',
        // This is a special exception for naming patterns that use an underscore to separate two camel-cased
        // parts.  Example:  "checkBox1_onChanged" or "_checkBox1_onChanged"
        '^_?[a-z][a-z0-9]*([A-Z][a-z]?[a-z0-9]*)*_[a-z][a-z0-9]*([A-Z][a-z]?[a-z0-9]*)*$'
      ]
        .map((x) => `(${x})`)
        .join('|'),
      match: false
    }
  },

  // Types should use PascalCase
  {
    // Group selector for: class, interface, typeAlias, enum, typeParameter
    selectors: ['class', 'typeAlias', 'enum', 'typeParameter'],
    format: ['PascalCase'],
    leadingUnderscore: 'allow'
  },

  {
    selectors: ['interface'],

    // It is very common for a class to implement an interface of the same name.
    // For example, the Widget class may implement the IWidget interface.  The "I" prefix
    // avoids the need to invent a separate name such as "AbstractWidget" or "WidgetInterface".
    // In TypeScript it is also common to declare interfaces that are implemented by primitive
    // objects, here the "I" prefix also helps by avoiding spurious conflicts with classes
    // by the same name.
    format: ['PascalCase'],

    custom: {
      regex: '^_?I[A-Z]',
      match: true
    }
  }
];

// Rule severity guidelines
// ------------------------
//
// Errors are generally printed in red, and may prevent other build tasks from running (e.g. unit tests).
// Developers should never ignore errors.  Warnings are generally printed in yellow, and do not block local
// development, although they must be fixed/suppressed before merging.  Developers will commonly ignore warnings
// until their feature is working.
//
// Rules that should be a WARNING:
// - An issue that is very common in partially implemented work (e.g. missing type declaration)
// - An issue that "keeps things nice" but otherwise doesn't affect the meaning of the code (e.g. naming convention)
// - Security rules -- developers may need to temporarily introduce "insecure" expressions while debugging;
//   if our policy forces them to suppress the lint rule, they may forget to reenable it later.
//
// Rules that should be an ERROR:
// - An issue that is very likely to be a typo (e.g. "x = x;")
// - An issue that catches code that is likely to malfunction (e.g. unterminated promise chain)
// - An obsolete language feature that nobody should be using for any good reason

function buildRules(profile) {
  return {
    // After an .eslintrc.js file is loaded, ESLint will normally continue visiting all parent folders
    // to look for other .eslintrc.js files, and also consult a personal file ~/.eslintrc.js.  If any files
    // are found, their options will be merged.  This is difficult for humans to understand, and it will cause
    // nondeterministic behavior if files are loaded from outside the Git working folder.
    //
    // Setting root=true causes ESLint to stop looking for other config files after the first .eslintrc.js
    // is loaded.
    root: true,

    // Disable the parser by default
    parser: '',

    plugins: [
      // Plugin documentation: https://www.npmjs.com/package/@rushstack/eslint-plugin
      '@rushstack/eslint-plugin',
      // Plugin documentation: https://www.npmjs.com/package/@rushstack/eslint-plugin-security
      '@rushstack/eslint-plugin-security',
      // Plugin documentation: https://www.npmjs.com/package/@typescript-eslint/eslint-plugin
      '@typescript-eslint/eslint-plugin',
      // Plugin documentation: https://www.npmjs.com/package/eslint-plugin-promise
      'eslint-plugin-promise'
    ],

    // Manually authored .d.ts files are generally used to describe external APIs that are  not expected
    // to follow our coding conventions.  Linting those files tends to produce a lot of spurious suppressions,
    // so we simply ignore them.
    ignorePatterns: ['*.d.ts'],

    overrides: [
      {
        // Declare an override that applies to TypeScript files only
        files: ['*.ts', '*.tsx'],
        parser: '@typescript-eslint/parser',
        parserOptions: {
          // The "project" path is resolved relative to parserOptions.tsconfigRootDir.
          // Your local .eslintrc.js must specify that parserOptions.tsconfigRootDir=__dirname.
          project: './tsconfig.json',

          // Allow parsing of newer ECMAScript constructs used in TypeScript source code.  Although tsconfig.json
          // may allow only a small subset of ES2018 features, this liberal setting ensures that ESLint will correctly
          // parse whatever is encountered.
          ecmaVersion: 2018,

          sourceType: 'module'
        },

        rules: {
          // ====================================================================
          // CUSTOM RULES
          // ====================================================================

          // The @rushstack rules are documented in the package README:
          // https://www.npmjs.com/package/@rushstack/eslint-plugin

          // RATIONALE:         See the @rushstack/eslint-plugin documentation
          '@rushstack/no-new-null': 'warn',

          // RATIONALE:         See the @rushstack/eslint-plugin documentation
          '@rushstack/typedef-var': 'warn',

          // RATIONALE:         See the @rushstack/eslint-plugin documentation
          //                    This is enabled and classified as an error because it is required when using Heft.
          //                    It's not required when using ts-jest, but still a good practice.
          '@rushstack/hoist-jest-mock': 'error',

          // ====================================================================
          // SECURITY RULES
          // ====================================================================

          // This is disabled for tools because, for example, it is a common and safe practice for a tool
          // to read a RegExp from a config file and use it to filter files paths.
          '@rushstack/security/no-unsafe-regexp': profile === 'node-trusted-tool' ? 'off' : 'warn',

          // ====================================================================
          // GENERAL RULES
          // ====================================================================

          // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
          '@typescript-eslint/adjacent-overload-signatures': 'warn',

          // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
          '@typescript-eslint/no-unsafe-function-type': 'warn',

          // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
          '@typescript-eslint/no-wrapper-object-types': 'warn',

          // RATIONALE:         We require "x as number" instead of "<number>x" to avoid conflicts with JSX.
          '@typescript-eslint/consistent-type-assertions': 'warn',

          // RATIONALE:         We prefer "interface IBlah { x: number }" over "type Blah = { x: number }"
          //                    because code is more readable when it is built from stereotypical forms
          //                    (interfaces, enums, functions, etc.) instead of freeform type algebra.
          '@typescript-eslint/consistent-type-definitions': 'warn',

          // RATIONALE:         Code is more readable when the type of every variable is immediately obvious.
          //                    Even if the compiler may be able to infer a type, this inference will be unavailable
          //                    to a person who is reviewing a GitHub diff.  This rule makes writing code harder,
          //                    but writing code is a much less important activity than reading it.
          //
          // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
          '@typescript-eslint/explicit-function-return-type': [
            'warn',
            {
              allowExpressions: true,
              allowTypedFunctionExpressions: true,
              allowHigherOrderFunctions: false
            }
          ],

          // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
          '@typescript-eslint/explicit-member-accessibility': 'warn',

          // RATIONALE:         Object-oriented programming organizes code into "classes" that associate
          //                    data structures (the class's fields) and the operations performed on those
          //                    data structures (the class's members).  Studying the fields often reveals the "idea"
          //                    behind a class.  The choice of which class a field belongs to may greatly impact
          //                    the code readability and complexity.  Thus, we group the fields prominently at the top
          //                    of the class declaration.  We do NOT enforce sorting based on public/protected/private
          //                    or static/instance, because these designations tend to change as code evolves, and
          //                    reordering methods produces spurious diffs that make PRs hard to read.  For classes
          //                    with lots of methods, alphabetization is probably a more useful secondary ordering.
          '@typescript-eslint/member-ordering': [
            'warn',
            {
              default: 'never',
              classes: ['field', 'constructor', 'method']
            }
          ],

          // NOTE: This new rule replaces several deprecated rules from @typescript-eslint/eslint-plugin@2.3.3:
          //
          // - @typescript-eslint/camelcase
          // - @typescript-eslint/class-name-casing
          // - @typescript-eslint/interface-name-prefix
          // - @typescript-eslint/member-naming
          //
          // Docs: https://github.com/typescript-eslint/typescript-eslint/blob/main/packages/eslint-plugin/docs/rules/naming-convention.md
          '@typescript-eslint/naming-convention': [
            'warn',
            ...macros.expandNamingConventionSelectors(namingConventionRuleOptions)
          ],

          // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
          '@typescript-eslint/no-array-constructor': 'warn',

          // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
          //
          // RATIONALE:         The "any" keyword disables static type checking, the main benefit of using TypeScript.
          //                    This rule should be suppressed only in very special cases such as JSON.stringify()
          //                    where the type really can be anything.  Even if the type is flexible, another type
          //                    may be more appropriate such as "unknown", "{}", or "Record<k,V>".
          '@typescript-eslint/no-explicit-any': 'warn',

          // RATIONALE:         The #1 rule of promises is that every promise chain must be terminated by a catch()
          //                    handler.  Thus wherever a Promise arises, the code must either append a catch handler,
          //                    or else return the object to a caller (who assumes this responsibility).  Unterminated
          //                    promise chains are a serious issue.  Besides causing errors to be silently ignored,
          //                    they can also cause a NodeJS process to terminate unexpectedly.
          '@typescript-eslint/no-floating-promises': [
            'error',
            {
              checkThenables: true
            }
          ],

          // RATIONALE:         Catches a common coding mistake.
          '@typescript-eslint/no-for-in-array': 'error',

          // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
          '@typescript-eslint/no-misused-new': 'error',

          // RATIONALE:         The "namespace" keyword is not recommended for organizing code because JavaScript lacks
          //                    a "using" statement to traverse namespaces.  Nested namespaces prevent certain bundler
          //                    optimizations.  If you are declaring loose functions/variables, it's better to make them
          //                    static members of a class, since classes support property getters and their private
          //                    members are accessible by unit tests.  Also, the exercise of choosing a meaningful
          //                    class name tends to produce more discoverable APIs: for example, search+replacing
          //                    the function "reverse()" is likely to return many false matches, whereas if we always
          //                    write "Text.reverse()" is more unique.  For large scale organization, it's recommended
          //                    to decompose your code into separate NPM packages, which ensures that component
          //                    dependencies are tracked more conscientiously.
          //
          // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
          '@typescript-eslint/no-namespace': [
            'warn',
            {
              // Discourage "namespace" in .ts and .tsx files
              allowDeclarations: false,

              // Allow it in .d.ts files that describe legacy libraries
              allowDefinitionFiles: false
            }
          ],

          // RATIONALE:         Parameter properties provide a shorthand such as "constructor(public title: string)"
          //                    that avoids the effort of declaring "title" as a field.  This TypeScript feature makes
          //                    code easier to write, but arguably sacrifices readability:  In the notes for
          //                    "@typescript-eslint/member-ordering" we pointed out that fields are central to
          //                    a class's design, so we wouldn't want to bury them in a constructor signature
          //                    just to save some typing.
          //
          // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
          '@typescript-eslint/parameter-properties': 'warn',

          // RATIONALE:         When left in shipping code, unused variables often indicate a mistake.  Dead code
          //                    may impact performance.
          //
          // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
          '@typescript-eslint/no-unused-vars': [
            'warn',
            {
              vars: 'all',
              // Unused function arguments often indicate a mistake in JavaScript code.  However in TypeScript code,
              // the compiler catches most of those mistakes, and unused arguments are fairly common for type signatures
              // that are overriding a base class method or implementing an interface.
              args: 'none',
              // Unused error arguments are common and useful for inspection when a debugger is attached.
              caughtErrors: 'none'
            }
          ],

          // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
          '@typescript-eslint/no-use-before-define': [
            'error',
            {
              // Base ESLint options

              // We set functions=false so that functions can be ordered based on exported/local visibility
              // similar to class methods.  Also the base lint rule incorrectly flags a legitimate case like:
              //
              //   function a(n: number): void {
              //     if (n > 0) {
              //       b(n-1); //   lint error
              //     }
              //   }
              //   function b(n: number): void {
              //     if (n > 0) {
              //       a(n-1);
              //     }
              //   }
              functions: false,
              classes: true,
              variables: true,

              // TypeScript extensions

              enums: true,
              typedefs: true
              // ignoreTypeReferences: true
            }
          ],

          // TODO: This is a good rule for web browser apps, but it is commonly needed API for Node.js tools.
          // '@typescript-eslint/no-var-requires': 'error',

          // RATIONALE:         The "module" keyword is deprecated except when describing legacy libraries.
          //
          // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
          '@typescript-eslint/prefer-namespace-keyword': 'warn',

          // RATIONALE:         We require explicit type annotations, even when the compiler could infer the type.
          //                    This can be a controversial policy because it makes code more verbose.  There are
          //                    a couple downsides to type inference, however.  First, it is not always available.
          //                    For example, when reviewing a pull request or examining a Git history, we may see
          //                    code like this:
          //
          //                        // What is the type of "y" here? The compiler knows, but the
          //                        // person reading the code may have no clue.
          //                        const x = f.();
          //                        const y = x.z;
          //
          //                    Second, relying on implicit types also discourages design discussions and documentation.
          //                    Consider this example:
          //
          //                        // Where's the documentation for "correlation" and "inventory"?
          //                        // Where would you even write the TSDoc comments?
          //                        function g() {
          //                          return { correlation: 123, inventory: 'xyz' };
          //                        }
          //
          //                    Implicit types make sense for small scale scenarios, where everyone is familiar with
          //                    the project, and code should be "easy to write".  Explicit types are preferable
          //                    for large scale scenarios, where people regularly work with source files they've never
          //                    seen before, and code should be "easy to read."
          //
          // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
          '@typescript-eslint/typedef': [
            'warn',
            {
              arrayDestructuring: false,
              arrowParameter: false,
              memberVariableDeclaration: true,
              objectDestructuring: false,
              parameter: true,
              propertyDeclaration: true,

              // This case is handled by our "@rushstack/typedef-var" rule
              variableDeclaration: false,

              // Normally we require type declarations for class members.  However, that rule is relaxed
              // for situations where we need to bind the "this" pointer for a callback.  For example, consider
              // this event handler for a React component:
              //
              //     class MyComponent {
              //       public render(): React.ReactNode {
              //          return (
              //            <a href="#" onClick={this._onClick}> click me </a>
              //          );
              //        }
              //
              //        // The assignment here avoids the need for "this._onClick.bind(this)"
              //        private _onClick = (event: React.MouseEvent<HTMLAnchorElement>): void => {
              //          console.log("Clicked! " + this.props.title);
              //        };
              //      }
              //
              // This coding style has limitations and should be used sparingly.  For example, "_onClick"
              // will not participate correctly in "virtual"/"override" inheritance.
              //
              // NOTE: This option affects both "memberVariableDeclaration" and "variableDeclaration" options.
              variableDeclarationIgnoreFunction: true
            }
          ],

          // RATIONALE:         This rule warns if setters are defined without getters, which is probably a mistake.
          'accessor-pairs': 'error',

          // RATIONALE:         In TypeScript, if you write x["y"] instead of x.y, it disables type checking.
          'dot-notation': [
            'warn',
            {
              allowPattern: '^_'
            }
          ],

          // RATIONALE:         Catches code that is likely to be incorrect
          eqeqeq: 'error',

          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'for-direction': 'warn',

          // RATIONALE:         Catches a common coding mistake.
          'guard-for-in': 'error',

          // RATIONALE:         If you have more than 2,000 lines in a single source file, it's probably time
          //                    to split up your code.
          'max-lines': ['warn', { max: 2000 }],

          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-async-promise-executor': 'error',

          // RATIONALE:         "|" and "&" are relatively rare, and are more likely to appear as a mistake when
          //                    someone meant "||" or "&&".  (But nobody types the other operators by mistake.)
          'no-bitwise': [
            'warn',
            {
              allow: [
                '^',
                // "|",
                // "&",
                '<<',
                '>>',
                '>>>',
                '^=',
                // "|=",
                //"&=",
                '<<=',
                '>>=',
                '>>>=',
                '~'
              ]
            }
          ],

          // RATIONALE:         Deprecated language feature.
          'no-caller': 'error',

          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-compare-neg-zero': 'error',

          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-cond-assign': 'error',

          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-constant-condition': 'warn',

          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-control-regex': 'error',

          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-debugger': 'warn',

          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-delete-var': 'error',

          // RATIONALE:         Catches code that is likely to be incorrect
          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-duplicate-case': 'error',

          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-empty': 'warn',

          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-empty-character-class': 'error',

          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-empty-pattern': 'warn',

          // RATIONALE:         Eval is a security concern and a performance concern.
          'no-eval': 'warn',

          // RATIONALE:         Catches code that is likely to be incorrect
          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-ex-assign': 'error',

          // RATIONALE:         System types are global and should not be tampered with in a scalable code base.
          //                    If two different libraries (or two versions of the same library) both try to modify
          //                    a type, only one of them can win.  Polyfills are acceptable because they implement
          //                    a standardized interoperable contract, but polyfills are generally coded in plain
          //                    JavaScript.
          'no-extend-native': 'error',

          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-extra-boolean-cast': 'warn',

          'no-extra-label': 'warn',

          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-fallthrough': 'error',

          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-func-assign': 'warn',

          // RATIONALE:         Catches a common coding mistake.
          'no-implied-eval': 'error',

          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-invalid-regexp': 'error',

          // RATIONALE:         Catches a common coding mistake.
          'no-label-var': 'error',

          // RATIONALE:         Eliminates redundant code.
          'no-lone-blocks': 'warn',

          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-misleading-character-class': 'error',

          // RATIONALE:         Catches a common coding mistake.
          'no-multi-str': 'error',

          // RATIONALE:         It's generally a bad practice to call "new Thing()" without assigning the result to
          //                    a variable.  Either it's part of an awkward expression like "(new Thing()).doSomething()",
          //                    or else implies that the constructor is doing nontrivial computations, which is often
          //                    a poor class design.
          'no-new': 'warn',

          // RATIONALE:         Obsolete language feature that is deprecated.
          'no-new-func': 'error',

          // RATIONALE:         Obsolete language feature that is deprecated.
          'no-new-object': 'error',

          // RATIONALE:         Obsolete notation.
          'no-new-wrappers': 'warn',

          // RATIONALE:         Catches code that is likely to be incorrect
          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-octal': 'error',

          // RATIONALE:         Catches code that is likely to be incorrect
          'no-octal-escape': 'error',

          // RATIONALE:         Catches code that is likely to be incorrect
          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-regex-spaces': 'error',

          // RATIONALE:         Catches a common coding mistake.
          'no-return-assign': 'error',

          // RATIONALE:         Security risk.
          'no-script-url': 'warn',

          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-self-assign': 'error',

          // RATIONALE:         Catches a common coding mistake.
          'no-self-compare': 'error',

          // RATIONALE:         This avoids statements such as "while (a = next(), a && a.length);" that use
          //                    commas to create compound expressions.  In general code is more readable if each
          //                    step is split onto a separate line.  This also makes it easier to set breakpoints
          //                    in the debugger.
          'no-sequences': 'error',

          // RATIONALE:         Catches code that is likely to be incorrect
          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-shadow-restricted-names': 'error',

          // RATIONALE:         Obsolete language feature that is deprecated.
          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-sparse-arrays': 'error',

          // RATIONALE:         Although in theory JavaScript allows any possible data type to be thrown as an exception,
          //                    such flexibility adds pointless complexity, by requiring every catch block to test
          //                    the type of the object that it receives.  Whereas if catch blocks can always assume
          //                    that their object implements the "Error" contract, then the code is simpler, and
          //                    we generally get useful additional information like a call stack.
          'no-throw-literal': 'error',

          // RATIONALE:         Catches a common coding mistake.
          'no-unmodified-loop-condition': 'warn',

          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-unsafe-finally': 'error',

          // RATIONALE:         Catches a common coding mistake.
          'no-unused-expressions': 'warn',

          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-unused-labels': 'warn',

          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-useless-catch': 'warn',

          // RATIONALE:         Avoids a potential performance problem.
          'no-useless-concat': 'warn',

          // RATIONALE:         The "var" keyword is deprecated because of its confusing "hoisting" behavior.
          //                    Always use "let" or "const" instead.
          //
          // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
          'no-var': 'error',

          // RATIONALE:         Generally not needed in modern code.
          'no-void': 'error',

          // RATIONALE:         Obsolete language feature that is deprecated.
          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'no-with': 'error',

          // RATIONALE:         Makes logic easier to understand, since constants always have a known value
          // @typescript-eslint\eslint-plugin\dist\configs\eslint-recommended.js
          'prefer-const': 'warn',

          // RATIONALE:         Catches a common coding mistake where "resolve" and "reject" are confused.
          'promise/param-names': 'error',

          // RATIONALE:         Catches code that is likely to be incorrect
          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'require-atomic-updates': 'error',

          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'require-yield': 'warn',

          // "Use strict" is redundant when using the TypeScript compiler.
          strict: ['error', 'never'],

          // RATIONALE:         Catches code that is likely to be incorrect
          // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
          'use-isnan': 'error'

          // The "no-restricted-syntax" rule is a general purpose pattern matcher that we can use to experiment with
          // new rules.  If a rule works well, we should convert it to a proper rule so it gets its own name
          // for suppressions and documentation.
          // How it works:    https://eslint.org/docs/rules/no-restricted-syntax
          // AST visualizer:  https://astexplorer.net/
          // Debugger:        http://estools.github.io/esquery/
          //
          // "no-restricted-syntax": [
          // ],
        }
      },
      {
        // For unit tests, we can be a little bit less strict.  The settings below revise the
        // defaults specified above.
        files: [
          // Test files
          '*.test.ts',
          '*.test.tsx',
          '*.spec.ts',
          '*.spec.tsx',

          // Facebook convention
          '**/__mocks__/*.ts',
          '**/__mocks__/*.tsx',
          '**/__tests__/*.ts',
          '**/__tests__/*.tsx',

          // Microsoft convention
          '**/test/*.ts',
          '**/test/*.tsx'
        ],
        rules: {
          // Unit tests sometimes use a standalone statement like "new Thing(123);" to test a constructor.
          'no-new': 'off',

          // Jest's mocking API is designed in a way that produces compositional data types that often have
          // no concise description.  Since test code does not ship, and typically does not introduce new
          // concepts or algorithms, the usual arguments for prioritizing readability over writability can be
          // relaxed in this case.
          '@rushstack/typedef-var': 'off',
          '@typescript-eslint/typedef': [
            'warn',
            {
              arrayDestructuring: false,
              arrowParameter: false,
              memberVariableDeclaration: true,
              objectDestructuring: false,
              parameter: true,
              propertyDeclaration: true,
              variableDeclaration: false, // <--- special case for test files
              variableDeclarationIgnoreFunction: true
            }
          ]
        }
      }
    ]
  };
}

exports.buildRules = buildRules;
exports.namingConventionRuleOptions = namingConventionRuleOptions;

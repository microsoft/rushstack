// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

module.exports = {
  // Disable the parser by default
  parser: "",

  plugins: [
    "@rushstack/eslint-plugin",
    "@typescript-eslint/eslint-plugin",
    "eslint-plugin-promise",
    "eslint-plugin-security",
    "eslint-plugin-tsdoc"
  ],

  overrides: [
    {
      // Declare an override that applies to TypeScript files only
      "files": [ "*.ts", "*.tsx" ],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        // The "project" path is resolved relative to parserOptions.tsconfigRootDir.
        // Your local .eslintrc.js must specify that parserOptions.tsconfigRootDir=__dirname.
        project: "./tsconfig.json",

        // Allow parsing of newer ECMAScript constructs used in TypeScript source code.  Although tsconfig.json
        // may allow only a small subset of ES2018 features, this liberal setting ensures that ESLint will correctly
        // parse whatever is encountered.
        ecmaVersion: 2018,

        sourceType: "module"
      },

      rules: {
        // The @rushstack rules are documented in the package README:
        // https://www.npmjs.com/package/@rushstack/eslint-plugin
        "@rushstack/no-null": "error",

        // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
        "@typescript-eslint/adjacent-overload-signatures": "error",

        // RATIONALE:         We require "string[]" (instead of "Array<string>") because it is idiomatic TypeScript.
        //                    We require "ReadonlyArray<string>" (instead of "readonly string[]") because, although
        //                    the latter form is nicer, it is not supported by TypeScript version prior to 3.4.
        //                    It can be expensive to upgrade a large code base to use the latest compiler, so our
        //                    lint rules should not require usage of bleeding edge language features.  In the future
        //                    when TypeScript 3 is obsolete, we'll change this rule to require "readonly string[]".
        "@typescript-eslint/array-type": [
          "error",
          {
            default: "array",
            readonly: "generic"
          }
        ],

        // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
        //
        // CONFIGURATION:     By default, these are banned: String, Boolean, Number, Object, Symbol
        "@typescript-eslint/ban-types": [
          "error",
          {
            types: {
              String: {
                message: "Use 'string' instead",
                fixWith: "string"
              },
              Boolean: {
                message: "Use 'boolean' instead",
                fixWith: "boolean"
              },
              Number: {
                message: "Use 'number' instead",
                fixWith: "number"
              },
              Object: {
                message: "Use 'object' instead, or else define a proper TypeScript type:"
              },
              Symbol: {
                message: "Use 'symbol' instead",
                fixWith: "symbol"
              }
            }
          }
        ],

        // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
        "@typescript-eslint/camelcase": [
          "error",
          {
            // This is a special exception for naming patterns that use an underscore to separate two camel-cased
            // parts.  Example:  "checkBox1_onChanged" or "_checkBox1_onChanged"
            allow: [ "^_?[a-z][a-z0-9]*([A-Z][a-z]?[a-z0-9]*)*_[a-z][a-z0-9]*([A-Z][a-z]?[a-z0-9]*)*$" ]
          }
        ],

        // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
        "@typescript-eslint/class-name-casing": [
          "error",
          {
            "allowUnderscorePrefix": true
          }
        ],

        // RATIONALE:         We require "x as number" instead of "<number>x" to avoid conflicts with JSX.
        "@typescript-eslint/consistent-type-assertions": "error",

        // RATIONALE:         We prefer "interface IBlah { x: number }" over "type Blah = { x: number }"
        //                    because code is more readable when it is built from stereotypical forms
        //                    (interfaces, enums, functions, etc.) instead of freeform type algebra.
        "@typescript-eslint/consistent-type-definitions": "error",

        // RATIONALE:         Code is more readable when the type of every variable is immediately obvious.
        //                    Even if the compiler may be able to infer a type, this inference will be unavailable
        //                    to a person who is reviewing a GitHub diff.  This rule makes writing code harder,
        //                    but writing code is a much less important activity than reading it.
        //
        // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
        "@typescript-eslint/explicit-function-return-type": [
          "error",
          {
            allowExpressions: true,
            allowTypedFunctionExpressions: true,
            allowHigherOrderFunctions: false,
          },
        ],

        // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
        "@typescript-eslint/explicit-member-accessibility": "error",

        // RATIONALE:         It is very common for a class to implement an interface of the same name.
        //                    For example, the Widget class may implement the IWidget interface.  The "I" prefix
        //                    avoids the need to invent a separate name such as "AbstractWidget" or "WidgetInterface".
        //                    In TypeScript it is also common to declare interfaces that are implemented by primitive
        //                    objects, here the "I" prefix also helps by avoiding spurious conflicts with classes
        //                    by the same name.
        //
        "@typescript-eslint/interface-name-prefix": [
          "error",
          {
            "prefixWithI": "always",
            "allowUnderscorePrefix": true
          }
        ],

        // RATIONALE:         Requiring private members to be prefixed with an underscore prevents accidental access
        //                    by scripts that are coded in plain JavaScript and cannot see the TypeScript visibility
        //                    declarations.  Also, using underscore prefixes allows the private field to be exposed
        //                    by a public getter/setter with the same name (but omitting the underscore).
        "@typescript-eslint/member-naming": ["error", { "private": "^_" }],

        // RATIONALE:         Object-oriented programming organizes code into "classes" that associate
        //                    data structures (the class's fields) and the operations performed on those
        //                    data structures (the class's members).  Studying the fields often reveals the "idea"
        //                    behind a class.  The choice of which class a field belongs to may greatly impact
        //                    the code readability and complexity.  Thus, we group the fields prominently at the top
        //                    of the class declaration.  We do NOT enforce sorting based on public/protected/private
        //                    or static/instance, because these designations tend to change as code evolves, and
        //                    reordering methods produces spurious diffs that make PRs hard to read.  For classes
        //                    with lots of methods, alphabetization is probably a more useful secondary ordering.
        "@typescript-eslint/member-ordering": [
          "error",
          {
            "default": "never",
            "classes": [
              "field",
              "constructor",
              "method"
            ]
          }
        ],

        // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
        "@typescript-eslint/no-array-constructor": "error",

        // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
        //
        // RATIONALE:         The "any" keyword disables static type checking, the main benefit of using TypeScript.
        //                    This rule should be suppressed only in very special cases such as JSON.stringify()
        //                    where the type really can be anything.  Even if the type is flexible, another type
        //                    may be more appropriate such as "unknown", "{}", or "Record<k,V>".
        "@typescript-eslint/no-explicit-any": "error",

        // RATIONALE:         The #1 rule of promises is that every promise chain must be terminated by a catch()
        //                    handler.  Thus wherever a Promise arises, the code must either append a catch handler,
        //                    or else return the object to a caller (who assumes this responsibility).  Unterminated
        //                    promise chains are a serious issue.  Besides causing errors to be silently ignored,
        //                    they can also cause a NodeJS process to terminate unexpectedly.
        "@typescript-eslint/no-floating-promises": "error",

        // RATIONALE:         Catches a common coding mistake.
        "@typescript-eslint/no-for-in-array": "error",

        // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
        "@typescript-eslint/no-misused-new": "error",

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
        "@typescript-eslint/no-namespace": [
          "error",
          {
            // Discourage "namespace" in .ts and .tsx files
            "allowDeclarations": false,

            // Allow it in .d.ts files that describe legacy libraries
            "allowDefinitionFiles": false
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
        "@typescript-eslint/no-parameter-properties": "error",

        // RATIONALE:         When left in shipping code, unused variables often indicate a mistake.  Dead code
        //                    may impact performance.
        //
        // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
        "@typescript-eslint/no-unused-vars": [
          "error",
          {
            "vars": "all",
            // Unused function arguments often indicate a mistake in JavaScript code.  However in TypeScript code,
            // the compiler catches most of those mistakes, and unused arguments are fairly common for type signatures
            // that are overriding a base class method or implementing an interface.
            "args": "none"
          }
        ],

        // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
        "@typescript-eslint/no-use-before-define": "error",

        // RATIONALE:         The require() API is generally obsolete.  Use "import" instead.
        //
        // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
        "@typescript-eslint/no-var-requires": "error",

        // RATIONALE:         The "module" keyword is deprecated except when describing legacy libraries.
        //
        // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
        "@typescript-eslint/prefer-namespace-keyword": "error",

        // RATIONALE:         We require explicit type annotations, even when the compiler could infer the type.
        //                    This is a controversial rule because it makes code more verbose.  The reason is that
        //                    type inference is useless when reviewing the diff for a pull request or a Git history.
        //                    Unless the person is already familiar with every file (unlikely in a large project),
        //                    it can be very difficult to guess the types for a typical statement such as
        //                    "let item = provider.fetch(options);".  In this situation, explicit type annotations
        //                    greatly increase readability and justify the extra effort required to write them.
        //                    Requiring type annotations also discourages anonymous type algebra, and code is easier
        //                    to reason about when its authors went through the exercise of choosing meaningful names.
        //
        // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
        "@typescript-eslint/typedef": [
          "error",
          {
            "arrayDestructuring": false,
            "arrowParameter": false,
            "memberVariableDeclaration": true,
            "parameter": true,
            "objectDestructuring": false,
            "propertyDeclaration": true,
            "variableDeclaration": true
          },
        ],

        // RATIONALE:         Catches a common coding mistake.
        "accessor-pairs": "error",

        // RATIONALE:         In TypeScript, if you write x["y"] instead of x.y, it disables type checking.
        "dot-notation": [
          "error",
          {
            "allowPattern": "^_"
          }
        ],

        // RATIONALE:         Catches a common coding mistake.
        "eqeqeq": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "for-direction": "error",

        // RATIONALE:         Catches a common coding mistake.
        "guard-for-in": "error",

        // RATIONALE:         If you have more than 2,000 lines in a single source file, it's probably time
        //                    to split up your code.
        "max-lines": ["error", { "max": 2000 }],

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-async-promise-executor": "error",

        // RATIONALE:         "|" and "&" are relatively rare, and are more likely to appear as a mistake when
        //                    someone meant "||" or "&&".  (But nobody types the other operators by mistake.)
        "no-bitwise": [
          "error",
          {
            allow: [
              "^",
              // "|",
              // "&",
              "<<",
              ">>",
              ">>>",
              "^=",
              // "|=",
              //"&=",
              "<<=",
              ">>=",
              ">>>=",
              "~"
            ]
          }
        ],

        // RATIONALE:         Deprecated language feature.
        "no-caller": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-compare-neg-zero": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-cond-assign": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-constant-condition": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-control-regex": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-debugger": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-delete-var": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-duplicate-case": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-empty": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-empty-character-class": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-empty-pattern": "error",

        // RATIONALE:         Eval is a security concern and a performance concern.
        "no-eval": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-ex-assign": "error",

        // RATIONALE:         System types are global and should not be tampered with in a scalable code base.
        //                    If two different libraries (or two versions of the same library) both try to modify
        //                    a type, only one of them can win.  Polyfills are acceptable because they implement
        //                    a standardized interoperable contract, but polyfills are generally coded in plain
        //                    JavaScript.
        "no-extend-native": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-extra-boolean-cast": "error",

        // RATIONALE:         Catches a common coding mistake.
        "no-extra-label": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-fallthrough": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-func-assign": "error",

        // RATIONALE:         Catches a common coding mistake.
        "no-implied-eval": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-invalid-regexp": "error",

        // RATIONALE:         Catches a common coding mistake.
        "no-label-var": "error",

        // RATIONALE:         Eliminates redundant code.
        "no-lone-blocks": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-misleading-character-class": "error",

        // RATIONALE:         Catches a common coding mistake.
        "no-multi-str": "error",

        // RATIONALE:         It's generally a bad practice to call "new Thing()" without assigning the result to
        //                    a variable.  Either it's part of an awkward expression like "(new Thing()).doSomething()",
        //                    or else implies that the constructor is doing nontrivial computations, which is often
        //                    a poor class design.
        "no-new": "error",

        // RATIONALE:         Obsolete notation that is error-prone.
        "no-new-func": "error",

        // RATIONALE:         Obsolete notation.
        "no-new-object": "error",

        // RATIONALE:         Obsolete notation.
        "no-new-wrappers": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-octal": "error",

        // RATIONALE:         Catches a common coding mistake.
        "no-octal-escape": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-regex-spaces": "error",

        // RATIONALE:         Catches a common coding mistake.
        "no-return-assign": "error",

        // RATIONALE:         Security risk.
        "no-script-url": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-self-assign": "error",

        // RATIONALE:         Catches a common coding mistake.
        "no-self-compare": "error",

        // RATIONALE:         This avoids statements such as "while (a = next(), a && a.length);" that use
        //                    commas to create compound expressions.  In general code is more readable if each
        //                    step is split onto a separate line.  This also makes it easier to set breakpoints
        //                    in the debugger.
        "no-sequences": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-shadow-restricted-names": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-sparse-arrays": "error",

        // RATIONALE:         Although in theory JavaScript allows any possible data type to be thrown as an exception,
        //                    such flexibility adds pointless complexity, by requiring every catch block to test
        //                    the type of the object that it receives.  Whereas if catch blocks can always assume
        //                    that their object implements the "Error" contract, then the code is simpler, and
        //                    we generally get useful additional information like a call stack.
        "no-throw-literal": "error",

        // RATIONALE:         Catches a common coding mistake.
        "no-unmodified-loop-condition": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-unsafe-finally": "error",

        // RATIONALE:         Catches a common coding mistake.
        "no-unused-expressions": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-unused-labels": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-useless-catch": "error",

        // RATIONALE:         Avoids a potential performance problem.
        "no-useless-concat": "error",

        // RATIONALE:         The "var" keyword is deprecated because of its confusing "hoisting" behavior.
        //                    Always use "let" or "const" instead.
        //
        // STANDARDIZED BY:   @typescript-eslint\eslint-plugin\dist\configs\recommended.json
        "no-var": "error",

        // RATIONALE:         Generally not needed in modern code.
        "no-void": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "no-with": "error",

        // @typescript-eslint\eslint-plugin\dist\configs\eslint-recommended.js
        "prefer-const": "error",

        // RATIONALE:         Catches a common coding mistake where "resolve" and "reject" are confused.
        "promise/param-names": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "require-atomic-updates": "error",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "require-yield": "error",

        // "Use strict" is redundant when using the TypeScript compiler.
        "strict": ["error", "never"],

        // We're still experimenting with this plugin, so for now it is off by default.
        "tsdoc/syntax": "off",

        // STANDARDIZED BY:   eslint\conf\eslint-recommended.js
        "use-isnan": "error",

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
    }
  ]
};

# @rushstack/heft

> 🚨 *The Heft project is still in early preview. Please report any issues that you encounter.* 🚨

![heft](https://github.com/microsoft/rushstack/blob/master/common/wiki-images/heft-300x120.png?raw=true)

Heft is an extensible build system designed for use with the [Rush Stack](https://rushstack.io/) family of tools.
You don't need a monorepo to use Heft, though.  It also works well for small standalone projects.  Compared to
other similar systems, Heft has some unique design goals:

- **Scalable**: Heft is designed to interface with the [Rush](https://rushjs.io) build orchestrator which is
  optimized for large monorepos with many people and projects.  (Usage of Rush is optional.)

- **Familiar**: Heft is a plain Node.js application, so developers won't need to install any native prerequisites
  such as Python, MSYS2, or the .NET Framework.  Heft's source code is easy to understand and debug because everything
  is 100% TypeScript, the same programming language as your web projects.  Developing for native targets is also
  supported, of course.

- **Polished and Complete**: Philosophically, Rush Stack aspires to provide a functionally complete toolkit with
  a professional developer experience.  Pluggable task abstractions actually work against this goal:
  It's expensive to support and optimize (and document!) every possible combination of pieces.  Also, the best
  optimizations rely heavily on assumptions about what's behind the abstraction.  (As one example, sharing
  compiler state with the linter requires fairly different strategies for ESLint versus TSLint.)  Heft is customizable,
  but our focus is to invest deeply in one recommended approach that everyone can use.

- **Extensible**: Most large projects require specialized additional tooling such as preprocessors, postprocessors,
  instrumentation, and reporting.  Heft allows you to write your own plugins using the
  [tapable](https://www.npmjs.com/package/tapable) hook system (familiar from Webpack).  Compared to loose
  architectures such as Grunt or Gulp, Heft ships a standardized set of stages for custom tasks to hook into.
  Working from a more standardized foundation makes custom rigs more understandable for newcomers.

- **Optimized**: Heft tracks fine-grained performance metrics at each step.  Although Heft is still in its
  early stages, it already implements optimizations such as: incremental compilation, symlinking of cache files
  to avoid copying, reuse of compiler state across multiple emit targets, and a single compiler pass for
  Jest and Webpack.

Heft is still in preview and has not officially shipped yet.  The following tasks are already available:

- **Compiler**: [TypeScript](https://www.typescriptlang.org/) with incremental compilation, with "watch" mode
- **Linter**: [TypeScript-ESLint](https://github.com/typescript-eslint/typescript-eslint), plus legacy support
  for projects that still use [TSLint](https://palantir.github.io/tslint/)
- **Test runner**: [Jest](https://www.npmjs.com/package/jest)
- **Bundler**: [Webpack](https://webpack.js.org/), with "watch" mode
- **.d.ts bundler**: [API Extractor](https://api-extractor.com/)
- **Asset management**: Heft also includes a `copy-static-assets` helper supporting arbitrary globs, with "watch" mode

For documentation and support, please see the [Heft topic](https://rushstack.io/pages/heft/overview/) on
the Rush Stack website.

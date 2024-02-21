# @rushstack/heft

<div>
  <br />
  <a href="https://rushstack.io/pages/heft/overview/">
    <img width="380" src="https://rushstack.io/images/heft-logo-horse.svg">
  </a>
  <p />
</div>

<!-- ----------------------------------------------------------------------- -->
<!-- Text below this line should stay in sync with the Heft web site content -->
<!-- ----------------------------------------------------------------------- -->

Heft is a config-driven toolchain that invokes other popular tools such as TypeScript, ESLint, Jest, Webpack,
and API Extractor. You can use it to build web applications, Node.js services, command-line tools, libraries,
and more. Heft builds all your JavaScript projects the same way: A way that works.

Heft is typically launched by **package.json** commands such as `"npm run build"` or `"npm run test"`. It's designed
for use in a monorepo with potentially hundreds of projects, where the [Rush](https://rushjs.io/) orchestrator invokes
these commands separately in each project folder. In this situation, everything must execute as fast as possible.
Special purpose scripts become a headache to maintain, so it's better to replace them with a reusable engine that's
driven by config files. In a large repo, you'll want to minimize duplication of these config files across projects.
Ultimately, you'll want to define a small set of stereotypical project types
(["rigs"](https://rushstack.io/pages/heft/rig_packages/)) to officially support, then discourage projects from
overriding the rig configuration. Being consistent ensures that any person can easily contribute to any project.
Heft is a ready-made implementation of all these concepts.

You don't need a monorepo to use Heft, however. It also works well for small standalone projects. Compared to other
similar systems, Heft has some unique design goals:

- **Scalable**: Heft interfaces with the [Rush Stack](https://rushstack.io/) family of tools, which are tailored
  for large monorepos with many people and projects. Heft doesn't require Rush, though.

- **Optimized**: Heft tracks fine-grained performance metrics at each step. The TypeScript plugin implements
  sophisticated optimizations such as: filesystem caching, incremental compilation, simultaneous multi-target emit,
  and a unified compiler pass for Jest/Webpack/ESLint. JSON config files and plugin manifests enable fast
  querying of metadata without evaluating potentially inefficient script code.

- **Complete**: Rush Stack aspires to establish a fully worked out solution for building typical TypeScript
  projects. Unopinionated task abstractions often work against this goal: It is expensive to optimize and support
  (and document!) every possible cocktail of tech choices. The best optimizations and integrations
  make deep assumptions about how tasks will interact. Although the Heft engine itself is very flexible,
  our philosophy is to agree on a standard approach that covers a broad range of scenarios, then invest in
  making the best possible experience for that approach.

- **Extensible**: Most projects require at least a few specialized tasks such as preprocessors, postprocessors,
  or loaders. Heft is organized around plugins using the [tapable](https://www.npmjs.com/package/tapable)
  hook system (familiar from Webpack). Strongly typed APIs make it easy to write your own plugins. Compared to
  loose architectures such as Grunt or Gulp, Heft's plugin-system is organized around explicit easy-to-read
  config files. Customizations generally will extend a standard rig rather than starting from scratch.

- **Familiar**: Like Rush, Heft is a regular Node.js application -- developers don't need to install native
  prerequisites such as Python, MSYS2, or the .NET Framework. Heft's source code is easy to understand and debug
  because it's 100% TypeScript, the same programming language as your web projects. Developing for native targets
  is still possible, of course.

- **Professional**: The Rush Stack projects are developed by and for engineers who ship large scale commercial
  apps. Each feature is designed, discussed in the open, and thoughtfully code reviewed. Breaking changes
  require us to migrate thousands of our own projects, so upgrades are relatively painless compared to typical
  Node.js tooling.

<!-- ----------------------------------------------------------------------- -->
<!-- Text above this line should stay in sync with the Heft web site content -->
<!-- ----------------------------------------------------------------------- -->

Heft has not yet reached its 1.0 milestone, however the following tasks are already available:

- **Compiler**: [TypeScript](https://www.typescriptlang.org/) with incremental compilation, with "watch" mode
- **Linter**: [TypeScript-ESLint](https://github.com/typescript-eslint/typescript-eslint), plus legacy support
  for projects that still use [TSLint](https://palantir.github.io/tslint/)
- **Test runner**: [Jest](https://www.npmjs.com/package/jest)
- **Bundler**: [Webpack](https://webpack.js.org/), including`webpack-dev-server` with watch mode
- **.d.ts bundler**: [API Extractor](https://api-extractor.com/)
- **Asset management**: Heft also includes a `copy-static-assets` helper supporting arbitrary globs, with "watch" mode

For more detailed documentation, please see the [Heft topic](https://rushstack.io/pages/heft/overview/) on
the Rush Stack website.

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/apps/heft/CHANGELOG.md) - Find
  out what's new in the latest version
- [UPGRADING.md](
  https://github.com/microsoft/rushstack/blob/main/apps/heft/UPGRADING.md) - Instructions
  for migrating existing projects to use a newer version of Heft
- [API Reference](https://api.rushstack.io/pages/heft/)

Heft is part of the [Rush Stack](https://rushstack.io/) family of projects.

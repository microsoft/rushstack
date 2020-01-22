# @microsoft/rush-stack

**Rush Stack** is a work in progress to create a reusable toolchain that can be shared by many
different TypeScript projects in a [Rush](https://rushjs.io) monorepo.  **Rush** itself is flexible
and doesn't impose any limitations for how a project is built.  But this flexibility comes at a cost:
When developers choose popular tools and write a script to invoke them, they often quickly
find themselves invested in a nontrivial tooling project, with a growing backlog of requests to
improve the developer experience, performance, scalability, and so forth.  **Rush Stack** aims to
eliminate this hassle, by providing a complete and professional solution for all the common problems such as:

- compiling
- linting
- localization
- *.js bundling and *.d.ts rollups
- live debugging (with hot module replacement)
- unit tests
- publishing
- documentation

**Rush Stack** is a collaboration between various stakeholders in the Rush community,
with the following common goals:

- **complete solution**: Rush Stack will support customization and extensibility, but the out-of-box configuration will aim to handle all the most common JavaScript development scenarios (e.g. 80% of projects in an enterprise monorepo)
- **opinionated approach**: We will bet on specific components (e.g. webpack, Jest, etc) with proven records.
- **integrated solution**: We'll leverage these bets to ensure that the components integrate properly, and "go deep" to ensure the best possible developer experience.
- **open architecture**: Whereas previous approaches attempted to encapsulate components behind "task" abstractions that would be easier to use in theory, the **Rush Stack** architecture aims to be easy to understand, easy to debug, and easy to contribute fixes to.
- **performance tracking**: The toolchain will provide fine-grained diagnostics for tracking build execution and bundle sizes.
- **multi-phase builds**: The build process will have formalized stages for compiling, type-checking, bundling, unit-tests, which allows downstream projects to start building before upstream projects complete their later stages
- **multi-machine builds**: Rush Stack will provide a standardized model for sharding builds across multiple VMs.
- **standardized layouts**: We hope to simplify the onboarding experience when starting with any monorepo that uses Rush Stack, by establishing familiar directory structures and naming conventions.

## Project Status

**Rush Stack** is still in its early phases.  If you'd like to participate, please [open an issue](https://github.com/microsoft/rushstack/issues) or join the [rushstack Gitter community](https://gitter.im/rushstack/rushstack).

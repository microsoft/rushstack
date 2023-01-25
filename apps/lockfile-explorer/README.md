# @rushstack/lockfile-explorer

<div>
  <br />
  <a href="https://lfx.rushstack.io/">
    <img width="380" alt="Rush Lockfile Explorer" src="https://lfx.rushstack.io/images/site/lockfile-explorer.svg">
  </a>
  <p />
</div>

**Rush Lockfile Explorer** helps you investigate and solve version conflicts when working in a monorepo
that uses the [PNPM package manager](https://pnpm.io/). It's designed for the [Rush](https://rushjs.io)
build orchestrator, but you can also use it to analyze a standalone PNPM workspace without Rush.

Lockfile Explorer helps with problems such as:

- Understanding why multiple versions of an NPM package are appearing in your `node_modules` folder
- Tracing dependencies to determine which project caused an NPM package to be installed
- Finding and eliminating "doppelgangers" (multiple installations of the same version
  of the same package)
- Troubleshooting problems involving peer dependencies

> This project is a new idea whose design is still evolving.
> Please provide feedback by
> [creating a GitHub issue](https://github.com/microsoft/rushstack/issues/new/choose)
> or posting in the Rush Stack
> [Zulip chat room](https://rushstack.zulipchat.com/). Thank you!

## Usage

Here's how to invoke the **Rush Lockfile Explorer** tool:

```bash
# Install the NPM package globally.
#
# (You could substitute "pnpm" or "yarn" instead of "npm" here.  To avoid confusing
# duplicate installs, always use the same tool for global installations!)
npm install -g @rushstack/lockfile-explorer

# Go to your monorepo folder
cd my-rush-repo

# Run "rush install" to ensure common/temp/node_modules is up to date.
# (If your monorepo is using PNPM without Rush, substitute "pnpm install" for this step.)
rush install

# Launch the Lockfile Explorer command line interface (CLI).
# It expects to find a Rush/PNPM workspace in your shell's current working directory.
# As a shorthand, the "lfx" alias can be used here instead of "lockfile-explorer".
lockfile-explorer
```

The CLI will start a Node.js service on `http://localhost/` and launch your default web browser:

<img width="800" alt="screenshot" src="https://lfx.rushstack.io/images/site/readme-screenshot.png"><br/>
_Lockfile Explorer main window_

## How it works

The web app will expect to find a Rush/PNPM workspace in the current working directory where
the `lockfile-explorer` command was invoked. It will read files such as:

- **common/config/rush/pnpm-lock.yaml** - the PNPM lockfile for your monorepo
- **common/config/rush/.pnpmfile.cjs** - which transforms **package.json** files during installation
- The **package.json** files for your local workspace projects
- The **package.json** files for external packages installed in the `node_modules` folders.

## Links

- [Documentation and tutorials](https://lfx.rushstack.io/) on the Lockfile Explorer project website
- [CHANGELOG.md](https://github.com/microsoft/rushstack/blob/main/apps/lockfile-explorer/CHANGELOG.md) - Find
  out what's new in the latest version
- [@rushstack/trace-import](https://www.npmjs.com/package/@rushstack/trace-import) -
  a command-line tool for troubleshooting how modules are resolved by `import` and `require()`

Rush Lockfile Explorer is part of the [Rush Stack](https://rushstack.io/) family of projects.

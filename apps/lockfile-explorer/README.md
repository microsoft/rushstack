# @rushstack/lockfile-explorer

<div>
  <br />
  <a href="https://rushstack.io/">
    <img width="380" alt="Rush Lockfile Explorer" src="https://rushstack.io/images/lockfile-explorer.svg">
  </a>
  <p />
</div>

> 🚨 *EARLY PREVIEW RELEASE* 🚨
>
> Not all features are implemented yet.  Please provide feedback by commenting
> on the [Design Proposal](https://github.com/microsoft/rushstack/issues/3695)
> or creating a GitHub issue. Thanks!

**Rush Lockfile Explorer** helps you investigate and solve version conflicts when working
in a [Rush](https://rushjs.io) monorepo using the [PNPM package manager](https://pnpm.io/).

Typical use cases:

- After `rush update`, the app is reporting errors caused by duplicate instances of
  a singleton object, probably introduced by a
  [peer dependency doppelganger](https://rushjs.io/pages/advanced/npm_doppelgangers/)
  -- how to find the likely culprits?

- After `rush update`, the app's bundle size has increased significantly due to
  side-by-side versions -- how to find which packages have extra versions?

- When you identify the problematic package, it is an obscure indirect dependency of
  your middleware -- how to work backwards in the dependency graph to determine which
  **package.json** files should be patched in **.pnpmfile.cjs**?

- Your project's installation footprint is unusually large because it has picked up
  a lot of extra NPM dependencies that seem unnecessary, however `rush-pnpm why` prints
  thousands of lines of output. How to filter this report to see the important
  relationships?


## Usage

```bash
# Install the NPM package globally:
npm install -g @rushstack/lockfile-explorer

# Go to your monorepo folder
cd my-rush-repo

# Run "rush install" to ensure common/temp/node_modules is up to date
rush install

# Launch the Lockfile Explorer command line interface (CLI).
# It expects to find a Rush workspace in your shell's current working directory.
lockfile-explorer
```

The CLI will start a Node.js service on `http://localhost/` and try to launch your default web browser:

<img width="800" alt="screenshot" src="https://rushstack.io/images/lockfile-explorer/screenshot.png"><br/>
*Lockfile Explorer main window*


## How it works

The web app will expect to find a Rush workspace in the current working directory where the `lockfile-explorer`
command was invoked.  It will read files such as:

- **common/config/rush/pnpm-lock.yaml** - the PNPM lockfile for your monorepo
- **common/config/rush/.pnpmfile.cjs** - which transforms **package.json** files during installation
- The **package.json** files for your Rush projects
- The **package.json** files for packages installed under


## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/apps/lockfile-explorer/CHANGELOG.md) - Find
  out what's new in the latest version

Rush Lockfile Explorer is part of the [Rush Stack](https://rushstack.io/) family of projects.

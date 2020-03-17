# @microsoft/rush


![rush](https://github.com/microsoft/rushstack/blob/master/common/wiki-images/rush-logo.png?raw=true)
<br />
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; https://rushjs.io

<!-- ------------------------------------------------------------------ -->
<!-- Text below this line should stay in sync with the web site content -->
<!-- ------------------------------------------------------------------ -->

**Rush** makes life easier for JavaScript developers who build and publish many NPM packages at once.  If you're looking to consolidate all your projects into a single repo, you came to the right place!  Rush is a fast, professional solution for managing this scenario.  It gives you:

- **A single NPM install:** In one step, Rush installs all the dependencies for all your projects into a common folder.  This is not just a "package.json" file at the root of your repo (which might set you up to accidentally `require()` a sibling's dependencies).  Instead, Rush uses symlinks to reconstruct an accurate "node_modules" folder for each project, without any of the limitations or glitches that seem to plague other approaches.

  ⏵ **This algorithm supports the [PNPM, NPM, and Yarn](https://rushjs.io/pages/maintainer/package_managers/) package managers.**

- **Automatic local linking:** Inside a Rush repo, all your projects are automatically symlinked to each other. When you make a change, you can see the downstream effects without publishing anything, and without any `npm link` headaches.  If you don't want certain projects to get linked, that's supported, too.

- **Fast builds:** Rush detects your dependency graph and builds your projects in the right order.  If two packages don't directly depend on each other, Rush parallelizes their build as separate Node.js processes (and shows live console output in a [readable order](https://www.npmjs.com/package/@rushstack/stream-collator)).  In practice this multi-process approach can yield more significant speedups than all those async functions in your single-threaded Gulpfile.

- **Subset and incremental builds:** If you only plan to work with a few projects from your repo, `rush rebuild --to <project>` does a clean build of just your upstream dependencies.  After you make changes, `rush rebuild --from <project>` does a clean build of only the affected downstream projects.  And if your toolchain is [package-deps-hash](https://www.npmjs.com/package/@rushstack/package-deps-hash) enabled, `rush build` delivers a powerful cross-project incremental build (that also supports subset builds).

- **Cyclic dependencies:** If you have hammers that build hammer-factory-factories, Rush has you covered!  When a package indirectly depends on an older version of itself, projects in the cycle use the last published version, whereas other projects still get the latest bits.

- **Bulk publishing:** When it's time to do a release, Rush can detect which packages have changes, automatically bump all the appropriate version numbers, and run `npm publish` in each folder.  If you like, configure your server to automatically run `rush publish` every hour.

- **Changelog tracking:** Whenever a PR is created, you can require developers to provide a major/minor/patch log entry for the affected projects.  During publishing, these changes will be automatically aggregated into a nicely formatted [CHANGELOG.md](https://github.com/microsoft/rushstack/blob/master/libraries/node-core-library/CHANGELOG.md) file.

- **Enterprise policies:** Want to review new libraries before developers add them to package.json, but avoid hassling people about already approved cases?  Want to enforce that all your projects depend on the same library version numbers?  Are unprofessional personal e-mail addresses accidentally showing up in your company's Git history?  Rush can help maintain a consistent ecosystem when you've got many developers and many projects in the mix.

- **Lots more!** Rush was created by the platform team for [Microsoft SharePoint](http://aka.ms/spfx).  We build hundreds of production NPM packages every day, from internal and public Git repositories, for third party SDKs and live services with millions of users.  If there's an important package management problem that needs solvin', it's likely to end up as a feature for Rush.


# 3 Minute Demo

See Rush in action!  From your shell, install the tool like this:
```
$ npm install -g @microsoft/rush
```

For command-line help, do this:
```
$ rush -h
```

To see Rush build some real projects, try running these commands:  :-)
```
$ git clone https://github.com/microsoft/rushstack
$ cd rushstack
$ rush install
$ rush install  # <-- instantaneous!
$ rush rebuild
$ rush build    # <-- instantaneous!
```
_(If you don't have a GitHub account set up, you can use `rush install --bypass-policy`.)_


<!-- ------------------------------------------------------------------ -->
<!-- Text above this line should stay in sync with the web site content -->
<!-- ------------------------------------------------------------------ -->

# Getting Started

For more details and support resources, please visit: https://rushjs.io

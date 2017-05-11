# rush

## Why Rush?
A typical web project may consume hundreds of NPM packages, each developed
independently by a random stranger somewhere on the internet.  Each project
has its own Git repository, is conceptually self-contained, and tries to
maintain an API contract conforming to [SemVer](http://semver.org/).  When
there is a bug in one of these packages, a pull request is merged, the version
is bumped, and a new release is published.  The new release then begins a
slow propagation across the internet, as each downstream project upgrades
and reacts to any incompatibilities that may arise in a delightful symphony
of distributed collaboration.

At the root of this massive dependency tree is your client-side web application.
Unlike everything else, it is one huge monolith.  The bigger it grows,
the more you begin to think "This is stupid -- we should break this thing up
into 30 small NPM packages that can be reused and versioned independently."
One heroic Saturday night, you create 30 Git repos and refactor everything.

Eventually people start complaining.  Your team isn't 30 strangers making
frivolous little "left-pad" utilities.  They are application developers
creating a mission-critical product with messy business logic.  The components
interact in complex ways, and every time you change one package, you seem
to be breaking other packages.  It feels wrong to be cloning and building
30 different Git repositories every day, when there's only 10 people on your team.
Publishing is getting tedious.  Running "npm link" is a minefield.  This is no
way to work!

And so, you consolidate all your NPM packages into one central Git repository, and
write a script that runs "npm install", "npm link", and "gulp" 30 times, in the
right order.  This is way better!  In the past, when Bob made a big change to a
core library and then left for a backpacking trip across Europe, it could take
a week for Alice to upgrade to the new version and realize that something was broken.
Even though Bob caused the trouble, his victims unfairly had to shoulder the cost
of debugging it.  Having a unified build means that Bob _cannot even merge his PR_
(let alone publish a new release) without passing all the unit tests for every
downstream project.  Catching problems early makes everyone more efficient.
Having a central repository forces library owners pay attention to the source code
and PRs that consume their APIs; no more "out of sight, out of mind."

There is just one problem...  Builds are slowwwww.  If "npm install" takes
1 minute (on a good day), then 30 installs take 30 minutes.  Building 30 small projects
is slower than building one big project.  Other details like managing
[shrinkwrap](https://docs.npmjs.com/cli/shrinkwrap) and publishing can be tricky.

## Rush is here to help!

Rush formalizes this model and makes it quick.  It works completely within
the conventional NPM system:  Each package will still have its own Gulpfile.
Each package can still run "npm install" without Rush if desired.
You are always free to move your projects around between Git repositories
without any changes to package.json.

But when you use Rush, you get some big improvements:

- Save time by installing all dependencies for all packages via a single
  "npm install" invocation

- Rush automatically generates a shrinkwrap file for the entire repository.
  NPM shrinkwrap is the only way to avoid maddening problems of "what are you talking
  about, it works on my PC!"

- All projects are automatically hooked up with "npm link" (using local
  symlinks so multiple Git folders won't get cross-linked)

- A dependency solver uses package.json to automatically determine
  the build order.

- Since each project has its own Gulpfile, Rush can spawn multiple NodeJS
  processes in parallel, making the build go significantly faster.  (No matter
  how many promises you write, your Gulpfile is still fundamentally single-threaded.)

- Use a single command to run "npm publish" for many packages

- Git-based incremental builds, so you only rebuild a project if a source file
  in that project folder has changed.

- Support for cyclic dependencies:  For example, suppose that **my-gulp-task**
  depends on **my-library**, but **my-library**'s Gulpfile has a devDependency
  on **my-gulp-task**.  Rush can install the last published version of these
  packages for the Gulpfile, while still creating local links for other
  projects outside the cyclic dependency.

- Support for enforcing certain Git policies, such as enforcing that Git committer
  email addresses conform to a well-defined pattern.

# Usage

At any time, you can see the `--help` flag to find command-line usage information.

## Building a repo that is configured for Rush

1. Run "**npm install -g @microsoft/rush**".  To confirm that it's working,
   run "rush -h" which prints the version number and usage information.

2. From anywhere in your git working folder, run "**rush install**".  This
   will install NPM modules in Rush's "Common" folder.

   NOTE: If you are troubleshooting build issues, try
   "**rush install --full-clean**"    instead.

3. From anywhere in your Git working folder, run "**rush link**".  This creates
   symlinks so that all the projects will reuse the packages from "common/node_modules"
   (rather than having to run "npm install" in each project folder).  It will
   also link projects to the folders for their local dependencies, so that you don't need
   to do "npm publish" to test your changes.

   NOTE: The "**rush.json**" config file specifies how this linking is performed.

   > IMPORTANT: DO NOT run "npm install" inside project folders that have been linked
   > by the Rush tool.  If you want to do that, you need to "**rush unlink**" first.

4. Do your initial build by running "**rush rebuild**" .  This will
   recurse through each project folder and run "gulp clean", "gulp",
   and "gulp test", and then give you a report of anything that failed to build.

   NOTE: To suppress verbose output, use "**rush rebuild -q**".

## Pull -> Edit -> Build -> Run -> Push

The above steps are only necessary when you need to do a clean full build (e.g.
after pulling changes that affected common/package.json).  Otherwise, you can
run "gulp" in individual project folders as usual.  Your daily workflow will
look like this:

1.  Pull the latest changes from git.

2.  If something changed in the **common** folder, then you may need to update
    your NPM:

    > C:\MyRepo> **rush install**
    >
    > C:\MyRepo> **rush link**
    >
    > C:\MyRepo> **rush rebuild -q**

3.  Debug a project:

    > C:\MyRepo> **cd my-project**
    >
    > C:\MyRepo\my-project> **gulp serve**

## Configuring a project to be built by Rush

Once a project has been added to the `rush.json` file, several commands must be defined in the
project's `package.json` file, under the `scripts` section. Every project must define a `clean`
script. Additionally, every project must define either a `test` or `build` command. By default,
Rush will default to using the `test` command if both are defined, but will fall back to `build`
if `test` is missing.

The defined commands should either reference something on the `PATH` or should be an absolute path.
If the command is defined simply as `gulp`, the version of gulp from the common folder's `node_modules/.bin`
folder will be used.

An example configuration is below:

```json
{
  "name": "my-project",
  "version": "1.0.0",
  "scripts": {
    "clean": "gulp clean",
    "build": "gulp",
    "test": "/usr/bin/testcommand --compile --things"
  }
}
```

## If you need to modify your package.json

If you need to add new dependencies to your package.json, you will need to
regenerate the files in the common folder.  Use these commands:

> C:\MyRepo> **rush generate**
>
> C:\MyRepo> **rush link**

This will change various generated files in common folder.  You shuld include these
changes in your Pull Request.

The "**rush generate**" command takes a long time.  To speed up debugging, you can use
"**rush generate --lazy**" instead; however you must run the full "**rush generate**"
before submitting your PR.

## Publishing your NPM packages

To publish all NPM projects in your repository, run "**rush publish**".  You
can select a subset of projects using the "**--include**" option followed by
a [glob](https://en.wikipedia.org/wiki/Glob_(programming)) pattern.  You can
use the "**--registry**" option to specify a custom NPM registry, e.g. if you
are testing with [Verdaccio](https://github.com/verdaccio/verdaccio).

## Converting a repo to build with Rush

Currently you need to manually create an "rush.json" configuration file
at the root of your repository, which specifies the list of projects
to be built.  You also need to set up your "common" folder, and add the
appropriate files to Git.  (We are working on an "rush init" command to
simplify this.)

## Detecting when new NPM dependencies are introduced

Suppose that your Rush repo has 30 different projects, and you want to keep track of
what NPM packages people are using.  When someone finds a new package and tries to add
it to their project, you want to ask questions like:  "Is this a good quality package?"
"Are we already using a different library that does the same thing?"  "Is the license
allowed?"  "How many other dependencies will this pull into our node_modules folder?"
Rush can alert you when this happens.

In your **rush.json** file, add these optional fields:

```json
  "reviewCategories": [ "published", "internal", "experiment" ],
  "packageReviewFile": "common/PackageDependencies.json",
```

In this example, we defined three kinds of projects that we care about:
Projects that we publish externally, projects kept internal to our company,
and throwaway experiments.  For each project in the repo, we will assign one
of these categories as the "reviewCategory" field.

The **PackageDependencies.json** file contains the list of approved packages.
This file should be added to Git.  It might look like this:

```json
{
  "browserPackages": [
    {
      "name": "lodash",
      "allowedCategories": [ "internal", "experiment" ]
    }
  ],
  "nonBrowserPackages": [
    {
      "name": "gulp",
      "allowedCategories": [ "published", "internal", "experiment" ]
    },
    {
      "name": "some-tool",
      "allowedCategories": [ "experiment" ]
    }
  ]
}
```

Above, we specified that only our internal projects and experiments are allowed
to use "lodash", whereas "gulp" is allowed everywhere.  The "some-tool" library
is being used by an experimental prototype, but should never be used in real projects.

Note that Rush distinguishes "**browserPackages**" from "**nonBrowserPackages**",
since the approval criteria is generally different for these environments.

Now, suppose someone changes their package.json to add "lodash" to a project that
was designated as "published".  When they  run "rush generate", Rush will automatically
rewrite the **PackageDependencies.json** file, appending "published" to the
"allowedCategories" for "lodash".  In other words, it automatically broadens the rules
so that they describe reality.  When the pull request is created, reviewers will spot this diff
and can ask appropriate questions.  Since our criteria is based on generalized categories,
the reviewers aren't hassled about every little package.json change; a **PackageDependencies.json**
diff only appears for genuinely interesting changes.

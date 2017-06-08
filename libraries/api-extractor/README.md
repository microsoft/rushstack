# @microsoft/api-extractor


![API Extractor](https://github.com/Microsoft/web-build-tools/raw/master/common/wiki-images/api-extractor-title.png?raw=true)
<br />
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; https://aka.ms/extractor

<!-- ----------------------------------------------------------------------------------- -->
<!-- Text below this line should stay in sync with API-Extractor.md from the GitHub wiki -->
<!-- ----------------------------------------------------------------------------------- -->

**API Extractor** helps you build better [TypeScript](https://www.typescriptlang.org/) library packages.  Suppose for example that your company has published an NPM package called "**awesome-widgets**" that exports many classes and interfaces.  As developers start to depend on your library, you may encounter issues such as...

- **Determining versions:** The [SemVer](http://semver.org/) standard uses version numbers to communicate the impact of upgrading to your consumers.  But when it's time to publish a new release, how to determine whether it should be a "major", "minor", or "patch" version?  For an active project with many source files, it's often not obvious how the API contract has changed.

- **Accidental breaks:**  People keep reporting that their code won't compile after a supposedly "minor" update.  To address this, you boldly propose that every **awesome-widgets** pull request must be approved by an experienced developer from your team.  But that proves unrealistic -- nobody has time to look at every single PR!  What you really need is a way to detect PRs that change API contracts, and flag them for review.  That would focus attention in the right place... but how to do that?

- **Missing exports:** Suppose the **awesome-widgets** package exports an API function `AwesomeButton.draw()` that requires a parameter of type `DrawStyle`, but you forgot to export this enum.  Things seem fine at first, but when a developer tries to call that function, they discover that there's no way to specify the `DrawStyle`.  How to avoid these oversights?

- **Accidental exports:** You meant for your`DrawHelper` class to be kept internal, but one day you realize it's being exported by your package.  When you try to remove it, you learn that some consumers are now relying on it.  How do we avoid this in the future?

- **Alpha/Beta graduation:**  You want to release previews of new APIs that are not ready for prime time yet.  If you did a major SemVer bump every time you change these definitions, the villagers would be after you with torches and pitchforks.  A better approach is to designate certain classes/members as "**alpha**" quality, then promote them to "**beta**" and finally to "**public**" when they're mature.  But how to indicate this to your consumers?  (And how to detect scoping mistakes?  A "public" function should never return a "beta" result.)

- **Online documentation:**  You have faithfully annotated each TypeScript member with nice [JSDoc](http://usejsdoc.org/) descriptions.  Now that your library is published, you should probably set up [a nicely formatted](https://dev.office.com/sharepoint/reference/spfx/sp-page-context/cultureinfo) API reference.  Which tool should we use to generate that?  (What!?  There aren't any good ones!?)

**API Extractor** provides an integrated, professional-quality solution for all these problems.  It is invoked at build time by your toolchain and leverages the TypeScript compiler engine to:

- Detect a project's exported API surface
- Capture the contracts in a concise report designed to facilitate review
- Warn about common mistakes (e.g. missing exports, inconsistent visibility, etc)
- Generate API documentation in portable format that's easy to integrate with your publishing pipeline

<!-- ----------------------------------------------------------------------------------- -->
<!-- Text above this line should stay in sync with API-Extractor.md from the GitHub wiki -->
<!-- ----------------------------------------------------------------------------------- -->

# Getting Started

The GitHub wiki has complete, up-to-date documentation: https://aka.ms/extractor

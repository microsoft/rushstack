> ## Overview
> We break changes into three categories (following [semver](http://semver.org/)), corresponding to the types of version
>  bumps we may make:
> - **`PATCH`** A patch change should be released when a backwards-compatible bugfix is made.
> - **`MINOR`** A minor change should be released when functionality is added, but backwards-compatibility is maintained.
> - **`MAJOR`** A major change should be released whenever backwards compatibility is broken.
>
> Whenver a change is made to this project, a brief description of the change should be included in this file under the
> **Unreleased changes** heading with an annotation tagging the change. When the package is released, all of the
> changes listed under **Unreleased changes** will be moved under a heading for the new version.
>
> Example changes:
> ## Unreleased changes
> - `PATCH` Fixing a minor style issue where a textbox can overlap with its label.
> - `MAJOR` Changing the interface of `BaseClientSideWebPart.onInit()` to be async.
> - `MINOR` Including new performance logging functions.
> - `PATCH` Correctly handling negative numbers in the `setZIndex` function.

# Unreleased changes
- `MINOR` introduces a new command line argument type for a list of strings
- `MINOR` introduces a new command line argument type for integers

# 1.0.1

*Initial release*

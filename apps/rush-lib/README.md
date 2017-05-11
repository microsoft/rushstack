## @microsoft/rush-lib

This is a companion package for the Rush tool.  See the
[@microsoft/rush](https://www.npmjs.com/package/@microsoft/rush)
package for details.

The **rush-lib** package implements the rush.json config file loader
and some other helpful utilities.  Tools that want to reuse this
functionality can install **rush-lib** alone to avoid inadvertently
adding another "rush" executable to the command-line path (which
might interfere with the globally installed Rush).

The **@microsoft/rush** version number is always exactly equal
to the **@microsoft/rush-lib** version number that it depends on.

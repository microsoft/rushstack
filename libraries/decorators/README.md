# decorators

This package defines a conservative set of decorators intended for use in both
NodeJS and web browser projects.  We recognize that decorators have certain risks:

- They can inject hidden code at runtime, causing confusion for developers who
  expected the source code to follow conventional semantics

- They can be difficult to debug, since decorators are evaluated at load time
  (versus compile time or run time)
  
- They can affect API contracts in subtle ways, which may cause unforeseen
  breaks for runtime versioning (e.g. when loading a subclass that was compiled
  against an older version of a base class with decorators)

- The decorator spec is still evolving, and there may be breaking changes
  in the future

In this light, the **@microsoft/decorators** package provides a small set of
decorators that stay within the conventional semantics of the TypeScript language.
The intent is to document API contracts more clearly and catch common mistakes,
NOT to provide an open-ended toolkit of creative macros.  (If you are looking
for that, there are many other options, for example the
[core-decorators](https://www.npmjs.com/package/core-decorators) project.)


*This package is part of the [SharePoint Framework](http://aka.ms/spfx),
which is a collection of NPM packages that empower developers to create client-side experiences
for [Microsoft SharePoint](https://products.office.com/en-us/sharepoint/collaboration).
For more information, including complete API documentation and code samples, please visit
the [SharePoint Framework](http://aka.ms/spfx) web site.*

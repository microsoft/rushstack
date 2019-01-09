[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [RushConfiguration](./rush-lib.rushconfiguration.md) &gt; [findProjectByShorthandName](./rush-lib.rushconfiguration.findprojectbyshorthandname.md)

## RushConfiguration.findProjectByShorthandName() method

This is used e.g. by command-line interfaces such as "rush build --to example". If "example" is not a project name, then it also looks for a scoped name like `@something/example`<!-- -->. If exactly one project matches this heuristic, it is returned. Otherwise, undefined is returned.

<b>Signature:</b>

```typescript
findProjectByShorthandName(shorthandProjectName: string): RushConfigurationProject | undefined;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  shorthandProjectName | `string` |  |

<b>Returns:</b>

`RushConfigurationProject | undefined`


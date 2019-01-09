[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [RushConfiguration](./rush-lib.rushconfiguration.md) &gt; [findProjectByTempName](./rush-lib.rushconfiguration.findprojectbytempname.md)

## RushConfiguration.findProjectByTempName() method

Looks up a project by its RushConfigurationProject.tempProjectName field.

<b>Signature:</b>

```typescript
findProjectByTempName(tempProjectName: string): RushConfigurationProject | undefined;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>tempProjectName</p> | <p>`string`</p> |  |

<b>Returns:</b>

`RushConfigurationProject | undefined`

The found project, or undefined if no match was found.


[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [ChangeManager](./rush-lib.changemanager.md) &gt; [createEmptyChangeFiles](./rush-lib.changemanager.createemptychangefiles.md)

## ChangeManager.createEmptyChangeFiles() method

Creates a change file that has a 'none' type.

<b>Signature:</b>

```typescript
static createEmptyChangeFiles(rushConfiguration: RushConfiguration, projectName: string, emailAddress: string): string | undefined;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>rushConfiguration</p> | <p>`RushConfiguration`</p> | <p>The rush configuration we are working with</p> |
|  <p>projectName</p> | <p>`string`</p> | <p>The name of the project for which to create a change file</p> |
|  <p>emailAddress</p> | <p>`string`</p> | <p>The email address which should be associated with this change</p> |

<b>Returns:</b>

`string | undefined`

the path to the file that was created, or undefined if no file was written


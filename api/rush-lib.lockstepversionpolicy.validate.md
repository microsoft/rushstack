[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [LockStepVersionPolicy](./rush-lib.lockstepversionpolicy.md) &gt; [validate](./rush-lib.lockstepversionpolicy.validate.md)

## LockStepVersionPolicy.validate() method

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

Validates the specified version and throws if the version does not satisfy lockstep version.

<b>Signature:</b>

```typescript
validate(versionString: string, packageName: string): void;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>versionString</p> | <p>`string`</p> | <p>version string</p> |
|  <p>packageName</p> | <p>`string`</p> | <p>package name</p> |

<b>Returns:</b>

`void`


[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [LockStepVersionPolicy](./rush-lib.lockstepversionpolicy.md) &gt; [bump](./rush-lib.lockstepversionpolicy.bump.md)

## LockStepVersionPolicy.bump() method

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

Bumps the version of the lockstep policy

<b>Signature:</b>

```typescript
bump(bumpType?: BumpType, identifier?: string): void;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  bumpType | `BumpType` | Overwrite bump type in version-policy.json with the provided value. |
|  identifier | `string` | Prerelease identifier if bump type is prerelease. |

<b>Returns:</b>

`void`


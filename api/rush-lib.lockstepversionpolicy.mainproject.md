[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [LockStepVersionPolicy](./rush-lib.lockstepversionpolicy.md) &gt; [mainProject](./rush-lib.lockstepversionpolicy.mainproject.md)

## LockStepVersionPolicy.mainProject property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

The main project for the version policy.

If the value is provided, change logs will only be generated in that project. If the value is not provided, change logs will be hosted in each project associated with the policy.

<b>Signature:</b>

```typescript
readonly mainProject: string | undefined;
```

[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [PnpmOptionsConfiguration](./rush-lib.pnpmoptionsconfiguration.md)

## PnpmOptionsConfiguration class

Options that are only used when the PNPM package manager is selected.

<b>Signature:</b>

```typescript
export declare class PnpmOptionsConfiguration 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[strictPeerDependencies](./rush-lib.pnpmoptionsconfiguration.strictpeerdependencies.md)</p> |  | <p>`boolean`</p> | <p>If true, then Rush will add the "--strict-peer-dependencies" option when invoking PNPM. This causes "rush install" to fail if there are unsatisfied peer dependencies, which is an invalid state that can cause build failures or incompatible dependency versions. (For historical reasons, JavaScript package managers generally do not treat this invalid state as an error.)</p><p>The default value is false. (For now.)</p> |

## Remarks

It is valid to define these options in rush.json even if the PNPM package manager is not being used.


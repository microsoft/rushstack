[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [RushConfiguration](./rush-lib.rushconfiguration.md) &gt; [pnpmOptions](./rush-lib.rushconfiguration.pnpmoptions.md)

# RushConfiguration.pnpmOptions property

Options that are only used when the PNPM package manager is selected.

**Signature:**
```javascript
pnpmOptions: PnpmOptionsConfiguration
```

## Remarks

The constructor for this class is marked as internal. Third-party code should not call the constructor directly or create subclasses that extend the PnpmOptionsConfiguration class.

It is valid to define these options in rush.json even if the PNPM package manager is not being used.

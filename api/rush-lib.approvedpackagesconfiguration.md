[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [ApprovedPackagesConfiguration](./rush-lib.approvedpackagesconfiguration.md)

## ApprovedPackagesConfiguration class

This represents the JSON file specified via the "approvedPackagesFile" option in rush.json.

<b>Signature:</b>

```typescript
export declare class ApprovedPackagesConfiguration 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[items](./rush-lib.approvedpackagesconfiguration.items.md)</p> |  | <p>`ApprovedPackagesItem[]`</p> |  |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[addOrUpdatePackage(packageName, reviewCategory)](./rush-lib.approvedpackagesconfiguration.addorupdatepackage.md)</p> |  |  |
|  <p>[clear()](./rush-lib.approvedpackagesconfiguration.clear.md)</p> |  | <p>Clears all the settings, returning to an empty state.</p> |
|  <p>[getItemByName(packageName)](./rush-lib.approvedpackagesconfiguration.getitembyname.md)</p> |  |  |
|  <p>[loadFromFile()](./rush-lib.approvedpackagesconfiguration.loadfromfile.md)</p> |  | <p>Loads the configuration data from the filename that was passed to the constructor.</p> |
|  <p>[saveToFile()](./rush-lib.approvedpackagesconfiguration.savetofile.md)</p> |  | <p>Loads the configuration data to the filename that was passed to the constructor.</p> |
|  <p>[tryLoadFromFile(approvedPackagesPolicyEnabled)](./rush-lib.approvedpackagesconfiguration.tryloadfromfile.md)</p> |  | <p>If the file exists, calls loadFromFile().</p> |


[Home](./index) &gt; [@microsoft/rush-lib](rush-lib.md) &gt; [ApprovedPackagesConfiguration](rush-lib.approvedpackagesconfiguration.md)

# ApprovedPackagesConfiguration class

This represents the JSON file specified via the "approvedPackagesFile" option in rush.json.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`items`](rush-lib.approvedpackagesconfiguration.items.md) |  | `ApprovedPackagesItem[]` |  |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`constructor(jsonFilename)`](rush-lib.approvedpackagesconfiguration.constructor.md) |  |  | Constructs a new instance of the [ApprovedPackagesConfiguration](rush-lib.approvedpackagesconfiguration.md) class |
|  [`addOrUpdatePackage(packageName, reviewCategory)`](rush-lib.approvedpackagesconfiguration.addorupdatepackage.md) | `public` | `void` |  |
|  [`clear()`](rush-lib.approvedpackagesconfiguration.clear.md) | `public` | `void` | Clears all the settings, returning to an empty state. |
|  [`getItemByName(packageName)`](rush-lib.approvedpackagesconfiguration.getitembyname.md) | `public` | `ApprovedPackagesItem | undefined` |  |
|  [`loadFromFile()`](rush-lib.approvedpackagesconfiguration.loadfromfile.md) | `public` | `void` | Loads the configuration data from the filename that was passed to the constructor. |
|  [`saveToFile()`](rush-lib.approvedpackagesconfiguration.savetofile.md) | `public` | `void` | Loads the configuration data to the filename that was passed to the constructor. |
|  [`tryLoadFromFile(approvedPackagesPolicyEnabled)`](rush-lib.approvedpackagesconfiguration.tryloadfromfile.md) | `public` | `boolean` | If the file exists, calls loadFromFile(). |


[Home](./index) &gt; [@microsoft/rush-lib](rush-lib.md) &gt; [IChangeInfo](rush-lib.ichangeinfo.md)

# IChangeInfo interface

Defines an IChangeInfo object.

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`author`](rush-lib.ichangeinfo.author.md) | `string` | The email of the user who provided the comment. Pulled from the git log. |
|  [`changes`](rush-lib.ichangeinfo.changes.md) | `IChangeInfo[]` | Defines the array of related changes for the given package. This is used to iterate over comments requested by the change requests. |
|  [`changeType`](rush-lib.ichangeinfo.changetype.md) | `ChangeType` | Defines the type of change. This is not expected to exist within the JSON file definition as we parse it from the "type" property. |
|  [`comment`](rush-lib.ichangeinfo.comment.md) | `string` | A user provided comment for the change. |
|  [`commit`](rush-lib.ichangeinfo.commit.md) | `string` | The commit hash for the change. |
|  [`newRangeDependency`](rush-lib.ichangeinfo.newrangedependency.md) | `string` | The new downstream range dependency, as calculated by the findChangeRequests function. |
|  [`newVersion`](rush-lib.ichangeinfo.newversion.md) | `string` | The new version for the package, as calculated by the findChangeRequests function. |
|  [`order`](rush-lib.ichangeinfo.order.md) | `number` | The order in which the change request should be published. |
|  [`packageName`](rush-lib.ichangeinfo.packagename.md) | `string` | The name of the package. |
|  [`type`](rush-lib.ichangeinfo.type.md) | `string` | The type of the package publishing request (patch/minor/major), as provided by the JSON file. |


[Home](./index) &gt; [local](local.md) &gt; [Office\_Document](local.office_document.md)

# Office\_Document interface

## Methods

|  Method | Returns | Description |
|  --- | --- | --- |
|  [`getProjectFieldAsync(fieldId, options, callback)`](local.office_document.getprojectfieldasync.md) | `void` | Get Project field (Ex. ProjectWebAccessURL). |
|  [`getResourceFieldAsync(resourceId, fieldId, options, callback)`](local.office_document.getresourcefieldasync.md) | `void` | Get resource field for provided resource Id. (Ex.ResourceName) |
|  [`getSelectedResourceAsync(options, callback)`](local.office_document.getselectedresourceasync.md) | `void` | Get the current selected Resource's Id. |
|  [`getSelectedTaskAsync(options, callback)`](local.office_document.getselectedtaskasync.md) | `void` | Get the current selected Task's Id. |
|  [`getSelectedViewAsync(options, callback)`](local.office_document.getselectedviewasync.md) | `void` | Get the current selected View Type (Ex. Gantt) and View Name. |
|  [`getTaskAsync(taskId, options, callback)`](local.office_document.gettaskasync.md) | `void` | Get the Task Name, WSS Task Id, and ResourceNames for given taskId. |
|  [`getTaskFieldAsync(taskId, fieldId, options, callback)`](local.office_document.gettaskfieldasync.md) | `void` | Get task field for provided task Id. (Ex. StartDate). |
|  [`getWSSUrlAsync(options, callback)`](local.office_document.getwssurlasync.md) | `void` | Get the WSS Url and list name for the Tasks List, the MPP is synced too. |


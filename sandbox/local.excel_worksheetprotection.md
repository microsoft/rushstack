[Home](./index) &gt; [local](local.md) &gt; [Excel\_WorksheetProtection](local.excel_worksheetprotection.md)

# Excel\_WorksheetProtection class

Represents the protection of a sheet object. 

 \[Api set: ExcelApi 1.2\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`options`](local.excel_worksheetprotection.options.md) |  | `Excel.WorksheetProtectionOptions` | Sheet protection options. Read-Only. <p/> \[Api set: ExcelApi 1.2\] |
|  [`protected`](local.excel_worksheetprotection.protected.md) |  | `boolean` | Indicates if the worksheet is protected. Read-Only. <p/> \[Api set: ExcelApi 1.2\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_worksheetprotection.load.md) |  | `Excel.WorksheetProtection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`protect(options)`](local.excel_worksheetprotection.protect.md) |  | `void` | Protects a worksheet. Fails if the worksheet has been protected. <p/> \[Api set: ExcelApi 1.2\] |
|  [`toJSON()`](local.excel_worksheetprotection.tojson.md) |  | `{
            "options": WorksheetProtectionOptions;
            "protected": boolean;
        }` |  |
|  [`unprotect()`](local.excel_worksheetprotection.unprotect.md) |  | `void` | Unprotects a worksheet. <p/> \[Api set: ExcelApi 1.2\] |


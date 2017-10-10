[Home](./index) &gt; [local](local.md) &gt; [Excel\_TableSort](local.excel_tablesort.md)

# Excel\_TableSort class

Manages sorting operations on Table objects. 

 \[Api set: ExcelApi 1.2\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`fields`](local.excel_tablesort.fields.md) |  | `Array<Excel.SortField>` | Represents the current conditions used to last sort the table. <p/> \[Api set: ExcelApi 1.2\] |
|  [`matchCase`](local.excel_tablesort.matchcase.md) |  | `boolean` | Represents whether the casing impacted the last sort of the table. <p/> \[Api set: ExcelApi 1.2\] |
|  [`method`](local.excel_tablesort.method.md) |  | `string` | Represents Chinese character ordering method last used to sort the table. <p/> \[Api set: ExcelApi 1.2\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`apply(fields, matchCase, method)`](local.excel_tablesort.apply.md) |  | `void` | Perform a sort operation. <p/> \[Api set: ExcelApi 1.2\] |
|  [`clear()`](local.excel_tablesort.clear.md) |  | `void` | Clears the sorting that is currently on the table. While this doesn't modify the table's ordering, it clears the state of the header buttons. <p/> \[Api set: ExcelApi 1.2\] |
|  [`load(option)`](local.excel_tablesort.load.md) |  | `Excel.TableSort` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`reapply()`](local.excel_tablesort.reapply.md) |  | `void` | Reapplies the current sorting parameters to the table. <p/> \[Api set: ExcelApi 1.2\] |
|  [`toJSON()`](local.excel_tablesort.tojson.md) |  | `{
            "fields": SortField[];
            "matchCase": boolean;
            "method": string;
        }` |  |


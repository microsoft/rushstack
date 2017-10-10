[Home](./index) &gt; [local](local.md) &gt; [Excel\_CellValueConditionalFormat](local.excel_cellvalueconditionalformat.md)

# Excel\_CellValueConditionalFormat class

Represents a cell value conditional format. 

 \[Api set: ExcelApi 1.6 (PREVIEW)\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`format`](local.excel_cellvalueconditionalformat.format.md) |  | `Excel.ConditionalRangeFormat` | Returns a format object, encapsulating the conditional formats font, fill, borders, and other properties. Read-only. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`rule`](local.excel_cellvalueconditionalformat.rule.md) |  | `Excel.ConditionalCellValueRule` | Represents the Rule object on this conditional format. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_cellvalueconditionalformat.load.md) |  | `Excel.CellValueConditionalFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_cellvalueconditionalformat.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_cellvalueconditionalformat.tojson.md) |  | `{
            "format": ConditionalRangeFormat;
            "rule": ConditionalCellValueRule;
        }` |  |


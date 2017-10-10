[Home](./index) &gt; [local](local.md) &gt; [Excel\_CustomConditionalFormat](local.excel_customconditionalformat.md)

# Excel\_CustomConditionalFormat class

Represents a custom conditional format type. 

 \[Api set: ExcelApi 1.6 (PREVIEW)\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`format`](local.excel_customconditionalformat.format.md) |  | `Excel.ConditionalRangeFormat` | Returns a format object, encapsulating the conditional formats font, fill, borders, and other properties. Read-only. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`rule`](local.excel_customconditionalformat.rule.md) |  | `Excel.ConditionalFormatRule` | Represents the Rule object on this conditional format. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_customconditionalformat.load.md) |  | `Excel.CustomConditionalFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_customconditionalformat.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_customconditionalformat.tojson.md) |  | `{
            "format": ConditionalRangeFormat;
            "rule": ConditionalFormatRule;
        }` |  |


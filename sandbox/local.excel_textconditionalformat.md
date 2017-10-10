[Home](./index) &gt; [local](local.md) &gt; [Excel\_TextConditionalFormat](local.excel_textconditionalformat.md)

# Excel\_TextConditionalFormat class

Represents a specific text conditional format. 

 \[Api set: ExcelApi 1.6 (PREVIEW)\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`format`](local.excel_textconditionalformat.format.md) |  | `Excel.ConditionalRangeFormat` | Returns a format object, encapsulating the conditional formats font, fill, borders, and other properties. Read-only. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`rule`](local.excel_textconditionalformat.rule.md) |  | `Excel.ConditionalTextComparisonRule` | The rule of the conditional format. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_textconditionalformat.load.md) |  | `Excel.TextConditionalFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_textconditionalformat.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_textconditionalformat.tojson.md) |  | `{
            "format": ConditionalRangeFormat;
            "rule": ConditionalTextComparisonRule;
        }` |  |


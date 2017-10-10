[Home](./index) &gt; [local](local.md) &gt; [Excel\_TopBottomConditionalFormat](local.excel_topbottomconditionalformat.md)

# Excel\_TopBottomConditionalFormat class

Represents a Top/Bottom conditional format. 

 \[Api set: ExcelApi 1.6 (PREVIEW)\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`format`](local.excel_topbottomconditionalformat.format.md) |  | `Excel.ConditionalRangeFormat` | Returns a format object, encapsulating the conditional formats font, fill, borders, and other properties. Read-only. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`rule`](local.excel_topbottomconditionalformat.rule.md) |  | `Excel.ConditionalTopBottomRule` | The criteria of the Top/Bottom conditional format. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_topbottomconditionalformat.load.md) |  | `Excel.TopBottomConditionalFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_topbottomconditionalformat.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_topbottomconditionalformat.tojson.md) |  | `{
            "format": ConditionalRangeFormat;
            "rule": ConditionalTopBottomRule;
        }` |  |


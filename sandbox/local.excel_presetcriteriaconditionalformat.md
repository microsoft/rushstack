[Home](./index) &gt; [local](local.md) &gt; [Excel\_PresetCriteriaConditionalFormat](local.excel_presetcriteriaconditionalformat.md)

# Excel\_PresetCriteriaConditionalFormat class

Represents the the preset criteria conditional format such as above average/below average/unique values/contains blank/nonblank/error/noerror. 

 \[Api set: ExcelApi 1.6 (PREVIEW)\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`format`](local.excel_presetcriteriaconditionalformat.format.md) |  | `Excel.ConditionalRangeFormat` | Returns a format object, encapsulating the conditional formats font, fill, borders, and other properties. Read-only. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`rule`](local.excel_presetcriteriaconditionalformat.rule.md) |  | `Excel.ConditionalPresetCriteriaRule` | The rule of the conditional format. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_presetcriteriaconditionalformat.load.md) |  | `Excel.PresetCriteriaConditionalFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_presetcriteriaconditionalformat.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_presetcriteriaconditionalformat.tojson.md) |  | `{
            "format": ConditionalRangeFormat;
            "rule": ConditionalPresetCriteriaRule;
        }` |  |


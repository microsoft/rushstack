[Home](./index) &gt; [local](local.md) &gt; [Excel\_ConditionalIconCriterion](local.excel_conditionaliconcriterion.md)

# Excel\_ConditionalIconCriterion interface

Represents an Icon Criterion which contains a type, value, an Operator, and an optional custom icon, if not using an iconset. 

 \[Api set: ExcelApi 1.6 (PREVIEW)\]

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`customIcon`](local.excel_conditionaliconcriterion.customicon.md) | `Excel.Icon` | The custom icon for the current criterion if different from the default IconSet, else null will be returned. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`formula`](local.excel_conditionaliconcriterion.formula.md) | `string` | A number or a formula depending on the type. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`operator`](local.excel_conditionaliconcriterion.operator.md) | `string` | GreaterThan or GreaterThanOrEqual for each of the rule type for the Icon conditional format. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`type`](local.excel_conditionaliconcriterion.type.md) | `string` | What the icon conditional formula should be based on. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |


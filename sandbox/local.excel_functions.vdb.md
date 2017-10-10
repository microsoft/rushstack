[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [vdb](local.excel_functions.vdb.md)

# Excel\_Functions.vdb method

Returns the depreciation of an asset for any period you specify, including partial periods, using the double-declining balance method or some other method you specify. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
vdb(cost: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, salvage: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, life: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, startPeriod: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, endPeriod: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, factor?: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, noSwitch?: boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `cost` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `salvage` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `life` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `startPeriod` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `endPeriod` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `factor` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `noSwitch` | `boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |


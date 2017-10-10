[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [f\_Inv\_RT](local.excel_functions.f_inv_rt.md)

# Excel\_Functions.f\_Inv\_RT method

Returns the inverse of the (right-tailed) F probability distribution: if p = F.DIST.RT(x,...), then F.INV.RT(p,...) = x. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
f_Inv_RT(probability: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, degFreedom1: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, degFreedom2: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `probability` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `degFreedom1` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `degFreedom2` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |


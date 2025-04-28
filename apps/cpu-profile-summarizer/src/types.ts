// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Content of a V8 CPU Profile file
 */
export interface ICpuProfile {
  nodes: INode[];
  /**
   * Start time in microseconds. Offset is arbitrary.
   */
  startTime: number;
  /**
   * End time in microseconds. Only relevant compared to `startTime`.
   */
  endTime: number;
  /**
   * The identifier of the active node at each sample.
   */
  samples: number[];
  /**
   * The time deltas between samples, in microseconds.
   */
  timeDeltas: number[];
}

/**
 * A single stack frame in a CPU profile.
 */
export interface INode {
  /**
   * Identifier of the node.
   * Referenced in the `children` field of other nodes and in the `samples` field of the profile.
   */
  id: number;
  /**
   * The call frame of the function that was executing when the profile was taken.
   */
  callFrame: ICallFrame;
  /**
   * The number of samples where this node was on top of the stack.
   */
  hitCount: number;
  /**
   * The child nodes.
   */
  children?: number[];
  /**
   * Optional information about time spent on particular lines.
   */
  positionTicks?: IPositionTick[];
}

/**
 * The call frame of a profiler tick
 */
export interface ICallFrame {
  /**
   * The name of the function being executed, if any
   */
  functionName: string;
  /**
   * An identifier for the script containing the function.
   * Mostly relevant for new Function() and similar.
   */
  scriptId: string;
  /**
   * The URL of the script being executed.
   */
  url: string;
  /**
   * The line number in the script where the function is defined.
   */
  lineNumber: number;
  /**
   * The column number in the line where the function is defined.
   */
  columnNumber: number;
}

/**
 * Summarized information about a node in the CPU profile.
 * Caller/callee information is discarded for brevity.
 */
export interface INodeSummary {
  /**
   * The name of the function being executed, if any
   */
  functionName: string;
  /**
   * The URL of the script being executed
   */
  url: string;
  /**
   * The line number in the script where the function is defined.
   */
  lineNumber: number;
  /**
   * The column number in the line where the function is defined.
   */
  columnNumber: number;

  /**
   * Time spent while this function was the top of the stack, in microseconds.
   */
  selfTime: number;
  /**
   * Time spent while this function was on the stack, in microseconds.
   */
  totalTime: number;
}

/**
 * A collection of summarized information about nodes in a CPU profile.
 * The keys contain the function name, url, line number, and column number of the node.
 */
export type IProfileSummary = Map<string, INodeSummary>;

/**
 * Information about a sample that is tied to a specific line within a function
 */
export interface IPositionTick {
  /**
   * The line number where the tick was recorded, within the script containing the executing function.
   */
  line: number;
  /**
   * The number of samples where this line was active.
   */
  ticks: number;
}

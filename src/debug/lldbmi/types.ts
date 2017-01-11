// Copyright (c) 2015 Vadim Macagon
// MIT License, see LICENSE file for full terms.

export enum TargetStopReason {
  /** A breakpoint was hit. */
  BreakpointHit,
  /** A step instruction finished. */
  EndSteppingRange,
  /** A step-out instruction finished. */
  FunctionFinished,
  /** The target finished executing and terminated normally. */
  ExitedNormally,
  /** The target was signalled. */
  SignalReceived,
  /** The target encountered an exception (this is LLDB specific). */
  ExceptionReceived,
  /** Catch-all for any of the other numerous reasons. */
  Unrecognized,
  /** An inferior terminated because it received a signal. */
  ExitedSignalled,
  /** An inferior terminated (for some reason, check exitCode for clues). */
  Exited
}

export interface IFrameInfoBase {
  /** Name of the function corresponding to the frame. */
  func?: string;
  /** Code address of the frame. */
  address: string;
  /** Name of the source file corresponding to the frame's code address. */
  filename?: string;
  /** Full path of the source file corresponding to the frame's code address. */
  fullname?: string;
  /** Source line corresponding to the frame's code address. */
  line?: number;
}

/** Frame-specific information returned by breakpoint and stepping MI commands. */
export interface IFrameInfo extends IFrameInfoBase {
  /** Arguments of the function corresponding to the frame. */
  args?: any;
}

/** Frame-specific information returned by stack related MI commands. */
export interface IStackFrameInfo extends IFrameInfoBase {
  /** Level of the stack frame, zero for the innermost frame. */
  level: number;
  /** Name of the binary file that corresponds to the frame's code address. */
  from?: string;
}

/** Frame-specific information returned by -thread-info MI command. */
export interface IThreadFrameInfo extends IFrameInfoBase {
  /** Level of the stack frame, zero for the innermost frame. */
  level: number;
  /** Arguments of the function corresponding to the frame. */
  args?: any;
}

export interface IBreakpointLocationInfo {
  /**
   * Breakpoint location identifier.
   * This will be in the format `%d` if the breakpoint has a single location,
   * or `%d.%d` if the breakpoint has multiple locations.
   */
  id: string;
  isEnabled?: boolean;
  /** Address of the breakpoint location as a hexadecimal literal. */
  address?: string;
  /**
   * The name of the function within which the breakpoint location is set.
   * If function name is not known then this field will be undefined.
   */
  func?: string;
  /**
   * The name of the source file of the breakpoint location.
   * This filename is usually relative to the inferior executable.
   * If the source file name is not known this field will be undefined.
   */
  filename?: string;
  /**
   * Absolute path of the source file in which this breakpoint location is set.
   * If the source file name is not known this field will be undefined.
   */
  fullname?: string;
  /**
   * The source line number of the breakpoint location.
   * If the source line number is not known this field will be undefined.
   */
  line?: number;
  /**
   * If the source file name is not known this field may hold the address of the breakpoint
   * location, possibly followed by a symbol name.
   */
  at?: string;
}

/** Breakpoint-specific information returned by various MI commands. */
export interface IBreakpointInfo {
  /** Breakpoint identifier. */
  id: number;
  /** 
   * The type of the breakpoint.
   * For regular breakpoints this will be `breakpoint`, other possible values are `catchpoint`,
   * `watchpoint`, and possibly other as yet unspecified values.
   */
  breakpointType: string;
  /** If [[breakpointType]] is `catchpoint` this field will contain the exact type of the catchpoint. */
  catchpointType?: string;
  /** If `true` the breakpoint will be deleted at the next stop. */
  isTemp?: boolean;
  isEnabled?: boolean;
  /** Locations of the breakpoint, empty if the breakpoint is still pending. */
  locations: IBreakpointLocationInfo[];
  /** If the breakpoint is pending this field contains the text used by the user to set the breakpoint. */
  pending?: string;
  /** 
   * Indicates where the breakpoint's [[condition]] is evaluated.
   * The value of this field can be either `"host"`, `"target"`, or `undefined`.
   */
  evaluatedBy?: string;
  /** For a thread-specific breakpoint this will be the identifier of the thread for which it is set. */
  threadId?: number;
  /** 
   * For a conditional breakpoint this is the expression that must evaluate to `true` in order
   * for the debugger to stop the inferior when the breakpoint is hit. Note that the condition
   * is only checked when [[ignoreCount]] is not greater than zero.
   */
  condition?: string;
  /**
   * Number of times the debugger should let the inferior run when the breakpoint is hit.
   *
   * Each time the breakpoint is hit the debugger will check if the ignore count is zero, if that's
   * the case it will stop the inferior (after checking the condition if one is set), otherwise it
   * will simply decrement the ignore count by one and the inferior will continue running.
   */
  ignoreCount?: number;
  /**
   * Number of times the debugger should stop the inferior when the breakpoint is hit.
   *
   * Each time the breakpoint is hit the debugger will decrement the enable count, after the count
   * reaches zero the breakpoint is automatically disabled. 
   *
   * Note that [[ignoreCount]] must be zero before the debugger will start decrementing [[enableCount]].
   */
  enableCount?: number;
  /** Watchpoint-specific. */
  mask?: string;
  /** Tracepoint-specific. */
  passCount?: number;
  /** The breakpoint location originaly specified by the user. */
  originalLocation?: string;
  /** Number of times the breakpoint has been hit. */
  hitCount?: number;
  /** Tracepoint-specific, indicates whether the tracepoint is installed or not. */
  isInstalled?: boolean;
  /** Extra type-dependent data. */
  what?: string;
}

export interface IVariableInfo {
  /** The variable's name. */
  name: string;
  /** The variable's value. This can be a multi-line text, e.g. for a function the body of a function. */
  value: string;
  /** The type of the variable's value. Typically shown in the UI when hovering over the value. */
  type?: string;
  /** Properties of a variable that can be used to determine how to render the variable in the UI. Format of the string value: TBD. */
  kind?: string;
  /** Optional evaluatable name of this variable which can be passed to the 'EvaluateRequest' to fetch the variable's value. */
  evaluateName?: string;
  /** If variablesReference is > 0, the variable is structured and its children can be retrieved by passing variablesReference to the VariablesRequest. */
  variablesReference: number;
  /** The number of named child variables.
      The client can use this optional information to present the children in a paged UI and fetch them in chunks.
  */
  namedVariables?: number;
  /** The number of indexed child variables.
      The client can use this optional information to present the children in a paged UI and fetch them in chunks.
  */
  indexedVariables?: number;
}

/** Contains information about the arguments of a stack frame. */
export interface IStackFrameArgsInfo {
  /** Index of the frame on the stack, zero for the innermost frame. */
  level: number;
  /** List of arguments for the frame. */
  args: IVariableInfo[];
}

/** Contains information about the arguments and locals of a stack frame. */
export interface IStackFrameVariablesInfo {
  args: IVariableInfo[];
  locals: IVariableInfo[];
}

/** Indicates how much information should be retrieved when calling 
  *  [[DebugSession.getLocalVariables]].
  */
export enum VariableDetailLevel {
  /** Only variable names will be retrieved, not their types or values. */
  None = 0, // specifying the value is redundant, but is used here to emphasise its importance
  /** Only variable names and values will be retrieved, not their types. */
  All = 1,
  /** 
    * The name and type will be retrieved for all variables, however values will only be retrieved
    * for simple variable types (not arrays, structures or unions). 
    */
  Simple = 2
}

/** Contains information about a newly created watch. */
export interface IWatchInfo {
  id: string;
  childCount: number;
  value: string;
  expressionType: string;
  threadId: number;
  isDynamic: boolean;
  displayHint: string;
  hasMoreChildren: boolean;
}

export interface IWatchChildInfo extends IWatchInfo {
  /** The expression the front-end should display to identify this child. */
  expression: string;
  /** `true` if the watch state is not implicitely updated. */
  isFrozen: boolean;
}

/** Contains information about the changes in the state of a watch. */
export interface IWatchUpdateInfo {
  /** Unique identifier of the watch whose state changed. */
  id: string;
  /** 
    * If the number of children changed this is the updated count,
    * otherwise this field is undefined.
  */
  childCount?: number;
  /** The value of the watch expression after the update. */
  value?: string;
  /** 
    * If the type of the watch expression changed this will be the new type,
    * otherwise this field is undefined.
    */
  expressionType?: string;
  /** 
    * If `true` the watch expression is in-scope and has a valid value after the update.
    * If `false' the watch expression is not in-scope and has no valid value, but if [[isObsolete]]
    * is likewise `false` then the value may become valid at some point in the future if the watch 
    * expression comes back into scope.
    */
  isInScope: boolean;
  /** 
    * `true` if the value of the watch expression is permanently unavailable, possibly because
    * the target has changed or has been recompiled. Obsolete watches should be removed by the
    * front-end.
    */
  isObsolete: boolean;
  /** `true` iff the value if the type of the watch expression has changed. */
  hasTypeChanged?: boolean;
  /** `true` iff the watch relies on a Python-based visualizer. */
  isDynamic?: boolean;
  /** 
    * If `isDynamic` is `true` this field may contain a hint for the front-end on how the value of
    * the watch expression should be displayed. Otherwise this field is undefined.
    */
  displayHint?: string;
  /** `true` iff there are more children outside the update range. */
  hasMoreChildren: boolean;
  /** 
    * If `isDynamic` is `true` and new children were added within the update range this will
    * be a list of those new children. Otherwise this field is undefined.
    */
  newChildren?: string;
}

/** Output format specifiers for watch values. */
export enum WatchFormatSpec {
  Binary,
  Decimal,
  Hexadecimal,
  Octal,
  /** 
    * This specifier is used to indicate that one of the other ones should be automatically chosen
    * based on the expression type, for example `Decimal` for integers, `Hexadecimal` for pointers.
    */
  Default
}

/** A watch may have one or more of these attributes associated with it. */
export enum WatchAttribute {
  /** Indicates the watch value can be modified. */
  Editable,
  /** 
    * Indicates the watch value can't be modified. This will be the case for any watch with 
    * children (at least when implemented correctly by the debugger, *cough* not LLDB-MI *cough*).
    */
  NonEditable
}

/** Contains the contents of a block of memory from the target process. */
export interface IMemoryBlock {
  /** Start address of the memory block (hex literal). */
  begin: string;
  /** End address of the memory block (hex literal). */
  end: string;
  /** 
    * Offset of the memory block (in bytes, as a hex literal) from the start address passed into
    * [[DebugSession.readMemory]].
    */
  offset: string;
  /** Contents of the memory block in hexadecimal. */
  contents: string;
}

/** Contains information about an ASM instruction. */
export interface IAsmInstruction {
  /** Address at which this instruction was disassembled. */
  address: string;
  /** Name of the function this instruction came from. */
  func: string;
  /** Offset of this instruction from the start of `func` (as a decimal). */
  offset: number;
  /** Text disassembly of this instruction. */
  inst: string;
  /** 
    * Raw opcode bytes for this instruction.
    * NOTE: This field is currently not filled in by LLDB-MI.
    */
  opcodes?: string;
  /**
    * Size of the raw opcode in bytes.
    * NOTE: This field is an LLDB-MI specific extension.
    */
  size?: number;
}

/** Contains ASM instructions for a single source line. */
export interface ISourceLineAsm {
  /** Source filename from the compilation unit, may be absolute or relative. */
  file: string;
  /** 
    * Absolute filename of `file` (with all symbolic links resolved).
    * If the source file can't be found this field will populated from the debug information.
    * NOTE: This field is currently not filled in by LLDB-MI.
    */
  fullname: string;
  /** Source line number in `file`. */
  line: number;
  /** ASM instructions corresponding to `line` in `file`. */
  instructions: IAsmInstruction[];
}

/** Output format specifiers for register values. */
export enum RegisterValueFormatSpec {
  Binary,
  Decimal,
  Hexadecimal,
  Octal,
  Raw,
  /** 
    * This specifier is used to indicate that one of the other ones should be automatically chosen.
    */
  Default
}

/** Contains information about a thread. */
export interface IThreadInfo {
  /** Identifier used by the debugger to identify the thread. */
  id: number;
  /** Identifier used by the target to identify the thread. */
  targetId: string;
  /** 
   * Thread name.
   * The name may originate from the target, the debugger, or may be unknown (in which case this
   * field will be `undefined`).
   */
  name: string;
  /** Stack frame currently being executed in the thread. */
  frame: IThreadFrameInfo;
  /** `true` if the thread is currently stopped, `false` if it is currently running. */
  isStopped: boolean;
  /**
   * Processor core on which the thread is running.
   * The debugger may not always provide a value for this field, in which case it will be `undefined`.
   */
  processorCore: string;
  /** Extra free-form information about the thread, may be `undefined`. */
  details: string;
}

/** Contains information about all the threads in the target. */
export interface IMultiThreadInfo {
  /** List of all the threads in the target. */
  all: IThreadInfo[];
  /** Thread currently selected in the debugger. */
  current: IThreadInfo;
}

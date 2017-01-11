// Copyright (c) 2015 Vadim Macagon
// MIT License, see LICENSE file for full terms.

import * as readline from 'readline';
import * as events from 'events';
import * as stream from 'stream';
import * as parser from './mi_output_parser';
import { RecordType } from './mi_output';
import * as bunyan from 'bunyan';
import * as LLDBEvents from './events';
import {
  IBreakpointInfo, IBreakpointLocationInfo,
  IStackFrameInfo, IStackFrameArgsInfo, IStackFrameVariablesInfo, IVariableInfo,
  IWatchInfo, IWatchUpdateInfo, IWatchChildInfo, IMemoryBlock, IAsmInstruction, ISourceLineAsm,
  IThreadFrameInfo, IThreadInfo, IMultiThreadInfo,
  VariableDetailLevel, WatchFormatSpec, WatchAttribute, RegisterValueFormatSpec
} from './types';
import {
  extractBreakpointInfo, extractStackFrameInfo, extractWatchChildren, extractAsmInstructions,
  extractAsmBySourceLine, extractThreadInfo
} from './extractors';
import { CommandFailedError, MalformedResponseError } from './errors';
import * as rawCommandOuputParser from './raw_command_output_parser';

// aliases
type ReadLine = readline.ReadLine;
type ErrDataCallback = (err: Error, data: any) => void;

class DebugCommand {
  //JIN
  isRawCommand: boolean
  //workaround persist the output (state) between lines 
  output = []

  /**
   * Optional token that can be used to match up the command with a response,
   * if provided it must only contain digits.
   */
  token: string;
  /** The MI command string that will be sent to debugger (minus the token and dash prefix). */
  text: string;
  /** Optional callback to invoke once a response is received for the command. */
  done: ErrDataCallback;

  /**
   * @param cmd MI command string (minus the token and dash prefix).
   * @param token Token that can be used to match up the command with a response.
   * @param done Callback to invoke once a response is received for the command.
   */
  constructor(cmd: string, token?: string, done?: ErrDataCallback, isRawCommand: boolean = false) {
    this.token = token;
    this.text = cmd;
    this.done = done;
    this.isRawCommand = isRawCommand
  }
}

/**
 * A debug session provides two-way communication with a debugger process via the GDB/LLDB
 * machine interface.
 *
 * Currently commands are queued and executed one at a time in the order they are issued,
 * a command will not be executed until all the previous commands have been acknowledged by the
 * debugger.
 *
 * Out of band notifications from the debugger are emitted via events, the names of these events
 * are provided by the EVENT_XXX static constants.
 */
export default class DebugSession extends events.EventEmitter {
  // the stream to which debugger commands will be written
  private outStream: stream.Writable;
  // reads input from the debugger's stdout one line at a time
  private lineReader: ReadLine;
  // used to generate to auto-generate tokens for commands
  // FIXME: this is currently unused since I need to decide if tokens should be auto-generated
  // when the user doesn't supply them.
  private nextCmdId: number;
  // commands to be processed (one at a time)
  private cmdQueue: DebugCommand[];
  // used to to ensure session cleanup is only done once
  private cleanupWasCalled: boolean;
  private _logger: bunyan.Logger;

  get logger(): bunyan.Logger {
    return this._logger;
  }

  set logger(logger: bunyan.Logger) {
    this._logger = logger;
  }

  /**
   * In most cases [[startDebugSession]] should be used to construct new instances.
   *
   * @param inStream Debugger responses and notifications will be read from this stream.
   * @param outStream Debugger commands will be written to this stream.
   */
  constructor(inStream: stream.Readable, outStream: stream.Writable) {
    super();
    this.outStream = outStream;
    this.lineReader = readline.createInterface({
      input: inStream,
      output: null
    });
    this.lineReader.on('line', this.parseDebbugerOutput.bind(this));
    this.nextCmdId = 1;
    this.cmdQueue = [];
    this.cleanupWasCalled = false;
  }

  /**
   * Ends the debugging session.
   *
   * @param notifyDebugger If **false** the session is cleaned up immediately without waiting for
   *                       the debugger to respond (useful in cases where the debugger terminates
   *                       unexpectedly). If **true** the debugger is asked to exit, and once the
   *                       request is acknowldeged the session is cleaned up.
   */
  end(notifyDebugger: boolean = true): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      var cleanup = (err: Error, data: any) => {
        this.cleanupWasCalled = true;
        this.lineReader.close();
        err ? reject(err) : resolve();
      };

      if (!this.cleanupWasCalled) {
        notifyDebugger ? this.enqueueCommand(new DebugCommand('gdb-exit', null, cleanup))
          : cleanup(null, null);
      };
    });
  }

  /**
   * Returns `true` if [[EVENT_FUNCTION_FINISHED]] can be emitted during this debugging session.
   *
   * LLDB-MI currently doesn't emit [[EVENT_FUNCTION_FINISHED]] after stepping out of a function,
   * instead it emits [[EVENT_STEP_FINISHED]] just like it does for any other stepping operation.
   */
  canEmitFunctionFinishedNotification(): boolean {
    return false;
  }

  private emitExecNotification(name: string, data: any) {
    let events = LLDBEvents.createEventsForExecNotification(name, data);
    events.forEach((event: LLDBEvents.IDebugSessionEvent) => {
      this.emit(event.name, event.data);
    });
  }

  private emitAsyncNotification(name: string, data: any) {
    let event = LLDBEvents.createEventForAsyncNotification(name, data);
    if (event) {
      this.emit(event.name, event.data);
    } else {
      if (this.logger) {
        this.logger.warn({ name: name, data: data }, 'Unhandled notification.');
      }
    }
  }

  /**
   * Parse a single line containing a response to a MI command or some sort of async notification.
   */
  private parseDebbugerOutput(line: string): void {
    // '(gdb)' (or '(gdb) ' in some cases) is used to indicate the end of a set of output lines
    // from the debugger, but since we process each line individually as it comes in this
    // particular marker is of no use
    if (line.match(/^\(gdb\)\s*/) || (line === '')) {
      return;
    }

    //JIN add adhoc logics for the output of raw command exec
    let result: parser.Record;
    var ccmd: DebugCommand = this.cmdQueue[0];//FIXME ?this.cmdQueue[0] != undefined/null
    if (ccmd && ccmd.isRawCommand) {//
      if (line != "^done") {
        ccmd.output.push(line)
        return
      } else {
        result = {
          recordType: RecordType.Done,
          data: ccmd.output
        }
      }
    } else {//original logics
      var cmdQueuePopped: boolean = false;
      try {
        result = parser.parse(line);
      } catch (err) {
        if (this.logger) {
          this.logger.error(err, 'Attempted to parse: ->' + line + '<-');
        }
        // throw err;
        //FIXME some mi outputs can not be handled correctly
        result = {
          recordType: RecordType.AsyncNotify,
          data: [LLDBEvents.EVENT_TARGET_OUTPUT, ""]
        }
      }
    }

    switch (result.recordType) {
      case RecordType.Done:
      case RecordType.Running:
      case RecordType.Connected:
      case RecordType.Exit:
      case RecordType.Error:
        // this record is a response for the last command that was sent to the debugger,
        // which is the command at the front of the queue
        var cmd = this.cmdQueue.shift();
        cmdQueuePopped = true;
        // todo: check that the token in the response matches the one sent with the command
        if (cmd.done) {
          if (result.recordType === RecordType.Error) {
            cmd.done(
              new CommandFailedError(result.data.msg, cmd.text, result.data.code, cmd.token), null
            );
          } else {
            cmd.done(null, result.data);
          }
        }
        break;

      case RecordType.AsyncExec:
        this.emitExecNotification(result.data[0], result.data[1]);
        break;

      case RecordType.AsyncNotify:
        this.emitAsyncNotification(result.data[0], result.data[1]);
        break;

      case RecordType.DebuggerConsoleOutput:
        this.emit(LLDBEvents.EVENT_DBG_CONSOLE_OUTPUT, result.data);
        break;

      case RecordType.TargetOutput:
        this.emit(LLDBEvents.EVENT_TARGET_OUTPUT, result.data);
        break;

      case RecordType.DebuggerLogOutput:
        this.emit(LLDBEvents.EVENT_DBG_LOG_OUTPUT, result.data);
        break;
    }

    // if a command was popped from the qeueu we can send through the next command
    if (cmdQueuePopped && (this.cmdQueue.length > 0)) {
      this.sendCommandToDebugger(this.cmdQueue[0]);
    }
  }

  /**
   * Sends an MI command to the debugger process.
   */
  private sendCommandToDebugger(command: DebugCommand): void {
    var cmdStr: string;
    if (command.token) {
      cmdStr = `${command.token}-${command.text}`;
    } else {
      cmdStr = command.isRawCommand ? command.text : '-' + command.text;
    }
    if (this.logger) {
      this.logger.info(cmdStr);
    }
    this.outStream.write(cmdStr + '\n');
  }

  /**
   * Adds an MI command to the back of the command queue.
   *
   * If the command queue is empty when this method is called then the command is dispatched
   * immediately, otherwise it will be dispatched after all the previously queued commands are
   * processed.
   */
  private enqueueCommand(command: DebugCommand): void {
    this.cmdQueue.push(command);

    if (this.cmdQueue.length === 1) {
      this.sendCommandToDebugger(this.cmdQueue[0]);
    }
  }

  /**
   * Sends an MI command to the debugger.
   *
   * @param command Full MI command string, excluding the optional token and dash prefix.
   * @param token Token to be prefixed to the command string (must consist only of digits).
   * @returns A promise that will be resolved when the command response is received.
   */
  private executeCommand(command: string, token?: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.enqueueCommand(
        new DebugCommand(command, token, (err, data) => { err ? reject(err) : resolve(); })
      );
    });
  }

  /**
   * Sends an MI command to the debugger and returns the response.
   *
   * @param command Full MI command string, excluding the optional token and dash prefix.
   * @param token Token to be prefixed to the command string (must consist only of digits).
   * @param transformOutput This function will be invoked with the output of the MI Output parser
   *                        and should transform that output into an instance of type `T`.
   * @returns A promise that will be resolved when the command response is received.
   */
  private getCommandOutput<T>(command: string, token?: string, transformOutput?: (data: any) => T, isRawCommand: boolean = false)
    : Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.enqueueCommand(
        new DebugCommand(command, token, (err, data) => {
          if (err) {
            reject(err);
          } else {
            try {
              resolve(transformOutput ? transformOutput(data) : data);
            } catch (err) {
              reject(err);
            }
          }
        }, isRawCommand)
      );
    });
  }

  /**
   * Sets the executable file to be debugged, the symbol table will also be read from this file.
   *
   * This must be called prior to [[connectToRemoteTarget]] when setting up a remote debugging
   * session.
   *
   * @param file This would normally be a full path to the host's copy of the executable to be
   *             debugged.
   */
  setExecutableFile(file: string): Promise<void> {
    // NOTE: While the GDB/MI spec. contains multiple -file-XXX commands that allow the
    // executable and symbol files to be specified separately the LLDB MI driver
    // currently (30-Mar-2015) only supports this one command.
    return this.executeCommand(`file-exec-and-symbols ${file}`);
  }

  /**
   * Sets the terminal to be used by the next inferior that's launched.
   *
   * @param slaveName Name of the slave end of a pseudoterminal that should be associated with
   *                  the inferior, see `man pty` for an overview of pseudoterminals.
   */
  setInferiorTerminal(slaveName: string): Promise<void> {
    return this.executeCommand('inferior-tty-set ' + slaveName);
  }

  /**
   * Connects the debugger to a remote target.
   *
   * @param host
   * @param port
   */
  connectToRemoteTarget(host: string, port: number): Promise<void> {
    return this.executeCommand(`target-select remote ${host}:${port}`);
  }

  //
  // Breakpoint Commands
  //

  /**
   * Adds a new breakpoint.
   *
   * @param location The location at which a breakpoint should be added, can be specified in the
   *                 following formats:
   *                 - function_name
   *                 - filename:line_number
   *                 - filename:function_name
   *                 - address
   * @param options.isTemp Set to **true** to create a temporary breakpoint which will be
   *                       automatically removed after being hit.
   * @param options.isHardware Set to **true** to create a hardware breakpoint
   *                           (presently not supported by LLDB MI).
   * @param options.isPending Set to **true** if the breakpoint should still be created even if
   *                          the location cannot be parsed (e.g. it refers to uknown files or
   *                          functions).
   * @param options.isDisabled Set to **true** to create a breakpoint that is initially disabled,
   *                           otherwise the breakpoint will be enabled by default.
   * @param options.isTracepoint Set to **true** to create a tracepoint
   *                             (presently not supported by LLDB MI).
   * @param options.condition The debugger will only stop the program execution when this
   *                          breakpoint is hit if the condition evaluates to **true**.
   * @param options.ignoreCount The number of times the breakpoint should be hit before it takes
   *                            effect, zero (the default) means the breakpoint will stop the
   *                            program every time it's hit.
   * @param options.threadId Restricts the new breakpoint to the given thread.
   */
  addBreakpoint(
    location: string,
    options?: {
      isTemp?: boolean;
      isHardware?: boolean;
      isPending?: boolean;
      isDisabled?: boolean;
      isTracepoint?: boolean;
      condition?: string;
      ignoreCount?: number;
      threadId?: number;
    }
  ): Promise<IBreakpointInfo> {
    var cmd: string = 'break-insert';
    if (options) {
      if (options.isTemp) {
        cmd = cmd + ' -t';
      }
      if (options.isHardware) {
        cmd = cmd + ' -h';
      }
      if (options.isPending) {
        cmd = cmd + ' -f';
      }
      if (options.isDisabled) {
        cmd = cmd + ' -d';
      }
      if (options.isTracepoint) {
        cmd = cmd + ' -a';
      }
      if (options.condition) {
        cmd = cmd + ' -c ' + options.condition;
      }
      if (options.ignoreCount !== undefined) {
        cmd = cmd + ' -i ' + options.ignoreCount;
      }
      if (options.threadId !== undefined) {
        cmd = cmd + ' -p ' + options.threadId;
      }
    }

    return this.getCommandOutput<IBreakpointInfo>(cmd + ' ' + location, null, extractBreakpointInfo);
  }

  /**
   * Removes a breakpoint.
   */
  removeBreakpoint(breakId: number): Promise<void> {
    return this.executeCommand('break-delete ' + breakId);
  }

  /**
   * Removes multiple breakpoints.
   */
  removeBreakpoints(breakIds: number[]): Promise<void> {
    // FIXME: LLDB MI driver only supports removing one breakpoint at a time,
    //        so multiple breakpoints need to be removed one by one.
    return this.executeCommand('break-delete ' + breakIds.join(' '));
  }

  /**
   * Enables a breakpoint.
   */
  enableBreakpoint(breakId: number): Promise<void> {
    return this.executeCommand('break-enable ' + breakId);
  }

  /**
   * Enables multiple breakpoints.
   */
  enableBreakpoints(breakIds: number[]): Promise<void> {
    return this.executeCommand('break-enable ' + breakIds.join(' '));
  }

  /**
   * Disables a breakpoint.
   */
  disableBreakpoint(breakId: number): Promise<void> {
    return this.executeCommand('break-disable ' + breakId);
  }

  /**
   * Disables multiple breakpoints.
   */
  disableBreakpoints(breakIds: number[]): Promise<void> {
    return this.executeCommand('break-disable ' + breakIds.join(' '));
  }

  /**
   * Tells the debugger to ignore a breakpoint the next `ignoreCount` times it's hit.
   *
   * @param breakId Identifier of the breakpoint for which the ignore count should be set.
   * @param ignoreCount The number of times the breakpoint should be hit before it takes effect,
   *                    zero means the breakpoint will stop the program every time it's hit.
   */
  ignoreBreakpoint(
    breakId: number, ignoreCount: number): Promise<IBreakpointInfo> {
    return this.getCommandOutput<IBreakpointInfo>(
      `break-after ${breakId} ${ignoreCount}`, null, extractBreakpointInfo
    );
  }

  /**
   * Sets the condition under which a breakpoint should take effect when hit.
   *
   * @param breakId Identifier of the breakpoint for which the condition should be set.
   * @param condition Expression to evaluate when the breakpoint is hit, if it evaluates to
   *                  **true** the breakpoint will stop the program, otherwise the breakpoint
   *                  will have no effect.
   */
  setBreakpointCondition(
    breakId: number, condition: string): Promise<void> {
    return this.executeCommand(`break-condition ${breakId} ${condition}`);
  }

  //
  // Program Execution Commands
  //

  /**
   * Sets the commandline arguments to be passed to the inferior next time it is started
   * using [[startInferior]].
   */
  setInferiorArguments(args: string): Promise<void> {
    return this.executeCommand('exec-arguments ' + args);
  }

  /**
   * Executes an inferior from the beginning until it exits.
   *
   * Execution may stop before the inferior finishes running due to a number of reasons,
   * for example a breakpoint being hit.
   * [[EVENT_TARGET_STOPPED]] will be emitted when execution stops.
   *
   * @param options.threadGroup *(GDB specific)* The identifier of the thread group to start,
   *                            if omitted the currently selected inferior will be started.
   * @param options.stopAtStart *(GDB specific)* If `true` then execution will stop at the start
   *                            of the main function.
   */
  startInferior(
    options?: { threadGroup?: string; stopAtStart?: boolean }): Promise<void> {
    var fullCmd: string = 'exec-run';
    if (options) {
      if (options.threadGroup) {
        fullCmd = fullCmd + ' --thread-group ' + options.threadGroup;
      }
      if (options.stopAtStart) {
        fullCmd = fullCmd + ' --start';
      }
    }

    return this.executeCommand(fullCmd, null);
  }

  /**
   * Executes all inferiors from the beginning until they exit.
   *
   * Execution may stop before an inferior finishes running due to a number of reasons,
   * for example a breakpoint being hit.
   * [[EVENT_TARGET_STOPPED]] will be emitted when execution stops.
   *
   * @param stopAtStart *(GDB specific)* If `true` then execution will stop at the start
   *                    of the main function.
   */
  startAllInferiors(stopAtStart?: boolean): Promise<void> {
    var fullCmd: string = 'exec-run --all';
    if (stopAtStart) {
      fullCmd = fullCmd + ' --start';
    }

    return this.executeCommand(fullCmd, null);
  }

  /**
   * Kills the currently selected inferior.
   */
  abortInferior(): Promise<void> {
    return this.executeCommand('exec-abort');
  }

  /**
   * Resumes execution of an inferior, execution may stop at any time due to a number of reasons,
   * for example a breakpoint being hit.
   * [[EVENT_TARGET_STOPPED]] will be emitted when execution stops.
   *
   * @param options.threadGroup *(GDB specific)* Identifier of the thread group to resume,
   *                            if omitted the currently selected inferior is resumed.
   * @param options.reverse *(GDB specific)* If **true** the inferior is executed in reverse.
   */
  resumeInferior(
    options?: { threadGroup?: string; reverse?: boolean }): Promise<void> {
    var fullCmd: string = 'exec-continue';
    if (options) {
      if (options.threadGroup) {
        fullCmd = fullCmd + ' --thread-group ' + options.threadGroup;
      }
      if (options.reverse) {
        fullCmd = fullCmd + ' --reverse';
      }
    }

    return this.executeCommand(fullCmd, null);
  }

  /**
   * Resumes execution of all inferiors.
   *
   * @param reverse *(GDB specific)* If `true` the inferiors are executed in reverse.
   */
  resumeAllInferiors(reverse?: boolean): Promise<void> {
    var fullCmd: string = 'exec-continue --all';
    if (reverse) {
      fullCmd = fullCmd + ' --reverse';
    }

    return this.executeCommand(fullCmd, null);
  }

  /**
   * Interrupts execution of an inferior.
   * [[EVENT_TARGET_STOPPED]] will be emitted when execution stops.
   *
   * @param options.threadGroup The identifier of the thread group to interrupt, if omitted the
   *                            currently selected inferior will be interrupted.
   */
  interruptInferior(threadGroup?: string): Promise<void> {
    var fullCmd: string = 'exec-interrupt';
    if (threadGroup) {
      fullCmd = fullCmd + ' --thread-group ' + threadGroup;
    }

    return this.executeCommand(fullCmd, null);
  }

  /**
   * Interrupts execution of all threads in all inferiors.
   *
   * [[EVENT_TARGET_STOPPED]] will be emitted when execution stops.
   */
  interruptAllInferiors(): Promise<void> {
    return this.executeCommand('exec-interrupt --all', null);
  }

  /**
   * Resumes execution of the target until the beginning of the next source line is reached.
   * If a function is called while the target is running then execution stops on the first
   * source line of the called function.
   * [[EVENT_TARGET_STOPPED]] will be emitted when execution stops.
   *
   * @param options.threadId Identifier of the thread to execute the command on.
   * @param options.reverse *(GDB specific)* If **true** the target is executed in reverse.
   */
  stepIntoLine(options?: { threadId?: number; reverse?: boolean }): Promise<void> {
    return this.executeCommand(appendExecCmdOptions('exec-step', options));
  }

  /**
   * Resumes execution of the target until the beginning of the next source line is reached.
   * [[EVENT_TARGET_STOPPED]] will be emitted when execution stops.
   *
   * @param options.threadId Identifier of the thread to execute the command on.
   * @param options.reverse *(GDB specific)* If **true** the target is executed in reverse until
   *                        the beginning of the previous source line is reached.
   */
  stepOverLine(options?: { threadId?: number; reverse?: boolean }): Promise<void> {
    return this.executeCommand(appendExecCmdOptions('exec-next', options));
  }

  /**
   * Executes one instruction, if the instruction is a function call then execution stops at the
   * beginning of the function.
   * [[EVENT_TARGET_STOPPED]] will be emitted when execution stops.
   *
   * @param options.threadId Identifier of the thread to execute the command on.
   * @param options.reverse *(GDB specific)* If **true** the target is executed in reverse until
   *                        the previous instruction is reached.
   */
  stepIntoInstruction(
    options?: { threadId?: number; reverse?: boolean }): Promise<void> {
    return this.executeCommand(appendExecCmdOptions('exec-step-instruction', options));
  }

  /**
   * Executes one instruction, if the instruction is a function call then execution continues
   * until the function returns.
   * [[EVENT_TARGET_STOPPED]] will be emitted when execution stops.
   *
   * @param options.threadId Identifier of the thread to execute the command on.
   * @param options.reverse *(GDB specific)* If **true** the target is executed in reverse until
   *                        the previous instruction is reached.
   */
  stepOverInstruction(
    options?: { threadId?: number; reverse?: boolean }): Promise<void> {
    return this.executeCommand(appendExecCmdOptions('exec-next-instruction', options));
  }

  /**
   * Resumes execution of the target until the current function returns.
   * [[EVENT_TARGET_STOPPED]] will be emitted when execution stops.
   *
   * @param options.threadId Identifier of the thread to execute the command on.
   * @param options.reverse *(GDB specific)* If **true** the target is executed in reverse.
   */
  stepOut(options?: { threadId?: number; reverse?: boolean }): Promise<void> {
    return this.executeCommand(appendExecCmdOptions('exec-finish', options));
  }

  //
  // Stack Inspection Commands
  //

  /**
   * Retrieves information about a stack frame.
   *
   * @param options.threadId The thread for which the stack depth should be retrieved,
   *                         defaults to the currently selected thread if not specified.
   * @param options.frameLevel Stack index of the frame for which to retrieve locals,
   *                           zero for the innermost frame, one for the frame from which the call
   *                           to the innermost frame originated, etc. Defaults to the currently
   *                           selected frame if not specified. If a value is provided for this
   *                           option then `threadId` must be specified as well.
   */
  getStackFrame(
    options?: { threadId?: number; frameLevel?: number }): Promise<IStackFrameInfo> {
    let fullCmd = 'stack-info-frame';
    if (options) {
      if (options.threadId !== undefined) {
        fullCmd = fullCmd + ' --thread ' + options.threadId;
      }
      if (options.frameLevel !== undefined) {
        fullCmd = fullCmd + ' --frame ' + options.frameLevel;
      }
    }

    return this.getCommandOutput(fullCmd, null, (output: any) => {
      return extractStackFrameInfo(output.frame);
    });
  }

  /**
   * Retrieves the current depth of the stack.
   *
   * @param options.threadId The thread for which the stack depth should be retrieved,
   *                         defaults to the currently selected thread if not specified.
   * @param options.maxDepth *(GDB specific)* If specified the returned stack depth will not exceed
   *                         this number.
   */
  getStackDepth(
    options?: { threadId?: number; maxDepth?: number }): Promise<number> {
    var fullCmd: string = 'stack-info-depth';
    if (options) {
      if (options.threadId !== undefined) {
        fullCmd = fullCmd + ' --thread ' + options.threadId;
      }
      if (options.maxDepth !== undefined) {
        fullCmd = fullCmd + ' ' + options.maxDepth;
      }
    }

    return this.getCommandOutput(fullCmd, null, (output: any) => {
      return parseInt(output.depth, 10);
    });
  }

  /**
   * Retrieves the frames currently on the stack.
   *
   * The `lowFrame` and `highFrame` options can be used to limit the number of frames retrieved,
   * if both are supplied only the frame with levels in that range (inclusive) are retrieved.
   * If either `lowFrame` or `highFrame` option is omitted (but not both) then only a single
   * frame corresponding to that level is retrieved.
   *
   * @param options.threadId The thread for which the stack frames should be retrieved,
   *                         defaults to the currently selected thread if not specified.
   * @param options.noFrameFilters *(GDB specific)* If `true` the Python frame filters will not be
   *                               executed.
   * @param options.lowFrame Must not be larger than the actual number of frames on the stack.
   * @param options.highFrame May be larger than the actual number of frames on the stack, in which
   *                          case only the existing frames will be retrieved.
   */
  getStackFrames(
    options?: { threadId?: number; lowFrame?: number; highFrame?: number; noFrameFilters?: boolean })
    : Promise<IStackFrameInfo[]> {
    var fullCmd: string = 'stack-list-frames';
    if (options) {
      if (options.threadId !== undefined) {
        fullCmd = fullCmd + ' --thread' + options.threadId;
      }
      if (options.noFrameFilters === true) {
        fullCmd = fullCmd + ' --no-frame-filters';
      }
      if ((options.lowFrame !== undefined) && (options.highFrame !== undefined)) {
        fullCmd = fullCmd + ` ${options.lowFrame} ${options.highFrame}`;
      } else if (options.lowFrame !== undefined) {
        fullCmd = fullCmd + ` ${options.lowFrame} ${options.lowFrame}`;
      } else if (options.highFrame !== undefined) {
        fullCmd = fullCmd + ` ${options.highFrame} ${options.highFrame}`;
      }
    }

    return this.getCommandOutput(fullCmd, null, (output: any) => {
      var data = output.stack.frame;
      if (Array.isArray(data)) {
        return data.map((frame: any) => { return extractStackFrameInfo(frame); });
      } else {
        return [extractStackFrameInfo(data)];
      }
    });
  }

  /**
   * Retrieves a list of all the arguments for the specified frames.
   *
   * The `lowFrame` and `highFrame` options can be used to limit the frames for which arguments
   * are retrieved. If both are supplied only the frames with levels in that range (inclusive) are
   * taken into account, if both are omitted the arguments of all frames currently on the stack
   * will be retrieved.
   *
   * Note that while it's possible to specify a frame range of one frame in order to retrieve the
   * arguments of a single frame it's better to just use [[getStackFrameVariables]] instead.
   *
   * @param detail Specifies what information should be retrieved for each argument.
   * @param options.threadId The thread for which arguments should be retrieved,
   *                         defaults to the currently selected thread if not specified.
   * @param options.noFrameFilters *(GDB specific)* If `true` then Python frame filters will not be
   *                               executed.
   * @param options.skipUnavailable If `true` information about arguments that are not available
   *                                will not be retrieved.
   * @param options.lowFrame Must not be larger than the actual number of frames on the stack.
   * @param options.highFrame May be larger than the actual number of frames on the stack, in which
   *                          case only the existing frames will be retrieved.
   */
  getStackFrameArgs(
    detail: VariableDetailLevel,
    options?: {
      threadId?: number;
      noFrameFilters?: boolean;
      skipUnavailable?: boolean;
      lowFrame?: number;
      highFrame?: number;
    }
  ): Promise<IStackFrameArgsInfo[]> {
    var fullCmd: string = 'stack-list-arguments';
    if (options) {
      if (options.threadId !== undefined) {
        fullCmd = fullCmd + ' --thread ' + options.threadId;
      }
      if (options.noFrameFilters === true) {
        fullCmd = fullCmd + ' --no-frame-filters';
      }
      if (options.skipUnavailable === true) {
        fullCmd = fullCmd + ' --skip-unavailable';
      }
    }

    fullCmd = fullCmd + ' ' + detail;

    if (options) {
      if ((options.lowFrame !== undefined) && (options.highFrame !== undefined)) {
        fullCmd = fullCmd + ` ${options.lowFrame} ${options.highFrame}`;
      } else if ((options.lowFrame !== undefined) && (options.highFrame === undefined)) {
        throw new Error("highFrame option must be provided to getStackFrameArgs() if lowFrame option is used.");
      } else if ((options.lowFrame === undefined) && (options.highFrame !== undefined)) {
        throw new Error("lowFrame option must be provided to getStackFrameArgs() if highFrame option is used.");
      }
    }

    return this.getCommandOutput(fullCmd, null, (output: any) => {
      var data = output['stack-args'];
      if (Array.isArray(data.frame)) {
        // data is in the form: { frame: [{ level: 0, args: [...] }, { level: 1, args: arg1 }, ...]
        return data.frame.map((frame: any): IStackFrameArgsInfo => {
          return {
            level: parseInt(frame.level, 10),
            args: Array.isArray(frame.args) ? frame.args : [frame.args]
          };
        });
      } else {
        // data is in the form: { frame: { level: 0, args: [...] }
        return [{
          level: parseInt(data.frame.level, 10),
          args: Array.isArray(data.frame.args) ? data.frame.args : [data.frame.args]
        }];
      }
    });
  }

  /**
   * Retrieves a list of all arguments and local variables in the specified frame.
   *
   * @param detail Specifies what information to retrieve for each argument or local variable.
   * @param options.threadId The thread for which variables should be retrieved,
   *                         defaults to the currently selected thread if not specified.
   * @param options.frameLevel Stack index of the frame for which to retrieve locals,
   *                           zero for the innermost frame, one for the frame from which the call
   *                           to the innermost frame originated, etc. Defaults to the currently
   *                           selected frame if not specified.
   * @param options.noFrameFilters *(GDB specific)* If `true` then Python frame filters will not be
   *                               executed.
   * @param options.skipUnavailable If `true` information about variables that are not available
   *                                will not be retrieved.
   */
  // getStackFrameVariables(
  //   detail: VariableDetailLevel,
  //   options?: {
  //     threadId?: number;
  //     frameLevel: number;
  //     noFrameFilters?: boolean;
  //     skipUnavailable?: boolean;
  //   }
  // ): Promise<IStackFrameVariablesInfo> {
  //   let fullCmd: string = 'stack-list-variables';
  //   if (options) {
  //     if (options.threadId !== undefined) {
  //       fullCmd = fullCmd + ' --thread ' + options.threadId;
  //     }
  //     if (options.frameLevel !== undefined) {
  //       fullCmd = fullCmd + ' --frame ' + options.frameLevel;
  //     }
  //     if (options.noFrameFilters === true) {
  //       fullCmd = fullCmd + ' --no-frame-filters';
  //     }
  //     if (options.skipUnavailable === true) {
  //       fullCmd = fullCmd + ' --skip-unavailable';
  //     }
  //   }
  //   fullCmd = fullCmd + ' ' + detail;

  //   return this.getCommandOutput(fullCmd, null, (output: any) => {
  //     let args: IVariableInfo[] = [];
  //     let locals: IVariableInfo[] = [];

  //     output.variables.forEach((varInfo: any) => {
  //       if (varInfo.arg === '1') {
  //         args.push({ name: varInfo.name, value: varInfo.value, type: varInfo.type });
  //       } else {
  //         locals.push({ name: varInfo.name, value: varInfo.value, type: varInfo.type });
  //       }
  //     });
  //     return { args: args, locals: locals };
  //   });
  // }

  //
  // Watch Manipulation (aka Variable Objects)
  //

  /**
   * Creates a new watch to monitor the value of the given expression.
   *
   * @param expression Any expression valid in the current language set (so long as it doesn't
   *                   begin with a `*`), or one of the following:
   *                   - a memory cell address, e.g. `*0x0000000000400cd0`
   *                   - a CPU register name, e.g. `$sp`
   * @param options.id Unique identifier for the new watch, if omitted one is auto-generated.
   *                   Auto-generated identifiers begin with the letters `var` and are followed by
   *                   one or more digits, when providing your own identifiers it's best to use a
   *                   different naming scheme that doesn't clash with auto-generated identifiers.
   * @param options.threadId The thread within which the watch expression will be evaluated.
   *                         *Default*: the currently selected thread.
   * @param options.threadGroup
   * @param options.frameLevel The index of the stack frame within which the watch expression will
   *                           be evaluated initially, zero for the innermost stack frame. Note that
   *                           if `frameLevel` is specified then `threadId` must also be specified.
   *                           *Default*: the currently selected frame.
   * @param options.frameAddress *(GDB specific)* Address of the frame within which the expression
   *                             should be evaluated.
   * @param options.isFloating Set to `true` if the expression should be re-evaluated every time
   *                           within the current frame, i.e. it's not bound to a specific frame.
   *                           Set to `false` if the expression should be bound to the frame within
   *                           which the watch is created.
   *                           *Default*: `false`.
   */
  addWatch(
    expression: string,
    options?: {
      id?: string;
      threadId?: number;
      threadGroup?: string;
      frameLevel?: number;
      frameAddress?: string;
      isFloating?: boolean;
    }
  ): Promise<IWatchInfo> {
    var fullCmd: string = 'var-create';
    var id = '-'; // auto-generate id
    var addr = '*'; // use current frame

    if (options) {
      if (options.id) {
        id = options.id;
      }
      if (options.threadId !== undefined) {
        fullCmd = fullCmd + ' --thread ' + options.threadId;
      }
      if (options.threadGroup) {
        fullCmd = fullCmd + ' --thread-group ' + options.threadGroup;
      }
      if (options.frameLevel !== undefined) {
        fullCmd = fullCmd + ' --frame ' + options.frameLevel;
      }
      if (options.isFloating === true) {
        addr = '@';
      } else if (options.frameAddress) {
        addr = options.frameAddress;
      }
    }

    fullCmd = fullCmd + ` ${id} ${addr} ${expression}`;

    return this.getCommandOutput(fullCmd, null, (output: any) => {
      return {
        id: output.name,
        childCount: parseInt(output.numchild, 10),
        value: output.value,
        expressionType: output['type'],
        threadId: parseInt(output['thread-id'], 10),
        hasMoreChildren: output.has_more !== '0',
        isDynamic: output.dynamic === '1',
        displayHint: output.displayhint
      };
    });
  }

  /**
   * Destroys a previously created watch.
   *
   * @param id Identifier of the watch to destroy.
   */
  removeWatch(id: string): Promise<void> {
    return this.executeCommand('var-delete ' + id);
  }

  /**
   * Updates the state of an existing watch.
   *
   * @param id Identifier of the watch to update.
   */
  updateWatch(id: string, detail?: VariableDetailLevel): Promise<IWatchUpdateInfo[]> {
    var fullCmd: string = 'var-update';
    if (detail !== undefined) {
      fullCmd = fullCmd + ' ' + detail;
    }
    fullCmd = fullCmd + ' ' + id;

    return this.getCommandOutput(fullCmd, null, (output: any) => {
      return output.changelist.map((data: any) => {
        return {
          id: data.name,
          childCount: (data.new_num_children ? parseInt(data.new_num_children, 10) : undefined),
          value: data.value,
          expressionType: data.new_type,
          isInScope: data.in_scope === 'true',
          isObsolete: data.in_scope === 'invalid',
          hasTypeChanged: data.type_changed === 'true',
          isDynamic: data.dynamic === '1',
          displayHint: data.displayhint,
          hasMoreChildren: data.has_more === '1',
          newChildren: data.new_children
        };
      });
    });
  }

  /**
   * Retrieves a list of direct children of the specified watch.
   *
   * A watch is automatically created for each child that is retrieved (if one doesn't already exist).
   * The `from` and `to` options can be used to retrieve a subset of children starting from child
   * index `from` and up to (but excluding) child index `to`, note that this currently doesn't work
   * on LLDB.
   *
   * @param id Identifier of the watch whose children should be retrieved.
   * @param options.detail One of:
   *     - [[VariableDetailLevel.None]]: Do not retrieve values of children, this is the default.
   *     - [[VariableDetailLevel.All]]: Retrieve values for all children.
   *     - [[VariableDetailLevel.Simple]]: Only retrieve values of children that have a simple type.
   * @param options.from Zero-based index of the first child to retrieve, if less than zero the
   *                     range is reset. `to` must also be set in order for this option to have any
   *                     effect.
   * @param options.to Zero-based index +1 of the last child to retrieve, if less than zero the
   *                   range is reset. `from` must also be set in order for this option to have any
   *                   effect.
   */
  getWatchChildren(
    id: string,
    options?: {
      detail?: VariableDetailLevel;
      from?: number;
      to?: number;
    }): Promise<IWatchChildInfo[]> {
    var fullCmd: string = 'var-list-children';
    if (options && (options.detail !== undefined)) {
      fullCmd = fullCmd + ' ' + options.detail;
    }
    fullCmd = fullCmd + ' ' + id;
    if (options && (options.from !== undefined) && (options.to !== undefined)) {
      fullCmd = fullCmd + ' ' + options.from + ' ' + options.to;
    }

    return this.getCommandOutput(fullCmd, null, (output: any) => {
      return extractWatchChildren(output.children);
    });
  }

  /**
   * Sets the output format for the value of a watch.
   *
   * @param id Identifier of the watch for which the format specifier should be set.
   * @param formatSpec The output format for the watch value.
   * @returns A promise that will be resolved with the value of the watch formatted using the
   *          provided `formatSpec`.
   */
  setWatchValueFormat(id: string, formatSpec: WatchFormatSpec): Promise<string> {
    var fullCmd: string = `var-set-format ${id} ` + watchFormatSpecToStringMap.get(formatSpec);

    return this.getCommandOutput<string>(fullCmd, null, (output: any) => {
      if (output.value) {
        return output.value; // GDB-MI
      } else {
        return output.changelist[0].value; // LLDB-MI
      }
    });
  }

  /**
   * Evaluates the watch expression and returns the result.
   *
   * @param id Identifier of the watch whose value should be retrieved.
   * @param formatSpec The output format for the watch value.
   * @returns A promise that will be resolved with the value of the watch.
   */
  getWatchValue(id: string, formatSpec?: WatchFormatSpec): Promise<string> {
    var fullCmd: string = 'var-evaluate-expression';
    if (formatSpec !== undefined) {
      fullCmd = fullCmd + ' -f ' + watchFormatSpecToStringMap.get(formatSpec);
    }
    fullCmd = fullCmd + ' ' + id;

    return this.getCommandOutput(fullCmd, null, (output: any) => {
      return output.value;
    });
  }

  /**
   * Sets the value of the watch expression to the value of the given expression.
   *
   * @param id Identifier of the watch whose value should be modified.
   * @param expression The value of this expression will be assigned to the watch expression.
   * @returns A promise that will be resolved with the new value of the watch.
   */
  setWatchValue(id: string, expression: string): Promise<string> {
    return this.getCommandOutput(`var-assign ${id} "${expression}"`, null, (output: any) => {
      return output.value;
    });
  }

  /**
   * Retrives a list of attributes for the given watch.
   *
   * @param id Identifier of the watch whose attributes should be retrieved.
   * @returns A promise that will be resolved with the list of watch attributes.
   */
  getWatchAttributes(id: string): Promise<WatchAttribute[]> {
    var cmd = 'var-show-attributes ' + id;

    return this.getCommandOutput(cmd, null, (output: any) => {
      if (output.status) { // LLDB-MI
        return [stringToWatchAttributeMap.get(output.status)];
      } else if (output.attr) { // GDB-MI
        if (Array.isArray(output.attr)) {
          return output.attr.map((attr: string) => {
            return stringToWatchAttributeMap.get(attr);
          });
        } else {
          return [stringToWatchAttributeMap.get(output.attr)];
        }
      }
      throw new MalformedResponseError(
        'Expected to find "status" or "attr", found neither.', output, cmd
      );
    });
  }

  /**
   * Retrieves an expression that can be evaluated in the current context to obtain the watch value.
   *
   * @param id Identifier of the watch whose path expression should be retrieved.
   * @returns A promise that will be resolved with the path expression of the watch.
   */
  getWatchExpression(id: string): Promise<string> {
    var cmd = 'var-info-path-expression ' + id;

    return this.getCommandOutput(cmd, null, (output: any) => {
      if (output.path_expr) {
        return output.path_expr;
      }
      throw new MalformedResponseError('Expected to find "path_expr".', output, cmd);
    });
  }

  //
  // Data Inspection & Manipulation
  //

  /**
   * Evaluates the given expression within the target process and returns the result.
   *
   * The expression may contain function calls, which will be executed synchronously.
   *
   * @param expression The expression to evaluate.
   * @param options.threadId The thread within which the expression should be evaluated.
   *                         *Default*: the currently selected thread.
   * @param options.frameLevel The index of the stack frame within which the expression should
   *                           be evaluated, zero for the innermost stack frame. Note that
   *                           if `frameLevel` is specified then `threadId` must also be specified.
   *                           *Default*: the currently selected frame.
   * @returns A promise that will be resolved with the value of the expression.
   */
  evaluateExpression(
    expression: string, options?: { threadId?: number; frameLevel?: number }): Promise<string> {
    var fullCmd = 'data-evaluate-expression';
    if (options) {
      if (options.threadId !== undefined) {
        fullCmd = fullCmd + ' --thread ' + options.threadId;
      }
      if (options.frameLevel !== undefined) {
        fullCmd = fullCmd + ' --frame ' + options.frameLevel;
      }
    }
    fullCmd = fullCmd + ` "${expression}"`;

    return this.getCommandOutput(fullCmd, null, (output: any) => {
      if (output.value) {
        return output.value;
      }
      throw new MalformedResponseError('Expected to find "value".', output, fullCmd);
    });
  }

  /**
   * Attempts to read all accessible memory regions in the given range.
   *
   * @param address Start of the range from which memory should be read, this can be a literal
   *                address (e.g. `0x00007fffffffed30`) or an expression (e.g. `&someBuffer`) that
   *                evaluates to the desired address.
   * @param numBytesToRead Number of bytes that should be read.
   * @param options.byteOffset Offset in bytes relative to `address` from which to begin reading.
   * @returns A promise that will be resolved with a list of memory blocks that were read.
   */
  readMemory(address: string, numBytesToRead: number, options?: { byteOffset?: number })
    : Promise<IMemoryBlock[]> {
    var fullCmd = 'data-read-memory-bytes';
    if (options && options.byteOffset) {
      fullCmd = fullCmd + ' -o ' + options.byteOffset;
    }
    fullCmd = fullCmd + ` "${address}" ${numBytesToRead}`;

    return this.getCommandOutput(fullCmd, null, (output: any) => {
      if (output.memory) {
        return output.memory;
      }
      throw new MalformedResponseError('Expected to find "memory".', output, fullCmd);
    });
  }

  /**
   * Retrieves a list of register names for the current target.
   *
   * @param registers List of numbers corresponding to the register names to be retrieved.
   *                  If this argument is omitted all register names will be retrieved.
   * @returns A promise that will be resolved with a list of register names.
   */
  getRegisterNames(registers?: number[]): Promise<string[]> {
    var fullCmd = 'data-list-register-names';
    if (registers && (registers.length > 0)) {
      fullCmd = fullCmd + ' ' + registers.join(' ');
    }

    return this.getCommandOutput(fullCmd, null, (output: any) => {
      if (output['register-names']) {
        return output['register-names'];
      }
      throw new MalformedResponseError('Expected to find "register-names".', output, fullCmd);
    });
  }

  /**
   * Retrieves the values of registers.
   *
   * @param formatSpec Specifies how the register values should be formatted.
   * @param options.registers Register numbers of the registers for which values should be retrieved.
   *                          If this option is omitted the values of all registers will be retrieved.
   * @param options.skipUnavailable *(GDB specific)* If `true` only values of available registers
   *                                will be retrieved.
   * @param options.threadId Identifier of the thread from which register values should be retrieved.
   *                         If this option is omitted it will default to the currently selected thread.
   *                         NOTE: This option is not currently supported by LLDB-MI.
   * @param options.frameLevel Index of the frame from which register values should be retrieved.
   *                           This is a zero-based index, zero corresponds to the innermost frame
   *                           on the stack. If this option is omitted it will default to the
   *                           currently selected frame.
   *                           NOTE: This option is not currently supported by LLDB-MI.
   * @returns A promise that will be resolved with a map of register numbers to register values.
   */
  getRegisterValues(
    formatSpec: RegisterValueFormatSpec,
    options?: {
      registers?: number[];
      skipUnavailable?: boolean;
      threadId?: number;
      frameLevel?: number
    }
  ): Promise<Map<number, string>> {
    var fullCmd = 'data-list-register-values';
    if (options) {
      if (options.threadId !== undefined) {
        fullCmd = fullCmd + ' --thread ' + options.threadId;
      }
      if (options.frameLevel !== undefined) {
        fullCmd = fullCmd + ' --frame ' + options.frameLevel;
      }
      if (options.skipUnavailable) {
        fullCmd = fullCmd + ' --skip-unavailable';
      }
    }
    fullCmd = fullCmd + ' ' + registerValueFormatSpecToCodeMap.get(formatSpec);
    if (options && options.registers && (options.registers.length > 0)) {
      fullCmd = fullCmd + ' ' + options.registers.join(' ');
    }

    return this.getCommandOutput(fullCmd, null, (output: any) => {
      var registers: { number: string; value: string }[] = output['register-values'];
      var registerMap = new Map<number, string>();
      if (registers) {
        registers.forEach((register) => {
          registerMap.set(parseInt(register.number, 10), register.value);
        });
        return registerMap;
      }
      throw new MalformedResponseError('Expected to find "register-values".', output, fullCmd);
    });
  }

  /**
   * Retrieves assembly instructions within the specified address range.
   *
   * No source line information will be provided for the assembly instructions that are retrieved,
   * if such information is required [[disassembleAddressRangeByLine]] should be used instead.
   *
   * @param start Start of the address range to disassemble. GDB allows this to be an expression
   *              that can be evaluated to obtain the address (e.g. $pc), however LLDB-MI only
   *              accepts number literals (e.g. 0x4009cc).
   * @param end End of the address range to disassemble, same caveats apply as for `start`.
   * @param showOpcodes If `true` the raw opcode bytes will be retrieved for each instruction.
   * @returns A promise that will be resolved with a list of assembly instructions (and associated
   *          meta-data).
   */
  disassembleAddressRange(start: string, end: string, showOpcodes?: boolean)
    : Promise<IAsmInstruction[]> {
    var fullCmd = `data-disassemble -s ${start} -e ${end} -- ` + (showOpcodes ? '2' : '0');

    return this.getCommandOutput(fullCmd, null, (output: any) => {
      if (output.asm_insns) {
        return extractAsmInstructions(output.asm_insns);
      }
      throw new MalformedResponseError('Expected to find "asm_insns".', output, fullCmd);
    });
  }

  /**
   * Retrieves assembly instructions within a specified address range grouped by source line.
   *
   * If source line information is not required [[disassembleAddressRange]] should be used instead.
   *
   * @param start Start of the address range to disassemble. GDB allows this to be an expression
   *              that can be evaluated to obtain the address (e.g. $pc), however LLDB-MI only
   *              accepts number literals (e.g. 0x4009cc).
   * @param end End of the address range to disassemble, same caveats apply as for `start`.
   * @param showOpcodes If `true` the raw opcode bytes will be retrieved for each instruction.
   * @returns A promise that will be resolved with a list lines, each of which will contain one
   *          or more assembly instructions (and associated meta-data).
   */
  disassembleAddressRangeByLine(start: string, end: string, showOpcodes?: boolean)
    : Promise<ISourceLineAsm[]> {
    var fullCmd = `data-disassemble -s ${start} -e ${end} -- ` + (showOpcodes ? '3' : '1');

    return this.getCommandOutput(fullCmd, null, (output: any) => {
      if (output.asm_insns) {
        return extractAsmBySourceLine(output.asm_insns);
      }
      throw new MalformedResponseError('Expected to find "asm_insns".', output, fullCmd);
    });
  }

  /**
   * Retrieves assembly instructions for the specified source file.
   *
   * No source line information will be provided for the assembly instructions that are retrieved,
   * if such information is required [[disassembleFileByLine]] should be used instead.
   *
   * @param filename Source file to disassemble, e.g. main.cpp
   * @param line Line number in `filename` to disassemble around.
   * @param options.maxInstructions Maximum number of assembly instructions to retrieve.
   *                                If this option is ommitted the entire function at the specified
   *                                source line will be disassembled.
   * @param options.showOpcodes If `true` the raw opcode bytes will be retrieved for each instruction.
   * @returns A promise that will be resolved with a list of assembly instructions (and associated
   *          meta-data).
   */
  disassembleFile(
    filename: string, line: number, options?: { maxInstructions?: number; showOpcodes?: boolean }
  ): Promise<IAsmInstruction[]> {
    var fullCmd = `data-disassemble -f ${filename} -l ${line}`;
    if (options && (options.maxInstructions !== undefined)) {
      fullCmd = fullCmd + ' -n ' + options.maxInstructions;
    }
    fullCmd = fullCmd + ' -- ' + ((options && options.showOpcodes) ? '2' : '0');

    return this.getCommandOutput(fullCmd, null, (output: any) => {
      if (output.asm_insns) {
        return extractAsmInstructions(output.asm_insns);
      }
      throw new MalformedResponseError('Expected to find "asm_insns".', output, fullCmd);
    });
  }

  /**
   * Retrieves assembly instructions for the specified source file grouped by source line.
   *
   * If source line information is not required [[disassembleFile]] should be used instead.
   *
   * @param filename Source file to disassemble, e.g. main.cpp
   * @param line Line number in `filename` to disassemble around.
   * @param options.maxInstructions Maximum number of assembly instructions to retrieve.
   *                                If this option is ommitted the entire function at the specified
   *                                source line will be disassembled.
   * @param options.showOpcodes If `true` the raw opcode bytes will be retrieved for each instruction.
   * @returns A promise that will be resolved with a list lines, each of which will contain one
   *          or more assembly instructions (and associated meta-data).
   */
  disassembleFileByLine(
    filename: string, line: number, options?: { maxInstructions?: number; showOpcodes?: boolean }
  ): Promise<ISourceLineAsm[]> {
    var fullCmd = `data-disassemble -f ${filename} -l ${line}`;
    if (options && (options.maxInstructions !== undefined)) {
      fullCmd = fullCmd + ' -n ' + options.maxInstructions;
    }
    fullCmd = fullCmd + ' -- ' + ((options && options.showOpcodes) ? '3' : '1');

    return this.getCommandOutput(fullCmd, null, (output: any) => {
      if (output.asm_insns) {
        return extractAsmBySourceLine(output.asm_insns);
      }
      throw new MalformedResponseError('Expected to find "asm_insns".', output, fullCmd);
    });
  }

  /**
   * Gets information about a thread in an inferior.
   * @returns A promise that will be resolved with information about a thread.
   */
  getThread(threadId: number): Promise<IThreadInfo> {
    let fullCmd = 'thread-info ' + threadId;
    return this.getCommandOutput(fullCmd, null, (output: any) => {
      if (output.threads && (output.threads.length === 1)) {
        return extractThreadInfo(output.threads[0]);
      }
      throw new MalformedResponseError(
        'Expected to find "threads" list with a single element.', output, fullCmd
      );
    });
  }

  /**
   * Gets information about all threads in all inferiors.
   * @returns A promise that will be resolved with information about all threads.
   */
  getThreads(): Promise<IMultiThreadInfo> {
    let fullCmd = 'thread-info';
    return this.getCommandOutput(fullCmd, null, (output: any) => {
      let currentThreadId: number = parseInt(output['current-thread-id'], 10);
      if (Array.isArray(output.threads)) {
        let currentThread: IThreadInfo;
        let threads: IThreadInfo[] = output.threads.map((data: any) => {
          let thread: IThreadInfo = extractThreadInfo(data);
          if (thread.id === currentThreadId) {
            currentThread = thread;
          }
          return thread;
        });
        return { all: threads, current: currentThread };
      }
      throw new MalformedResponseError('Expected to find "threads" list.', output, fullCmd);
    });
  }


  //===
  //JIN
  //global scope variables
  getGlobalVariables(): Promise<IVariableInfo[]> {
    let fullCmd: string = 'ta v -T -D1'

    return this.getCommandOutput(fullCmd, null, (output: any) => {
      if (output) {//FIXME 
        output = output.slice(1, output.length)
        let current: any = rawCommandOuputParser.parse(`(0) 0 = { ${output.join("\n")} }`)
        return current[0].variables
      } else {
        return []
      }
    }, true)
  }

  //stack frame variables
  getStackFrameVariables(threadId?: number, frameLevel?: number): Promise<IVariableInfo[]> {
    let fullCmd: string = 'fr v -T -D1'

    return this.getCommandOutput(fullCmd, null, (output: any) => {
      if (output) {//FIXME 
        let current: any = rawCommandOuputParser.parse(`(0) 0 = { ${output.join("\n")} \n}`)
        return current[0].variables
      } else {
        return []
      }
    }, true)
  }


  getVariableContent(variableName: string, threadId?: number, frameLevel?: number): Promise<IVariableInfo[]> {
    let fullCmd: string = 'fr v -T -D2 ' + variableName;

    return this.getCommandOutput(fullCmd, null, (output: any) => {
      if (output) {//FIXME 
        let current: any = rawCommandOuputParser.parse(output.join("\n"))
        return current[0].variables
      } else {
        return []
      }
    }, true);
  }

}

/**
 * Appends some common options used by -exec-* MI commands to the given string.
 *
 * @returns The result of appending the options to the input string.
 */
function appendExecCmdOptions(
  input: string, options: { threadId?: number; reverse?: boolean }): string {
  var cmd: string = input;
  if (options) {
    if (options.threadId !== undefined) {
      cmd = cmd + ' --thread ' + options.threadId;
    }
    if (options.reverse) {
      cmd = cmd + ' --reverse';
    }
  }
  return cmd;
}

// maps WatchFormatSpec enum members to the corresponding MI string
var watchFormatSpecToStringMap = new Map<WatchFormatSpec, string>()
  .set(WatchFormatSpec.Binary, 'binary')
  .set(WatchFormatSpec.Decimal, 'decimal')
  .set(WatchFormatSpec.Hexadecimal, 'hexadecimal')
  .set(WatchFormatSpec.Octal, 'octal')
  .set(WatchFormatSpec.Default, 'natural');

var stringToWatchAttributeMap = new Map<string, WatchAttribute>()
  .set('editable', WatchAttribute.Editable)
  .set('noneditable', WatchAttribute.NonEditable);

// maps RegisterValueFormatSpec enum members to the corresponding MI code
var registerValueFormatSpecToCodeMap = new Map<RegisterValueFormatSpec, string>()
  .set(RegisterValueFormatSpec.Binary, 't')
  .set(RegisterValueFormatSpec.Decimal, 'd')
  .set(RegisterValueFormatSpec.Hexadecimal, 'x')
  .set(RegisterValueFormatSpec.Octal, 'o')
  .set(RegisterValueFormatSpec.Raw, 'r')
  .set(RegisterValueFormatSpec.Default, 'N');

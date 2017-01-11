// Copyright (c) 2015 Vadim Macagon
// MIT License, see LICENSE file for full terms.

import { TargetStopReason, IFrameInfo, IBreakpointInfo } from './types';
import { extractBreakpointInfo } from './extractors';

/**
  * Emitted when a thread group is added by the debugger, it's possible the thread group
  * hasn't yet been associated with a running program.
  *
  * Listener function should have the signature:
  * ~~~
  * (e: [[IThreadGroupAddedEvent]]) => void
  * ~~~
  * @event
  */
export const EVENT_THREAD_GROUP_ADDED: string = 'thdgrpadd';
/**
  * Emitted when a thread group is removed by the debugger.
  *
  * Listener function should have the signature:
  * ~~~
  * (e: [[IThreadGroupRemovedEvent]]) => void
  * ~~~
  * @event
  */
export const EVENT_THREAD_GROUP_REMOVED: string = 'thdgrprem';
/**
  * Emitted when a thread group is associated with a running program,
  * either because the program was started or the debugger was attached to it.
  *
  * Listener function should have the signature:
  * ~~~
  * (e: [[IThreadGroupStartedEvent]]) => void
  * ~~~
  * @event
  */
export const EVENT_THREAD_GROUP_STARTED: string = 'thdgrpstart';
/**
  * Emitted when a thread group ceases to be associated with a running program,
  * either because the program terminated or the debugger was dettached from it.
  *
  * Listener function should have the signature:
  * ~~~
  * (e: [[IThreadGroupExitedEvent]]) => void
  * ~~~
  * @event
  */
export const EVENT_THREAD_GROUP_EXITED: string = 'thdgrpexit';
/**
  * Emitted when a thread is created.
  *
  * Listener function should have the signature:
  * ~~~
  * (e: [[IThreadCreatedEvent]]) => void
  * ~~~
  * @event
  */
export const EVENT_THREAD_CREATED: string = 'thdcreate';
/**
  * Emitted when a thread exits.
  *
  * Listener function should have the signature:
  * ~~~
  * (e: [[IThreadExitedEvent]]) => void
  * ~~~
  * @event
  */
export const EVENT_THREAD_EXITED: string = 'thdexit';
/**
  * Emitted when the debugger changes the current thread selection.
  *
  * Listener function should have the signature:
  * ~~~
  * (e: [[IThreadSelectedEvent]]) => void
  * ~~~
  * @event
  */
export const EVENT_THREAD_SELECTED: string = 'thdselect';
/**
  * Emitted when a new library is loaded by the program being debugged.
  *
  * Listener function should have the signature:
  * ~~~
  * (e: [[ILibLoadedEvent]]) => void
  * ~~~
  * @event
  */
export const EVENT_LIB_LOADED: string = 'libload';
/**
  * Emitted when a library is unloaded by the program being debugged.
  *
  * Listener function should have the signature:
  * ~~~
  * (e: [[ILibUnloadedEvent]]) => void
  * ~~~
  * @event
  */
export const EVENT_LIB_UNLOADED: string = 'libunload';

/**
  * Emitted when some console output from the debugger becomes available,
  * usually in response to a CLI command.
  *
  * Listener function should have the signature:
  * ~~~
  * (output: string) => void
  * ~~~
  * @event
  */
export const EVENT_DBG_CONSOLE_OUTPUT: string = 'conout';

/**
  * Emitted when some console output from the target becomes available.
  *
  * Listener function should have the signature:
  * ~~~
  * (output: string) => void
  * ~~~
  * @event
  */
export const EVENT_TARGET_OUTPUT: string = 'targetout';

/**
  * Emitted when log output from the debugger becomes available.
  *
  * Listener function should have the signature:
  * ~~~
  * (output: string) => void
  * ~~~
  * @event
  */
export const EVENT_DBG_LOG_OUTPUT: string = 'dbgout';

/**
  * Emitted when the target starts running.
  *
  * The `threadId` passed to the listener indicates which specific thread is now running,
  * a value of **"all"** indicates all threads are running. According to the GDB/MI spec.
  * no interaction with a running thread is possible after this notification is produced until
  * it is stopped again.
  *
  * Listener function should have the signature:
  * ~~~
  * (threadId: string) => void
  * ~~~
  * @event
  */
export const EVENT_TARGET_RUNNING: string = 'targetrun';

/**
  * Emitted when the target stops running.
  *
  * Listener function should have the signature:
  * ~~~
  * (e: [[ITargetStoppedEvent]]) => void
  * ~~~
  * @event
  */
export const EVENT_TARGET_STOPPED: string = 'targetstop';

/**
  * Emitted when the target stops running because a breakpoint was hit.
  *
  * Listener function should have the signature:
  * ~~~
  * (e: [[IBreakpointHitEvent]]) => void
  * ~~~
  * @event
  */
export const EVENT_BREAKPOINT_HIT: string = 'brkpthit';

/**
  * Emitted when the target stops due to a stepping operation finishing.
  *
  * Listener function should have the signature:
  * ~~~
  * (e: [[IStepFinishedEvent]]) => void
  * ~~~
  * @event
  */
export const EVENT_STEP_FINISHED: string = 'endstep';

/**
  * Emitted when the target stops due to a step-out operation finishing.
  *
  * NOTE: Currently this event will not be emitted by LLDB-MI, it will only be emitted by GDB-MI,
  * so for the time being use [[EVENT_STEP_FINISHED]] with LLDB-MI.
  *
  * Listener function should have the signature:
  * ~~~
  * (e: [[IStepOutFinishedEvent]]) => void
  * ~~~
  * @event
  */
export const EVENT_FUNCTION_FINISHED: string = 'endfunc';

/**
  * Emitted when the target stops running because it received a signal.
  *
  * Listener function should have the signature:
  * ~~~
  * (e: [[ISignalReceivedEvent]]) => void
  * ~~~
  * @event
  */
export const EVENT_SIGNAL_RECEIVED: string = 'signal';

/**
  * Emitted when the target stops running due to an exception.
  *
  * Listener function should have the signature:
  * ~~~
  * (e: [[IExceptionReceivedEvent]]) => void
  * ~~~
  * @event
  */
export const EVENT_EXCEPTION_RECEIVED: string = 'exception';

/**
  * Emitted when a breakpoint is modified by the debugger.
  *
  * Listener function should have the signature:
  * ~~~
  * (e: [[IBreakpointModifiedEvent]]) => void
  * ~~~
  * @event
  */
export const EVENT_BREAKPOINT_MODIFIED = 'breakpoint-modified';

export interface IThreadGroupAddedEvent {
  id: string;
}

export interface IThreadGroupRemovedEvent {
  id: string;
}

export interface IThreadGroupStartedEvent {
  id: string;
  pid: string;
}

export interface IThreadGroupExitedEvent {
  id: string;
  exitCode: string;
}

export interface IThreadCreatedEvent {
  id: number;
  groupId: string;
}

export interface IThreadExitedEvent {
  id: number;
  groupId: string;
}

export interface IThreadSelectedEvent {
  id: number;
}

/** Notification sent whenever a library is loaded or unloaded by an inferior. */
export interface ILibEvent {
  id: string;
  /** Name of the library file on the target system. */
  targetName: string;
  /**
    * Name of the library file on the host system.
    * When debugging locally this should be the same as `targetName`.
    */
  hostName: string;
  /**
    * Optional identifier of the thread group within which the library was loaded.
    */
  threadGroup: string;
  /**
    * Optional load address.
    * This field is not part of the GDB MI spec. and is only set by LLDB MI driver.
    */
  loadAddress: string;
  /**
    * Optional path to a file containing additional debug information.
    * This field is not part of the GDB MI spec. and is only set by LLDB MI driver.
    * The LLDB MI driver gets the value for this field from SBModule::GetSymbolFileSpec().
    */
  symbolsPath: string;
}

export interface ILibLoadedEvent extends ILibEvent { }
export interface ILibUnloadedEvent extends ILibEvent { }

export interface ITargetStoppedEvent {
  reason: TargetStopReason;
  /** Identifier of the thread that caused the target to stop. */
  threadId: number;
  /**
    * Identifiers of the threads that were stopped,
    * if all threads were stopped this array will be empty.
    */
  stoppedThreads: number[];
  /**
   * Processor core on which the stop event occured.
   * The debugger may not always provide a value for this field, in which case it will be `undefined`.
   */
  processorCore: string;
}

export interface IBreakpointHitEvent extends ITargetStoppedEvent {
  breakpointId: number;
  frame: IFrameInfo;
}

export interface IStepFinishedEvent extends ITargetStoppedEvent {
  frame: IFrameInfo;
}

export interface IStepOutFinishedEvent extends ITargetStoppedEvent {
  frame: IFrameInfo;
  resultVar?: string;
  returnValue?: string;
}

export interface ISignalReceivedEvent extends ITargetStoppedEvent {
  signalCode?: string;
  signalName?: string;
  signalMeaning?: string;
}

export interface IExceptionReceivedEvent extends ITargetStoppedEvent {
  exception: string;
}

export interface IBreakpointModifiedEvent {
  breakpoint: IBreakpointInfo;
}

export interface IDebugSessionEvent {
  name: string;
  data: any;
}

export function createEventsForExecNotification(notification: string, data: any): IDebugSessionEvent[] {
  switch (notification) {
    case 'running':
      return [{ name: EVENT_TARGET_RUNNING, data: data['thread-id'] }];

    case 'stopped':
      let stopEvent: ITargetStoppedEvent = {
        reason: parseTargetStopReason(data.reason),
        threadId: parseInt(data['thread-id'], 10),
        stoppedThreads: parseStoppedThreadsList(data['stopped-threads']),
        processorCore: data.core
      };
      let events: IDebugSessionEvent[] = [{ name: EVENT_TARGET_STOPPED, data: stopEvent }];

      // emit a more specialized event for notifications that contain additional info
      switch (stopEvent.reason) {
        case TargetStopReason.BreakpointHit:
          let breakpointHitEvent: IBreakpointHitEvent = {
            reason: stopEvent.reason,
            threadId: stopEvent.threadId,
            stoppedThreads: stopEvent.stoppedThreads,
            processorCore: stopEvent.processorCore,
            breakpointId: parseInt(data.bkptno, 10),
            frame: extractFrameInfo(data.frame)
          };
          events.push({ name: EVENT_BREAKPOINT_HIT, data: breakpointHitEvent });
          break;

        case TargetStopReason.EndSteppingRange:
          let stepFinishedEvent: IStepFinishedEvent = {
            reason: stopEvent.reason,
            threadId: stopEvent.threadId,
            stoppedThreads: stopEvent.stoppedThreads,
            processorCore: stopEvent.processorCore,
            frame: extractFrameInfo(data.frame)
          };
          events.push({ name: EVENT_STEP_FINISHED, data: stepFinishedEvent });
          break;

        case TargetStopReason.FunctionFinished:
          let stepOutEvent: IStepOutFinishedEvent = {
            reason: stopEvent.reason,
            threadId: stopEvent.threadId,
            stoppedThreads: stopEvent.stoppedThreads,
            processorCore: stopEvent.processorCore,
            frame: extractFrameInfo(data.frame),
            resultVar: data['gdb-result-var'],
            returnValue: data['return-value']
          };
          events.push({ name: EVENT_FUNCTION_FINISHED, data: stepOutEvent });
          break;

        case TargetStopReason.SignalReceived:
          let signalEvent: ISignalReceivedEvent = {
            reason: stopEvent.reason,
            threadId: stopEvent.threadId,
            stoppedThreads: stopEvent.stoppedThreads,
            processorCore: stopEvent.processorCore,
            signalCode: data.signal,
            signalName: data['signal-name'],
            signalMeaning: data['signal-meaning']
          };
          events.push({ name: EVENT_SIGNAL_RECEIVED, data: signalEvent });
          break;

        case TargetStopReason.ExceptionReceived:
          let exceptionEvent: IExceptionReceivedEvent = {
            reason: stopEvent.reason,
            threadId: stopEvent.threadId,
            stoppedThreads: stopEvent.stoppedThreads,
            processorCore: stopEvent.processorCore,
            exception: data.exception
          };
          events.push({ name: EVENT_EXCEPTION_RECEIVED, data: exceptionEvent });
          break;
      }
      return events;

    default:
      // TODO: log and keep on going
      return [];
  }
}

export function createEventForAsyncNotification(notification: string, data: any): IDebugSessionEvent {
  switch (notification) {
    case 'thread-group-added':
      return { name: EVENT_THREAD_GROUP_ADDED, data: data };

    case 'thread-group-removed':
      return { name: EVENT_THREAD_GROUP_REMOVED, data: data };

    case 'thread-group-started':
      return { name: EVENT_THREAD_GROUP_STARTED, data: data };

    case 'thread-group-exited':
      let groupExitedEvent: IThreadGroupExitedEvent = {
        id: data.id,
        exitCode: data['exit-code']
      };
      return { name: EVENT_THREAD_GROUP_EXITED, data: groupExitedEvent };

    case 'thread-created':
      const threadCreatedEvent: IThreadCreatedEvent = {
        id: data.id ? parseInt(data.id, 10) : undefined,
        groupId: data['group-id']
      };
      return { name: EVENT_THREAD_CREATED, data: threadCreatedEvent };

    case 'thread-exited':
      const threadExitedEvent: IThreadExitedEvent = {
        id: data.id ? parseInt(data.id, 10) : undefined,
        groupId: data['group-id']
      };
      return { name: EVENT_THREAD_EXITED, data: threadExitedEvent };

    case 'thread-selected':
      const threadSelectedEvent: IThreadSelectedEvent = {
        id: data.id ? parseInt(data.id, 10) : undefined
      };
      return { name: EVENT_THREAD_SELECTED, data: threadSelectedEvent };

    case 'library-loaded':
      let libLoadedEvent: ILibLoadedEvent = {
        id: data.id,
        targetName: data['target-name'],
        hostName: data['host-name'],
        threadGroup: data['thread-group'],
        symbolsPath: data['symbols-path'],
        loadAddress: data.loaded_addr
      };
      return { name: EVENT_LIB_LOADED, data: libLoadedEvent };

    case 'library-unloaded':
      let libUnloadedEvent: ILibUnloadedEvent = {
        id: data.id,
        targetName: data['target-name'],
        hostName: data['host-name'],
        threadGroup: data['thread-group'],
        symbolsPath: data['symbols-path'],
        loadAddress: data.loaded_addr
      };
      return { name: EVENT_LIB_UNLOADED, data: libUnloadedEvent };

    case 'breakpoint-modified':
      return {
        name: EVENT_BREAKPOINT_MODIFIED,
        data: <IBreakpointModifiedEvent> {
          breakpoint: extractBreakpointInfo(data)
        }
      };

    default:
      // TODO: log and keep on going
      return undefined;
  };
}

/**
  * Creates an object that conforms to the IFrameInfo interface from the output of the
  * MI Output parser.
  */
function extractFrameInfo(data: any): IFrameInfo {
  return {
    func: data.func,
    args: data.args,
    address: data.addr,
    filename: data.file,
    fullname: data.fullname,
    line: data.line ? parseInt(data.line, 10) : undefined,
  };
}

// There are more reasons listed in the GDB/MI spec., the ones here are just the subset that's
// actually used by LLDB MI at this time (11-Apr-2015).
var targetStopReasonMap = new Map<string, TargetStopReason>()
  .set('breakpoint-hit', TargetStopReason.BreakpointHit)
  .set('end-stepping-range', TargetStopReason.EndSteppingRange)
  .set('function-finished', TargetStopReason.FunctionFinished)
  .set('exited-normally', TargetStopReason.ExitedNormally)
  .set('exited-signalled', TargetStopReason.ExitedSignalled)
  .set('exited', TargetStopReason.Exited)
  .set('signal-received', TargetStopReason.SignalReceived)
  .set('exception-received', TargetStopReason.ExceptionReceived);

function parseTargetStopReason(reasonString: string): TargetStopReason {
  var reasonCode = targetStopReasonMap.get(reasonString);
  if (reasonCode !== undefined) {
    return reasonCode;
  }
  // TODO: log and keep on running
  return TargetStopReason.Unrecognized;
}

/**
  * Parses a list of stopped threads from a GDB/MI 'stopped' async notification.
  * @return An array of thread identifiers, an empty array is used to indicate that all threads
  *         were stopped.
  */
function parseStoppedThreadsList(stoppedThreads: string): number[] {
  if (stoppedThreads === 'all') {
    return [];
  } else {
    // FIXME: GDB/MI spec. fails to specify what the format of the list is, need to experiment
    //        to figure out what is actually produced by the debugger.
    return [parseInt(stoppedThreads, 10)];
  }
}

// Copyright (c) 2015 Vadim Macagon
// MIT License, see LICENSE file for full terms.

// NOTE: This is an external module in TypeScript parlance.

module MIOutput {

  /**
   * Identifiers for the various types of output records sent by the debugger MI.
   */
  export enum RecordType {
    /**
     * Indicates the previously requested synchronous operation was successful.
     */
    Done,
    /**
     * Equivalent to Done.
     */
    Running,
    /**
     * Indicates the debugger has connected to a remote target.
     */
    Connected,
    /**
     * Indicates the previously requested operation failed.
     */
    Error,
    /**
     * Indicates the debugger has terminated.
     */
    Exit,
    /**
     * Indicates an asynchronous state change on the target (e.g. stopped, started, disappeared).
     */
    AsyncExec,
    /**
     * On-going status information about the progress of a slow operation.
     */
    AsyncStatus,
    /**
     * Information that the client should handle (e.g. new breakpoint information).
     */
    AsyncNotify,
    /** 
     * Textual response to a CLI command.
     */
    DebuggerConsoleOutput,
    /** 
     * Textual output from a running target.
     */
    TargetOutput,
    /**
     * Textual output from the debugger's internals.
     */
    DebuggerLogOutput
  }

  export function getAsyncRecordType(char: string): RecordType {
    switch (char) {
      case '*':
        return RecordType.AsyncExec;

      case '+':
        return RecordType.AsyncStatus;

      case '=':
        return RecordType.AsyncNotify;

      // todo: throw an error if no match found!
    }
  }

  /**
   * Converts an array of key-value objects into a single object where each key is a property,
   * if a key appears in the input array multiple times the corresponding property in the
   * returned object will be an array of values.
   */
  export function createObjFromResultList(resultList: Array<{ name: string; value: string }>): any {
    var dict: { [index: string]: any } = {};
    if (resultList) {
      resultList.forEach((result) => {
        var prevValue = dict[result.name];
        if (prevValue === undefined) {
          dict[result.name] = result.value;
        } else if (Array.isArray(prevValue)) {
          dict[result.name].push(result.value);
        } else {
          // a property with this name already exists, so convert it to an array
          dict[result.name] = [prevValue, result.value];
        }
      });
    }
    return dict;
  }

} // module MIOutput

export = MIOutput;

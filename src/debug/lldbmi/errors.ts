// Copyright (c) 2015 Vadim Macagon
// MIT License, see LICENSE file for full terms.

/**
 * Used to indicate failure of a MI command sent to the debugger.
 */
export class CommandFailedError implements Error {
  /** The name of this error class. */
  name: string;
  /** The error message sent back by the debugger. */
  message: string;
  /** Optional error code sent by the debugger. */
  code: string;
  /** The command text that was sent to the debugger (minus token and dash prefix). */
  command: string;
  /** Optional token for the failed command (if the command had one). */
  token: string;

  constructor(message: string, command: string, code?: string, token?: string) {
    this.name = "CommandFailedError";
    this.message = message;
    this.code = code;
    this.command = command;
    this.token = token;
  }
}

/**
 * Used to indicate the response to an MI command didn't match the expected format.
 */
export class MalformedResponseError implements Error {
  /** The name of this error class. */
  name: string;

  /**
   * @param message The description of the error.
   * @param response The malformed response text (usually just the relevant part).
   * @param command The command text that was sent to the debugger (minus token and dash prefix).
   * @param token Token of the command (if the command had one).
   */
  constructor(
    public message: string,
    public response: string,
    public command?: string,
    public token?: string) {
    this.name = "MalformedResponseError";
  }
}

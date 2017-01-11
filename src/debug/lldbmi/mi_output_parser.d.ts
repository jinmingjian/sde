import { RecordType } from './mi_output';

declare module MIOutputParser {

  export interface Record {
    token?: string;
    recordType: RecordType;
    data: any;
  }

  export function parse(input: string): Record;

  export class SyntaxError {
    line: number;
    column: number;
    offset: number;
    expected: any[];
    found: any;
    name: string;
    message: string;
  }

} // module MIOutputParser

export = MIOutputParser;

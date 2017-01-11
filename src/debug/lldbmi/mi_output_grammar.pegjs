{ // Start of code that is injected into the generated PEG parser.

var mioutput = require('./mi_output');
  
} // End of code that is injected into the generated PEG parser.

start
  = out_of_band_record
  / result_record

result_record
  = t:token? '^' resultType:result_class results:comma_prefixed_results? {
      return {
        token: t,
        recordType: resultType,
        data: mioutput.createObjFromResultList(results)
      }
    }

out_of_band_record
  = async_record 
  / stream_record

async_record
  = t:token? at:[*+=] ac:async_class results:comma_prefixed_results? {
      return {
        token: t,
        recordType: mioutput.getAsyncRecordType(at),
        data: [ac, mioutput.createObjFromResultList(results)]
      }
    }

result_class
  = 'done' { return mioutput.RecordType.Done; }
  / 'running' { return mioutput.RecordType.Running; }
  / 'connected' { return mioutput.RecordType.Connected; }
  / 'error' { return mioutput.RecordType.Error; }
  / 'exit' { return mioutput.RecordType.Exit; }

async_class
  = variable

comma_prefixed_results
  = (',' r:result { return r; })+

result_list
  = first:result rest:comma_prefixed_results? {
      var results = [first];
      if (rest) {
	    // append the contents of rest to results
        Array.prototype.push.apply(results, rest);
      }
      return mioutput.createObjFromResultList(results);
    }

// According to the published grammar this rule should be:
// result = n:variable '=' v:value
// However, the result of the -insert-break command doesn't conform to this rule when the
// breakpoint has multiple locations, so the rule had to be tweaked to handle that case. 
result
  = n:variable '=' v:value rest:comma_prefixed_values? {
      return {
        name: n,
        value: rest ? [v].concat(rest) : v
      };
    }

comma_prefixed_values
  = (',' v:value { return v; })+

value_list
  = first:value rest:comma_prefixed_values? {
      var values = [first];
      if (rest) {
        Array.prototype.push.apply(values, rest);
      }
      return values;
    }

// todo: this needs some refinement
variable "variable-identifier"
  = variable_start variable_part* { return text(); }

variable_start
  = [a-z]i

variable_part
  = variable_start
  / [-_]

value
  = c_string
  / tuple
  / list

tuple
  = '{}' { return {}; }
  / '{' results:result_list '}' { return results; }

list
  = '[]' { return []; }
  / '[' values:value_list ']' { return values; }
  / '[' results:result_list ']' { return results; }

stream_record
  = console_stream_output
  / target_stream_output
  / log_stream_output

console_stream_output
  = '~' streamText:c_string {
      return { 
        recordType: mioutput.RecordType.DebuggerConsoleOutput, 
        data: streamText
      }
    }

target_stream_output
  = '@' streamText:c_string {
      return { 
        recordType: mioutput.RecordType.TargetOutput, 
        data: streamText
      }
    }

log_stream_output
  = '&' streamText:c_string {
      return { 
        recordType: mioutput.RecordType.DebuggerLogOutput, 
        data: streamText
      }
    }

c_string "double-quoted-string"
  = '"' chars:c_string_char* '"' { return chars.join(''); }

escape_char
  = "'"
  / '"'
  / '\\'
  / 'n' { return '\n'; }
  / 'r' { return '\r'; }
  / 't' { return '\t'; }

c_string_char
  = !('"' / '\\') . { return text(); }
  / '\\' char:escape_char { return char; }

token
  = digits:[0-9]+ { return digits.join(''); }

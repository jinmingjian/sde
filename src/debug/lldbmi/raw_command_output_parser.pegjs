//NOTE it just needs a variables extractor, rather than a syntax-complete parser

{ // Start of code that is injected into the generated PEG parser.

} // End of code that is injected into the generated PEG parser.

output
  = firstLevelObject* 

firstLevelObject 
  = type:type name:name valueOrDesc:valueOrDesc vars:firstLevelObjectBody? ws   
  { 
    if (vars) {
      for (var v of vars) {
        if (v.variablesReference!=0 && name!=0) { 
          v.variablesReference = name+"."+v.variablesReference;
        }
      }
      return {variables: vars}; 
    }
  }

type
  = "(" t:[^\)]* ")" {return t.join("");} 

name
  = " " n:[^ ]* " " {return n.join("");}

firstLevelObjectBody
  = "{" ws c:SecondLevelObject* "}"   {return c;}
  
SecondLevelObject 
  = type:type name:name valueOrDesc:valueOrDesc children:SecondLevelObjectBody? ws   
  { 
    return {
      name:name, value:valueOrDesc, type:type,
      variablesReference:children==null? 0:name 
      }; 
  }

ws = [ \t\n\r]*

SecondLevelObjectBody
  = "{" ws unresolvedLine* "}"
 
unresolvedLine
  = line:[^}\n\r]+ "}" ws  { return line.join(""); }


// ----- Values -----

valueOrDesc
  = "= " desc:[^{\n\r]*  { return desc.join("").trim(); }

// ----- Strings -----

string "string"
  = quotation_mark chars:char* quotation_mark { return chars.join(""); }

quotation_mark
  = '"'

char
  = "\\" "\""
  / [^\"] 

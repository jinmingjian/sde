'use strict';

import * as server from "./server"

import {
    DocumentFormattingParams, TextEdit, Files, TextDocument, Range, Position
} from 'vscode-languageserver';


function response0(request: string): Promise<any> {
    server.trace('to write request: ', request)
    server.repl.stdin.write(request)
    return new Promise((resolve, reject) => {
        let output = '';
        let nBytesRead = 0;
        server.repl.stdout.on('data', function stdoutReader(data) {
            output += data
            if (server.isTracingOn) {
                server.trace('', '' + data)
            }
            nBytesRead += data.length
            //FIXME }\n is not fully safe 
            if (output.endsWith("}\n")) {
                server.repl.stdout.removeListener('data', stdoutReader)
                let res = JSON.parse(jsonify(output));
                const ccrt = res["key.results"]
                if (ccrt) {//codeComplete
                    resolve(ccrt)
                } else {//cursorInfo
                    resolve(res)
                }
            } else if (nBytesRead > server.maxBytesAllowedForCodeCompletionResponse) {
                server.repl.stdout.removeListener('data', stdoutReader)
                let completions = JSON.parse(cutOffResponse(output));//FIXME only support codeComplete
                resolve(completions)
            }
        })
        //FIXME resolve or reject for stderr?
        // server.repl.stderr.once('data', function (data) {
        //     if (server.isTracingOn) {
        //         server.trace('***stderr***', ''+data)
        //     }
        // })
        //TODO
        server.repl.stdout.once('close', function (code) {
            reject(code);
        });
    });
}


function request0(
    requestType: string,
    srcText: string,
    srcPath: string,
    offset: number): Promise<Array<any>> {
    const sourcePaths = server.getAllSourcePaths(srcPath)
    const compilerargs = JSON.stringify((sourcePaths ? sourcePaths : [srcPath])
        .concat(server.loadArgsImportPaths())
    )
    srcText = JSON.stringify(srcText);
    let request = `{
  key.request: source.request.${requestType},
  key.sourcefile: "${srcPath}",
  key.offset: ${offset},
  key.compilerargs: ${compilerargs}`
    if (isASCIIOnly(srcText)) {//TODO issue#9
        request += `,\n  key.sourcetext: ${srcText}`
    }
    request += "\n}\n"
    return response0(request)
};


// export function codecomplete(srcPath: string, offset: number): Promise<string> {
//     return request("codecomplete", srcPath, offset);
// }

//== codeComplete
export function codeComplete(srcText: string, srcPath: string, offset: number): Promise<any> {
    return request0("codecomplete", srcText, srcPath, offset);
}

//== cursorInfo
export function cursorInfo(srcText: string, srcPath: string, offset: number): Promise<any> {
    return request0("cursorinfo", srcText, srcPath, offset);
}

//== demangle
export function demangle(...demangledNames: string[]): Promise<any> {
    const names = JSON.stringify(demangledNames.join(","));
    let request = `{
  key.request: source.request.demangle,
  key.names: [${names}]
  }
  `
    return response0(request)
}

//== editorFormatText
export function editorFormatText(
    document: TextDocument,
    srcText: string,
    srcPath: string,
    lineStart: number,
    lineEnd: number): Promise<TextEdit[]> {
    return new Promise<TextEdit[]>((resolve, reject) => {
        let tes: TextEdit[] = []
        editorOpen(srcPath, srcText, false, false, true)
            .then((v) => {
                // discard v
                let p = requestEditorFormatText(srcPath, lineStart, 1, document)

                //TODO async-await
                function nextp(fts: FormatTextState) {
                    tes.push(fts.textEdit)
                    if (fts.line != lineEnd) {
                        let sPos: Position = { line: fts.line, character: 0 }
                        let ePos: Position = document.positionAt(
                            document.offsetAt({ line: fts.line + 1, character: 0 }) - 1)
                        requestEditorFormatText(srcPath, fts.line + 1, 1, document)
                            .then(nextp)
                            .catch((err) => {
                                reject(err)
                            })
                    } else {
                        resolve(tes)
                    }
                }

                p.then(nextp).catch((err) => {
                    reject(err)
                })
            }).catch((err) => {
                reject(err)
            })
    });
}

//== editorOpen
function editorOpen(
    keyName: string,
    keySourcetext: string,
    keyEnableSyntaxMap: boolean,
    keyEnableSubStructure: boolean,
    keySyntacticOnly: boolean): Promise<string> {
    keySourcetext = JSON.stringify(keySourcetext);
    let request = `{
  key.request: source.request.editor.open,
  key.name: "${keyName}",
  key.enablesyntaxmap: ${booleanToInt(keyEnableSyntaxMap)},
  key.enablesubstructure: ${booleanToInt(keyEnableSubStructure)},
  key.syntactic_only: ${booleanToInt(keySyntacticOnly)},
  key.sourcetext: ${keySourcetext}
}
`;
    if (isASCIIOnly(keySourcetext)) {
        request += `,\n  key.sourcetext: ${keySourcetext}`
    }
    request += "\n}\n"
    server.trace('to write request: ', request)
    server.repl.stdin.write(request);
    //NOTE still need to drain the response
    return drainResponse()
}

function drainResponse(): Promise<string> {
    return new Promise((resolve, reject) => {
        let output = '';
        let nBytesRead = 0;
        server.repl.stdout.on('data', function drainResponseReader(data) {
            output += data
            nBytesRead += data.length
            //FIXME }\n is not fully safe 
            if (output.endsWith("}\n")) {
                server.repl.stdout.removeListener('data', drainResponseReader)
                resolve(output)//output for debug
            }
        });
        // FIXME resolve or reject for stderr?
        server.repl.stderr.once('data', function stderrReader(data) {
            server.repl.stdout.removeListener('data', stderrReader)
            reject(data.toString());
        });
    });
}

interface FormatTextState {
    line: number,
    textEdit: TextEdit
}

function requestEditorFormatText(
    keyName: string,
    keyLine: number,
    keyLength: number,//FIXME unuseful now
    document: TextDocument
): Promise<FormatTextState> {
    let request = `{
  key.request: source.request.editor.formattext,
  key.name: "${keyName}",
  key.line: ${keyLine},
  key.length: ${keyLength},
}
`;
    server.trace('to write request: ', request)
    server.repl.stdin.write(request);

    let firstStartPos: Position = { line: keyLine - 1, character: 0 }
    let firstEndPos: Position =
        keyLine != document.lineCount ?
            document.positionAt(
                document.offsetAt({ line: keyLine, character: 0 }) - 1) :
            document.positionAt(
                document.offsetAt({ line: document.lineCount, character: 0 }))
    let rt = responseEditorFormatText(keyLine,
        { start: firstStartPos, end: firstEndPos });//NOTE format req is 1-based
    return rt;
};

function responseEditorFormatText(keyLine: number, lineRange: Range): Promise<FormatTextState> {
    return new Promise((resolve, reject) => {
        let output = '';
        server.repl.stdout.on('data', function stdoutReader(data) {
            output += data
            //FIXME }\n is not fully safe 
            //FIMXE tricks for performance
            if (output.endsWith("}\n")) {
                server.repl.stdout.removeListener('data', stdoutReader)
                let offSetEnd = output.lastIndexOf("\"");
                let offSetStart = output.indexOf("\"", output.lastIndexOf("key.sourcetext:")) + 1
                let lineText = output.substring(offSetStart, offSetEnd)
                // server.trace(`---responseEditorFormatText lineText(${keyLine}): `, lineText)
                resolve({
                    line: keyLine,
                    textEdit: {
                        range: lineRange,
                        newText: JSON.parse(`"${lineText}"`) //NOTE convert back, silly...
                    }
                })
            }
        });
        // FIXME resolve or reject for stderr?
        // server.repl.stderr.once('data', function (data) {
        //     //resolve(data.toString());
        // });
        //TODO
        // repl.stdout.once('close', function (code) {
        // });
    });
}


//== indexmm



//== quit
export function quit() {
    server.repl.stdin.write(":quit\n");
}


//== helper
function booleanToInt(v: boolean): Number {
    return v ? 1 : 0
}

const cutOffPrefix = "key.results:";
function cutOffResponse(s: string): string {
    s = s.substring(s.indexOf(cutOffPrefix) + cutOffPrefix.length, s.length)
    s = s.substring(0, s.lastIndexOf("key.kind:"))
    s = s.substring(0, s.lastIndexOf(",")) + "]"
    return jsonify(s);
}

function jsonify(s: string): string {
    return s
        .replace(/(key.[a-z_.]+):/g, '"$1":')
        .replace(/(source.[a-z_.]+),/g, '"$1",')
}

function isASCIIOnly(s: string) {
    for (let i = 0; i < s.length; i++)
        if (s.charCodeAt(i) > 127)
            return false;
    return true;
}
'use strict';

import * as server from "./server"

import {
    DocumentFormattingParams, TextEdit, Files, TextDocument, Range, Position
} from 'vscode-languageserver'

import * as stream from 'stream'

import { isWsl, wslPath } from '../WslUtil'

let skProtocolProcess = null
let skeHandler = null
export function initializeSourcekite() {
    if (skProtocolProcess == null) {
        initializeSKProtocolProcess()
    }
}

function createSkProtocolProcess() {
    if (server.skProtocolProcessAsShellCmd) {
        return server.spawn(server.getShellExecPath(), ["-c", `docker run --rm -v ${server.workspaceRoot}:${server.workspaceRoot} -i jinmingjian/docker-sourcekite`])
    } else {
        return server.spawn(server.getShellExecPath(), ["-c", server.skProtocolPath])
    }
}

function initializeSKProtocolProcess() {
    debugLog(`***sourcekite initializing with skProtocolProcess at [${server.skProtocolPath}]`)

    const pathSourcekite = server.sdeSettings.path.sourcekite

    skProtocolProcess = createSkProtocolProcess()
    skProtocolProcess.stderr.on('data', (data) => {
        if (server.isTracingOn) {
            debugLog('***stderr***' + data)
        }
    })
    skProtocolProcess.on('exit', function (code, signal) {
        debugLog('***sourcekite exited***' + `code: ${code}, signal: ${signal}`)
        debugLog('***sourcekite exited***' + 'to spawn a new sourcekite process')
        //NOTE this is not guaranteed to reboot, but we just want it 'not guaranteed'
        skProtocolProcess = createSkProtocolProcess()
    })
    skProtocolProcess.on('error', function (err) {
        debugLog('***sourcekitd_repl error***' + (<Error>err).message)
        if ((<Error>err).message.indexOf("ENOENT") > 0) {
            const msg = "The '" + pathSourcekite +
                "' command is not available." +
                " Please check your swift executable user setting and ensure it is installed.";
            debugLog('***sourcekitd_repl not found***' + msg)
        }
        throw err
    })
    skeHandler = new SourcekiteResponseHandler()
}


enum ParsingState {
    endResponse, startResponseContent
}

//assumption:single-thread
class SourcekiteResponseHandler {

    private static nResponsesSlot = 64 //FIXME config options?
    // private static responseTimeoutMills = 15 * 1000 //FIXME

    private rids = new Array<number>(SourcekiteResponseHandler.nResponsesSlot)//for checking
    private responses = new Array<any>(SourcekiteResponseHandler.nResponsesSlot)
    private responsesProcessed = Array.from(new Array<boolean>(SourcekiteResponseHandler.nResponsesSlot)).map((_, i) => true)
    private responseResolves = new Array<Function>(SourcekiteResponseHandler.nResponsesSlot)
    private responseRejects = new Array<Function>(SourcekiteResponseHandler.nResponsesSlot)

    constructor() {
        skProtocolProcess.stdout.on('data', this.handleResponse.bind(this))
        debugLog("-->SourcekiteResponseHandler constructor done")
    }

    // private hasError = false
    private output = ""
    // private rid = -1
    private handleResponse(data): void {
        this.output += data
        if (server.isTracingOn) {
            server.trace('', '' + data)
        }
        if (this.output.endsWith("}\n\n")) {
            const idx = this.output.indexOf("\n")
            const ridstr = this.output.substring(0, idx)
            const rid = parseInt(ridstr)
            if (isNaN(rid)) {
                throw new Error("wrong format for reqid")
            }
            const res = this.output.substring(idx + 1)
            const slot = this.getSlot(rid)
            const resolve = this.responseResolves[slot]
            const reject = this.responseRejects[slot]
            this.output = ""
            this.responsesProcessed[slot] = true
            try {
                resolve(res)
            } catch (e) {
                debugLog(`---error: ${e}`)
                reject(e)
            }
        }
    }

    public getResponse(rid: number): Promise<string> {
        // const start = new Date().getTime() //FIXME enable timeout?
        return new Promise((resolve, reject) => {
            const slot = this.getSlot(rid)
            //FIXME enable timeout?reject only when covered by next replacer
            if (!this.responsesProcessed[slot]) {
                const rjt = this.responseRejects[slot]
                rjt(`fail to process the request[reqid=${this.rids[slot]}]`)
            }
            this.rids[slot] = rid
            this.responseResolves[slot] = resolve
            this.responseRejects[slot] = reject
            this.responsesProcessed[slot] = false
        })
    }

    private getSlot(rid: number): number {
        return rid % SourcekiteResponseHandler.nResponsesSlot
    }

}

let reqCount = 0 //FIXME

type RequestType = "codecomplete" | "cursorinfo" | "demangle" | "editor.open" | "editor.formattext"

//FIXME generic for future
function typedResponse(request: string, requestType: RequestType,
    extraState: any = null): Promise<{}> {
    server.trace('to write request: ', request)
    const rid = reqCount++
    skProtocolProcess.stdin.write(rid + "\n")
    skProtocolProcess.stdin.write(request)
    return skeHandler.getResponse(rid)
        .then(resp => {
            switch (requestType) {
                case "codecomplete":
                case "demangle":
                    const res = JSON.parse(jsonify(resp))
                    return res["key.results"]
                case "editor.formattext":
                    const keyLine = extraState.keyLine
                    const lineRange = extraState.lineRange
                    let offSetEnd = resp.lastIndexOf("\"");
                    let offSetStart = resp.indexOf("\"", resp.lastIndexOf("key.sourcetext:")) + 1
                    let lineText = resp.substring(offSetStart, offSetEnd)
                    // server.trace(`---responseEditorFormatText lineText(${keyLine}): `, lineText)
                    return {
                        line: keyLine,
                        textEdit: {
                            range: lineRange,
                            newText: JSON.parse(`"${lineText}"`) //NOTE convert back, silly...
                        }
                    }
                default:
                    return JSON.parse(jsonify(resp))
            }
        }).catch(e => { debugLog("***typedResponse error: " + e) })
}

function request(
    requestType: RequestType,
    srcText: string,
    srcPath: string,
    offset: number): Promise<any> {

    const sourcePaths = server.getAllSourcePaths(srcPath)
    const compilerargs = JSON.stringify((sourcePaths ? isWsl ? sourcePaths.map((p) => { return wslPath(p); }) : sourcePaths : [isWsl ? wslPath(srcPath) : srcPath])
        .concat(server.loadArgsImportPaths())
    )
    srcText = JSON.stringify(srcText)
    let request = `{
  key.request: source.request.${requestType},
  key.sourcefile: "${isWsl ? wslPath(srcPath) : srcPath}",
  key.offset: ${offset},
  key.compilerargs: ${compilerargs},
  key.sourcetext: ${srcText}
}

`
    return typedResponse(request, requestType)
};

//== codeComplete
export function codeComplete(srcText: string, srcPath: string, offset: number): Promise<any> {
    return request("codecomplete", srcText, srcPath, offset);
}

//== cursorInfo
export function cursorInfo(srcText: string, srcPath: string, offset: number): Promise<any> {
    return request("cursorinfo", srcText, srcPath, offset);
}

//== demangle
export function demangle(...demangledNames: string[]): Promise<any> {
    const names = JSON.stringify(demangledNames.join(","));
    let request = `{
  key.request: source.request.demangle,
  key.names: [${names}]
}

`
    return typedResponse(request, "demangle")
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
  key.sourcetext: ${keySourcetext},
  key.sourcetext: ${keySourcetext}
}

`
    return typedResponse(request, "editor.open")
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
    let firstStartPos: Position = { line: keyLine - 1, character: 0 }
    let firstEndPos: Position =
        keyLine != document.lineCount ?
            document.positionAt(
                document.offsetAt({ line: keyLine, character: 0 }) - 1) :
            document.positionAt(
                document.offsetAt({ line: document.lineCount, character: 0 }))
    return typedResponse(request, "editor.formattext",
        {
            keyLine: keyLine,
            lineRange: { start: firstStartPos, end: firstEndPos }//NOTE format req is 1-based
        }
    )
}



function debugLog(msg: string) {
    server.trace(msg)
}

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

'use strict';

import {
    workspace, commands,
    Disposable, ExtensionContext, Uri, Diagnostic, DiagnosticSeverity,
    Range
} from 'vscode'
import cp = require('child_process')
import {
    trace, dumpInConsole,
    diagnosticCollection,
    makeBuildStatusFailed,
    makeBuildStatusSuccessful
} from './clientMain'


let stdout: string, stderr: string, error: Error;
///managed build now only support to invoke on save
//ignore options
export function buildPackage(swiftBinPath: string, pkgPath: string, options: string) {
    stdout = null
    stderr = null
    error = null
    const sb = cp.spawn(swiftBinPath, ["build"], { cwd: pkgPath });
    sb.stdout.on('data', (data) => {
        stdout += data
        dumpInConsole("" + data)
    })
    sb.stderr.on('data', (data) => {
        stderr += data
        dumpInConsole("" + data)
    })
    sb.on('error', function (err: Error) {
        trace('***swift build command error*** ' + err.message)
        if (err.message.indexOf("ENOENT") > 0) {
            const msg = "The '" + swiftBinPath +
                "' command is not available." +
                " Please check your swift executable user setting and ensure it is installed.";
        }
        error = err
    });

    sb.on('exit', function (code, signal) {
        trace(`***swift build command exited*** code: ${code}, signal: ${signal}`)
        dumpInConsole('\n')
        diagnosticCollection.clear();
        if (stderr && stdout) {
            dumpDiagnostics()
        } else {
            // trace(stdout)
            // trace("build succeeded")
            makeBuildStatusSuccessful()
        }
    })
}

function dumpDiagnostics() {
    const diagnosticMap: Map<string, Diagnostic[]> = new Map();
    let diags: Array<string[]> = []
    const lines = stdout.split("\n")

    function isDiagStartLine(line: string) {//FIXME 
        const sa = line.split(":")
        if (sa.length > 4) {
            const sev = sa[3].trim();
            return sev == "error" || sev == "warning" || sev == "note"
        }
        return false
    }
    //FIXME always the pattern?
    function makeDiagnostic(oneDiag: string[]) {
        const line0 = oneDiag[0]
        const line1 = oneDiag[1]
        const line2 = oneDiag[2]
        const sa = line0.split(":")
        const file = Uri.file(sa[0]).toString() //FIXME not always file, Swift._cos:1:13:
        //line and column in vscode is 0-based
        const line = Number(sa[1]) - 1
        const startColumn: number = Number(sa[2]) - 1
        const sev = toVSCodeSeverity(sa[3].trim())
        const msg = sa[4]
        const endColumn: number = startColumn + line2.trim().length

        // let canonicalFile = vscode.Uri.file(error.file).toString();
        // if (document && document.uri.toString() === canonicalFile) {
        //     let range = new vscode.Range(error.line - 1, 0, error.line - 1, document.lineAt(error.line - 1).range.end.character + 1);
        //     let text = document.getText(range);
        //     let [_, leading, trailing] = /^(\s*).*(\s*)$/.exec(text);
        //     startColumn = leading.length;
        //     endColumn = text.length - trailing.length;
        // }
        let range = new Range(line, startColumn, line, endColumn);
        let diagnostic = new Diagnostic(range, msg, sev);
        let diagnostics = diagnosticMap.get(file);
        if (!diagnostics) {
            diagnostics = [];
        }
        diagnostics.push(diagnostic);
        diagnosticMap.set(file, diagnostics);
    }

    let index = Number.MAX_VALUE;
    let line, oneDiag, hasDiagStart
    for (let i = 0; i < lines.length; i++) {
        line = lines[i]
        if (isDiagStartLine(line)) {
            if (!hasDiagStart) hasDiagStart = true
            if (oneDiag) diags.push(oneDiag)
            oneDiag = []
        }
        if (hasDiagStart) {
            oneDiag.push(line)
        }
    }
    diags.push(oneDiag)//push last oneDiag
    diags.forEach(d => makeDiagnostic(d))
    diagnosticMap.forEach((diags, file) => {
        diagnosticCollection.set(Uri.parse(file), diags);
    });

    // trace(stderr)
    // trace("build failed")
    makeBuildStatusFailed()
}


function toVSCodeSeverity(sev: string) {
    switch (sev) {
        case 'error': return DiagnosticSeverity.Error;
        case 'warning': return DiagnosticSeverity.Warning;
        case 'note': return DiagnosticSeverity.Information;
        default: return DiagnosticSeverity.Error;//FIXME
    }
}


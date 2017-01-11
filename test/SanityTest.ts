'use strict'

import * as lldbmi from '../src/debug/lldbmi/index';

import DebugSession = lldbmi.DebugSession;

const debugSession: DebugSession = lldbmi.startDebugSession(lldbmi.DebuggerType.LLDB);

async function runTest() {
    console.log("-->to run test...")
    const execFile = '/ming/vscode/repo/sde/client/test/sanity'
    try {
        await debugSession.setExecutableFile(execFile)
        console.log(`-->set Executable File for ${execFile}`)
        const breakpoint = await debugSession.addBreakpoint("sanity.swift:2")
        const bpLoc = breakpoint.locations[0]
        console.log(`==>breakpoint id:${bpLoc.id}`)
        const variables = await debugSession.getStackFrameVariables()
        console.log("-->done!")

        
    } catch (e) {
        console.log(e)
    } finally {
        await debugSession.end()
        console.log("-->end debugSession!")
    }
}


runTest()
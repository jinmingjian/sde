import {
	DebugSession,
	InitializedEvent,
	TerminatedEvent,
	StoppedEvent,
	BreakpointEvent,
	OutputEvent,
	ThreadEvent,
	Event,
	Thread, StackFrame, Scope, Source, Handles, Breakpoint
} from 'vscode-debugadapter'
import { DebugProtocol } from 'vscode-debugprotocol'
import { readFileSync } from 'fs'
import { basename } from 'path'
import * as lldbmi from './lldbmi/index'

import FrontendBreakpoint = DebugProtocol.Breakpoint
import FrontendVariable = DebugProtocol.Variable

import LLDBMISession = lldbmi.DebugSession
import BackendBreakpoint = lldbmi.IBreakpointInfo
import BackendThread = lldbmi.IThreadInfo
import BackendStackFrame = lldbmi.IStackFrameInfo
import BackendVariable = lldbmi.IVariableInfo
// import BackendAllThreads = lldbmi.IMultiThreadInfo


/**
 * This interface should always match the schema found in the mock-debug extension manifest.
 */
export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	/** An absolute path to the program to debug. */
	program: string;
	// /** Automatically stop target after launch. If not specified, target does not stop. */
	// stopOnEntry?: boolean;
	enableTracing?: boolean;
}

class SDEDebugSessionAdapter extends DebugSession {

	private lastBreakPoints = new Map<string, BackendBreakpoint[]>()
	private variableHandles = new Handles<number | string>()

	private debuggerLaunched = false

	/**
	 * Creates a new debug adapter that is used for one debug session.
	 * We configure the default implementation of a debug adapter here.
	 */
	public constructor() {
		super()
	}

	//override
	protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
		this.sendEvent(new InitializedEvent());

		this.initializeBackendDebugger();
		response.body.supportsConfigurationDoneRequest = true;
		// response.body.supportsEvaluateForHovers = true;
		// response.body.supportsStepBack = true;

		this.sendResponse(response);
		this.trace("initializeRequest done.")
	}

	debugger: LLDBMISession = null;
	private initializeBackendDebugger() {
		this.debugger = lldbmi.startDebugSession(lldbmi.DebuggerType.LLDB);

		this.debugger.on(lldbmi.EVENT_BREAKPOINT_HIT, (breakNotify: lldbmi.IBreakpointHitEvent) => {
			this.sendEvent(new StoppedEvent("breakpoint", breakNotify.threadId));
			this.trace(`EVENT_BREAKPOINT_HIT:[thread id: ${breakNotify.threadId}]`);
		})
		this.debugger.on(lldbmi.EVENT_STEP_FINISHED, (stepNotify: lldbmi.IStepFinishedEvent) => {
			this.sendEvent(new StoppedEvent("step", stepNotify.threadId))
			this.trace(`EVENT_STEP_FINISHED:[thread id: ${stepNotify.threadId}]`)
		})
		this.debugger.on(lldbmi.EVENT_FUNCTION_FINISHED, (stepNotify: lldbmi.IStepOutFinishedEvent) => {
			this.sendEvent(new StoppedEvent("pause", stepNotify.threadId))//FIXME pause?step?
			this.trace(`EVENT_FUNCTION_FINISHED:[thread id: ${stepNotify.threadId}]`)
		})
		this.debugger.on(lldbmi.EVENT_EXCEPTION_RECEIVED, (notification: lldbmi.IExceptionReceivedEvent) => {
			this.sendEvent(new StoppedEvent("exception", notification.threadId, notification.exception))
			this.trace(`EVENT_EXCEPTION_RECEIVED:[thread id: ${notification.threadId}]`)
		})
		this.debugger.on(lldbmi.EVENT_TARGET_STOPPED, (notification: lldbmi.ITargetStoppedEvent) => {
			switch (notification.reason) {
				case lldbmi.TargetStopReason.Exited:
				case lldbmi.TargetStopReason.ExitedSignalled:
				case lldbmi.TargetStopReason.ExitedNormally:
					this.sendEvent(new TerminatedEvent())
					this.trace(`EVENT_TARGET_STOPPED:[thread id: ${notification.threadId}]`)
					break;
				default:
			}
		})
		// this.debugger.on(lldbmi.EVENT_THREAD_CREATED, (notification: lldbmi.IThreadCreatedEvent) => {
		// 	this.sendEvent(new ThreadEvent("started", notification.id))//FIXME started？ where the official docs?
		// 	this.trace(`EVENT_THREAD_CREATED:[thread id: ${notification.id}]`)
		// })
		this.debugger.on(lldbmi.EVENT_THREAD_EXITED, (notification: lldbmi.IThreadExitedEvent) => {
			this.sendEvent(new ThreadEvent("exited", notification.id));
			this.trace(`EVENT_THREAD_EXITED:[thread id: ${notification.id}]`);
		})
	}


	private enableTracing: boolean = false
	//override
	protected launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): void {
		try {
			if (args.enableTracing) {
				this.enableTracing = args.enableTracing
			}
			this.debugger
				.setExecutableFile(args.program)
				.then(() => {
					this.debuggerLaunched = true;
					if (this.doSetBreakPoints) {
						this.doSetBreakPoints()
					} else {
						this.debugger.startInferior()
					}
					this.trace("debugger Launched")
				})
		} catch (e) {
			this.trace(e)
		}
	}

	//override
	private doSetBreakPoints: () => Promise<void> = undefined;
	protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {
		if (this.debuggerLaunched) {
			this.invokeDefensively(() =>
				this.setBreakPointsRequestAsync(response, args, false)
			)
		} else {
			this.doSetBreakPoints = () =>
				this.setBreakPointsRequestAsync(response, args, true)//only happen once?
		}
	}

	private async setBreakPointsRequestAsync(
		response: DebugProtocol.SetBreakpointsResponse,
		args: DebugProtocol.SetBreakpointsArguments,
		notLaunched: boolean) {
		var bbps: BackendBreakpoint[] = []
		for (const line of args.lines) {
			const bbp = await this.debugger.addBreakpoint(`${args.source.name}:${line}`)
			bbps.push(bbp)
		}

		const oldbbps = this.lastBreakPoints.get(args.source.path)
		if (oldbbps) {
			let bids: number[] = []
			for (const bbp of oldbbps) {
				bids.push(bbp.id)
			}
			await this.debugger.removeBreakpoints(bids)
		}

		this.lastBreakPoints.set(args.source.path, bbps);
		response.body = {
			breakpoints: this.toFrontendBreakpoints(bbps)
		};
		this.sendResponse(response);
		if (notLaunched) {
			this.debugger.startInferior()//as the callback of launchRequest
		}
		this.trace("setBreakPointsRequestAsync done.")
	}

	private toFrontendBreakpoints(bbps: BackendBreakpoint[]): FrontendBreakpoint[] {
		const rt: FrontendBreakpoint[] = [];
		for (const bbp of bbps) {
			if (bbp.locations) {
				rt.push(<FrontendBreakpoint>new Breakpoint(true, bbp.locations[0].line))
			}//FIXME handle pending 
		}
		return rt
	}

	//override
	//FIXME duplicated messages for threadsRequest. works but lower performance
	protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
		this.threadsRequestAsync(response)
	}

	private async threadsRequestAsync(response: DebugProtocol.ThreadsResponse) {
		const allThreads = await this.debugger.getThreads()
		response.body = {
			threads: allThreads.all.map(thread => {
				return new Thread(thread.id, thread.name)
			})
		}
		this.sendResponse(response);
		this.trace("threadsRequestAsync done.")
	}

	//override
	protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
		this.stackTraceRequestAsync(response, args)
	}

	private async stackTraceRequestAsync(
		response: DebugProtocol.StackTraceResponse,
		args: DebugProtocol.StackTraceArguments) {
		args.startFrame
		const frames: Array<BackendStackFrame> = await this.debugger.
			getStackFrames({ threadId: args.threadId })
		response.body = {
			stackFrames: frames.map(frame => {
				return new StackFrame(
					frame.level,
					`${frame.filename}@(${frame.address})`,
					new Source(
						frame.filename,
						this.convertDebuggerPathToClient(frame.fullname)
					),
					frame.line,
					0)
			}),
			totalFrames: frames.length
		};
		this.sendResponse(response);
		this.trace("stackTraceRequestAsync done.")
	}

	//override
	protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
		//FIXME all vars goto locals? 
		response.body = {
			scopes: [
				new Scope("Local", this.variableHandles.create(args.frameId), false),
				// new Scope("Global", this.variableHandles.create(-1), false)
			]
		};
		this.sendResponse(response);
		this.trace("scopesRequest done.")
	}

	//override
	protected variablesRequest(
		response: DebugProtocol.VariablesResponse,
		args: DebugProtocol.VariablesArguments): void {
		this.variablesRequestAsync(response, args)
	}

	private async variablesRequestAsync(
		response: DebugProtocol.VariablesResponse,
		args: DebugProtocol.VariablesArguments) {
		const v = this.variableHandles.get(args.variablesReference, 0)
		let vars = [];
		if (typeof v === 'number') {//Global scope
			if (v == -1) {
				//FIXME swift's global scope may be per app?but vscode's global scope is per stack frame...
				vars = await this.debugger.getGlobalVariables()
			} else {
				vars = await this.debugger.getStackFrameVariables()
			}
			this.asFrontendVariables(vars, null)
		} else {//typeof v === 'string'
			vars = await this.debugger.getVariableContent(v)
			this.asFrontendVariables(vars, v)
		}

		response.body = {
			variables: vars
		};
		this.sendResponse(response);
		this.trace("variablesRequestAsync done.")
	}

	asFrontendVariables(vars: FrontendVariable[], parentVarName: string) {
		vars.forEach(v => {
			if (typeof v.variablesReference === 'string') {
				let vf: string = v.variablesReference
				// this.trace(`parentVarName:${parentVarName}|vf: ${vf}`)
				if (parentVarName) {
					const lastDotIndex = vf.lastIndexOf(".")
					const varName = vf.substr(lastDotIndex == -1 ? 0 : lastDotIndex + 1, vf.length)
					if (varName.startsWith("[")) {
						vf = parentVarName + varName
					} else {
						vf = `${parentVarName}.${varName}`
					}

				}
				v.variablesReference = this.variableHandles.create(vf)
			}
		})
	}

	protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
		this.debugger.resumeInferior()//FIXME specify thread?
		this.sendResponse(response);//await?
	}

	// protected reverseContinueRequest(response: DebugProtocol.ReverseContinueResponse, args: DebugProtocol.ReverseContinueArguments): void {

	// 	for (var ln = this._currentLine - 1; ln >= 0; ln--) {
	// 		if (this.fireEventsForLine(response, ln)) {
	// 			return;
	// 		}
	// 	}
	// 	this.sendResponse(response);
	// 	// no more lines: stop at first line
	// 	this._currentLine = 0;
	// 	this.sendEvent(new StoppedEvent("entry", SDEDebugSessionAdapter.THREAD_ID));
	// }

	protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
		this.debugger.stepOverLine({ threadId: args.threadId }).then(() => {
			this.sendResponse(response)
		})
		this.trace("nextRequest done.")
	}

	// protected stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments): void {

	// 	for (let ln = this._currentLine - 1; ln >= 0; ln--) {
	// 		if (this.fireStepEvent(response, ln)) {
	// 			return;
	// 		}
	// 	}
	// 	this.sendResponse(response);
	// 	// no more lines: stop at first line
	// 	this._currentLine = 0;
	// 	this.sendEvent(new StoppedEvent("entry", SDEDebugSessionAdapter.THREAD_ID));
	// }

	// protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {

	// 	response.body = {
	// 		result: `evaluate(context: '${args.context}', '${args.expression}')`,
	// 		variablesReference: 0
	// 	};
	// 	this.sendResponse(response);
	// }

	//===
	private invokeDefensively(fn): void {
		try {
			fn()
		} catch (e) {
			this.trace(e)
		}
	}

	private trace(msg: string) {
		if (this.enableTracing) {
			const e = new OutputEvent(`---[trace] ${msg}\n`);
			this.sendEvent(e);
		}
	}
}


DebugSession.run(SDEDebugSessionAdapter);


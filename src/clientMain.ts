'use strict';

import * as path from 'path'
import * as fs from 'fs'
import * as tools from './SwiftTools'
import * as os from 'os'
import {
	workspace, window, commands, languages, extensions,
	Disposable, ExtensionContext, Uri, DiagnosticCollection,
	StatusBarItem, StatusBarAlignment, OutputChannel
} from 'vscode';
import {
	LanguageClient, LanguageClientOptions,
	SettingMonitor, ServerOptions, TransportKind
} from 'vscode-languageclient';
import { isWsl, winPath } from './WslUtil'

const LENGTH_PKG_FILE_NAME: number = "Package.swift".length
const PUBLISHER_NAME = "jinmingjian.sde"

let shellPath = null
let swiftBinPath = null
let swiftPackageManifestPath = null
let skProtocolProcess = null
let skProtocolProcessAsShellCmd = null
export let isTracingOn: boolean = false
export let isLSPServerTracingOn: boolean = false
export let diagnosticCollection: DiagnosticCollection
let spmChannel: OutputChannel = null

export function activate(context: ExtensionContext) {
	initConfig()

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(path.join('out/src/server', 'server.js'));
	// The debug options for the server
	let debugOptions = { execArgv: ["--nolazy", "--debug=6004"] };

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	}

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: ['swift'],
		synchronize: {
			configurationSection: 'swift',
			// Notify the server about file changes to '.clientrc files contain in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/*.swift')
		},
		initializationOptions: {
			'isLSPServerTracingOn': isLSPServerTracingOn,
			'skProtocolProcess': skProtocolProcess,
			'skProtocolProcessAsShellCmd': skProtocolProcessAsShellCmd
		},
	}

	// console.log(workspace.getConfiguration().get('editor.quickSuggestions'))
	// Create the language client and start the client.
	let disposable = new LanguageClient('Swift', serverOptions, clientOptions).start()

	context.subscriptions.push(disposable)
	diagnosticCollection = languages.createDiagnosticCollection('swift');
	context.subscriptions.push(diagnosticCollection);


	function buildSPMPackage() {
		if (isSPMProject()) {
			//setup
			if (!buildStatusItem) {
				initBuildStatusItem()
			}

			makeBuildStatusStarted()
			tools.buildPackage(
				shellPath,
				swiftBinPath,
				workspace.rootPath,
				null)
		}
	}
	//commands
	context.subscriptions.push(
		commands.registerCommand('sde.commands.buildPackage', buildSPMPackage)
	)
	// build on save
	workspace.onDidSaveTextDocument(
		document => buildSPMPackage(),//FIXME filter to swift files
		null, context.subscriptions)

	//debug
	context.subscriptions.push(commands.registerCommand('sde.commands.debug.provideInitialConfigurations', () => {
		return [
			'// Use IntelliSense to learn about possible Mock debug attributes.',
			'// Hover to view descriptions of existing attributes.',
			JSON.stringify(initialConfigurations, null, '\t')
		].join('\n');
	}));
}

const initialConfigurations = {
	version: '0.2.0',
	configurations: [
		{
			type: 'swift-debug',
			request: 'launch',
			name: 'Swift Program Debug',
			program: '${workspaceRoot}/.build/debug/path-to-program-debugged',
		}
	]
}

function initConfig() {
	checkToolsAvailability()

	workspace.getConfiguration().update('editor.quickSuggestions', false, false)
	workspace.getConfiguration().update('sde.buildOnSave', true, false)
	// console.log('sde.enableTracing: '+workspace.getConfiguration().get('sde.enableTracing.client'))

	isTracingOn = <boolean>workspace.getConfiguration().get('sde.enableTracing.client')
	isLSPServerTracingOn = <boolean>workspace.getConfiguration().get('sde.enableTracing.LSPServer')
	console.log('isTracingOn: ' + isTracingOn)
	if (isTracingOn) {
		//TODO
	}
	//FIXME rootPath may be undefined for adhoc file editing mode???
	swiftPackageManifestPath = path.join(workspace.rootPath, "Package.swift");

	spmChannel = window.createOutputChannel("SPM")
}

export let buildStatusItem: StatusBarItem
let originalBuildStatusItemColor = null
function initBuildStatusItem() {
	buildStatusItem = window.createStatusBarItem(StatusBarAlignment.Left);
	originalBuildStatusItemColor = buildStatusItem.color
}

const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
let building = null

function makeBuildStatusStarted() {
	buildStatusItem.color = originalBuildStatusItemColor
	buildStatusItem.show()
	let animation = frame()
	if (building) {
		clearInterval(building)
	}
	building = setInterval(() => {
		buildStatusItem.text = `${animation()} building`
	}, 100)
}

function frame() {
	var i = 0;
	return function () {
		return frames[i = ++i % frames.length];
	};
};

export function makeBuildStatusFailed() {
	clearInterval(building)
	buildStatusItem.text = '$(issue-opened) build failed'
	buildStatusItem.color = "red"
}

export function makeBuildStatusSuccessful() {
	clearInterval(building)
	buildStatusItem.text = '$(check) build succeeded'
	buildStatusItem.color = originalBuildStatusItemColor
}


function isSPMProject(): boolean {
	return fs.existsSync(swiftPackageManifestPath)
}


export function trace(msg) {
	if (isTracingOn) {
		console.log(msg)
	}
}

export function dumpInConsole(msg: string) {
	spmChannel.append(msg)
}

// function getSkProtocolProcessPath(extPath: string) {
// 	switch (os.platform()) {
// 		case 'darwin':
// 			return path.join(extPath, "bin", "macos", 'sourcekitd-repl')
// 		default://FIXME
// 			return path.join(extPath, "bin", "linux", 'sourcekitd-repl')
// 	}
// }

function checkToolsAvailability() {
	swiftBinPath = <string>workspace.getConfiguration().get('swift.path.swift_driver_bin')
	const sourcekitePath = <string>workspace.getConfiguration().get('swift.path.sourcekite')
	const sourcekitePathEnableShCmd = <string>workspace.getConfiguration().get('swift.path.sourcekiteDockerMode')
	shellPath = <string>workspace.getConfiguration().get('swift.path.shell')
	// const useBuiltInBin = <boolean>workspace.getConfiguration().get('swift.sourcekit.use_built_in_bin')
	// if (useBuiltInBin) {
	// 	skProtocolProcess = getSkProtocolProcessPath(
	// 		extensions.getExtension(PUBLISHER_NAME).extensionPath)
	// } else {
	skProtocolProcess = sourcekitePath
	skProtocolProcessAsShellCmd = sourcekitePathEnableShCmd
	// }


	if (!swiftBinPath || !fs.existsSync(isWsl ? winPath(swiftBinPath) : swiftBinPath)) {
		window.showErrorMessage('missing dependent swift tool, please configure correct "swift.path.swift_driver_bin"')
	}
	if (!sourcekitePathEnableShCmd) {
		if (!skProtocolProcess || !fs.existsSync(isWsl ? winPath(skProtocolProcess) : skProtocolProcess)) {
			window.showErrorMessage('missing dependent sourcekite tool, please configure correct "swift.path.sourcekite"')
		}
	}
	if (!shellPath || !fs.existsSync(shellPath)) {
		window.showErrorMessage('missing dependent shell tool, please configure correct "swift.path.shell"')
	}
}

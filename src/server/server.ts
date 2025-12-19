'use strict';

import * as path from 'path'
import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection, TextDocumentSyncKind,
	TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
	InitializeParams, InitializeResult, TextDocumentPositionParams,
	CompletionItem, CompletionItemKind, InsertTextFormat,
	DocumentFormattingParams, TextDocumentIdentifier, TextEdit,
	Hover, MarkedString,
	Definition,
	Files, FileChangeType
} from 'vscode-languageserver'
import * as fs from 'fs'
import * as sourcekitProtocol from './sourcekites'
import Uri from 'vscode-uri'
import { isWsl, winPath, wslPath } from '../WslUtil'

export const spawn = require('child_process').spawn

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

let allModulePaths: Map<string, string>;
let allModuleSources: Map<string, Set<string>>;
export function initializeModuleMeta() {
	trace('***initializeModuleMeta***')
	allModulePaths = new Map()
	allModuleSources = new Map()
	const shPath = getShellExecPath()
	trace('***getShellExecPath: ', shPath)
	const sp = spawn(shPath, ["-c",
		`cd ${isWsl ? wslPath(workspaceRoot) : workspaceRoot} && ${swiftDiverBinPath} package describe --type json`,
	])
	sp.stdout.on('data', (data) => {
		if (isTracingOn) {
			trace('***swift package describe stdout*** ', '' + data)
		}
		//TODO more here
		const pkgDesc = JSON.parse(data)
		for (const m of <Object[]>pkgDesc['modules']) {
			const mn = m['name']
			const mp = m['path']
			const ss = <string[]>m['sources']
			const set = new Set()
			ss.forEach(f => set.add(path.join(mp, f)))
			allModuleSources.set(mn, set)
			allModulePaths.set(mn, mp)
		}
	})
	sp.stderr.on('data', (data) => {
		if (isTracingOn) {
			trace('***swift package describe stderr*** ', '' + data)
		}
	})
	// sp.on('exit', function (code, signal) {
	// 	trace('***swift package describe***', `code: ${code}, signal: ${signal}`)
	// })
	sp.on('error', function (err) {
		trace('***swift package describe error*** ', (<Error>err).message)
		if ((<Error>err).message.indexOf("ENOENT") > 0) {
			const msg = "The '" + swiftDiverBinPath +
				"' command is not available." +
				" Please check your swift executable user setting and ensure it is installed.";
			trace('***swift executable not found***', msg)
		}
		throw err//FIXME more friendly prompt
	});
}

export function getAllSourcePaths(srcPath: string): string[] {
	const sp = path.dirname(srcPath)
	for (let [m, p] of allModulePaths) {
		if (p === sp) {
			let ss = allModuleSources.get(m)
			// trace("**getAllDocumentPaths** ", Array.from(ss).join(","))
			return Array.from(ss)
		}
	}
	return null//can not find?
}

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites.
export let workspaceRoot: string;
export let isTracingOn: boolean;
connection.onInitialize((params: InitializeParams, cancellationToken): InitializeResult => {
	isTracingOn = params.initializationOptions.isLSPServerTracingOn
	skProtocolPath = params.initializationOptions.skProtocolProcess
	skProtocolProcessAsShellCmd = params.initializationOptions.skProtocolProcessAsShellCmd
	trace("-->onInitialize ", `isTracingOn=[${isTracingOn}],
	skProtocolProcess=[${skProtocolPath}],skProtocolProcessAsShellCmd=[${skProtocolProcessAsShellCmd}]`)
	workspaceRoot = params.rootPath
	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: documents.syncKind,
			definitionProvider: true,
			hoverProvider: true,
			// referencesProvider: false,
			// documentSymbolProvider: false,
			// signatureHelpProvider: {
			// 	triggerCharacters: ['[', ',']
			// },
			// We're prividing completions.
			completionProvider: {
				resolveProvider: false,
				triggerCharacters: [
					'.', ':', '(', //' ', '<', //TODO
				]
			},
			documentFormattingProvider: true,
			documentRangeFormattingProvider: true
		}
	};
});

// The settings interface describe the server relevant settings part
interface Settings {
	swift: any;
}


//external
export let sdeSettings: any;
export let swiftDiverBinPath: string = null;
export let maxBytesAllowedForCodeCompletionResponse: number = 0;
//internal
export let skProtocolPath = null
export let skProtocolProcessAsShellCmd = false
let maxNumProblems = null
let shellPath = null
// The settings have changed. Is send on server activation
// as well.
connection.onDidChangeConfiguration((change) => {
	trace("-->onDidChangeConfiguration")
	const settings = <Settings>change.settings
	sdeSettings = settings.swift;//FIXME configs only accessed via the language id?

	//FIXME does LS client support on-the-fly change?
	maxNumProblems = sdeSettings.diagnosis.max_num_problems
	swiftDiverBinPath = sdeSettings.path.swift_driver_bin
	shellPath = sdeSettings.path.shell

	trace(`-->onDidChangeConfiguration tracing:
		swiftDiverBinPath=[${swiftDiverBinPath}],
		shellPath=[${shellPath}]`)

	//FIXME reconfigure when configs haved
	sourcekitProtocol.initializeSourcekite()
	if (!allModuleSources) {//FIXME oneshot?
		initializeModuleMeta()
	}
	// Revalidate any open text documents
	documents.all().forEach(validateTextDocument);
});



function validateTextDocument(textDocument: TextDocument): void {
	// let diagnostics: Diagnostic[] = [];
	// let lines = textDocument.getText().split(/\r?\n/g);
	// let problems = 0;
	// for (var i = 0; i < lines.length && problems < maxNumProblems; i++) {
	// 	let line = lines[i];
	// 	let index = line.indexOf('typescript');
	// 	if (index >= 0) {
	// 		problems++;
	// 		diagnostics.push({
	// 			severity: DiagnosticSeverity.Warning,
	// 			range: {
	// 				start: { line: i, character: index },
	// 				end: { line: i, character: index + 10 }
	// 			},
	// 			message: `${line.substr(index, 10)} should be spelled TypeScript`,
	// 			source: 'ex'
	// 		});
	// 	}
	// }
	// Send the computed diagnostics to VSCode.
	// connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
	validateTextDocument(change.document);
	trace('---onDidChangeContent');
});


connection.onDidChangeWatchedFiles((watched) => {
	// trace('---','onDidChangeWatchedFiles');
	watched.changes.forEach(e => {
		let file;
		switch (e.type) {
			case FileChangeType.Created:
				file = fromUriString(e.uri)
				for (const [m, p] of allModulePaths) {
					if (file.startsWith(m)) {
						allModuleSources.get(m).add(file)
					}
				}
				break
			case FileChangeType.Deleted:
				file = fromUriString(e.uri)
				for (const [m, p] of allModulePaths) {
					if (file.startsWith(m)) {
						allModuleSources.get(m).delete(file)
					}
				}
				break
			default:
			//do nothing
		}
	})
});


// This handler provides the initial list of the completion items.
connection.onCompletion(({textDocument, position}): Thenable<CompletionItem[]> => {
	const document: TextDocument = documents.get(textDocument.uri)
	const srcPath = fromDocumentUri(document)
	const srcText: string = document.getText() //NOTE needs on-the-fly buffer
	const offset = document.offsetAt(position) //FIXME
	return sourcekitProtocol
		.codeComplete(srcText, srcPath, offset)
		.then(function (completions) {
			let items = [];
			for (let c of <Array<Object>>completions) {
				let item = CompletionItem.create(c["key.description"])
				item.kind = toCompletionItemKind(c["key.kind"])
				item.detail = `${c["key.modulename"]}.${c["key.name"]}`
				item.insertText = createSuggest(c["key.sourcetext"])
				item.insertTextFormat = InsertTextFormat.Snippet
				items.push(item)
			}
			return items
		}, function (err) {
			//FIXME
			return err
		});
});

/**
 * ref: https://github.com/facebook/nuclide/blob/master/pkg/nuclide-swift/lib/sourcekitten/Complete.js#L57
 */
function createSuggest(sourcetext: string): string {
	// trace("---createSuggest--- ",sourcetext)
	let index = 1
	let snp = sourcetext.replace(/<#T##(.+?)#>/g, (m, g) => {
		return "${" + (index++) + ":" + g.split('##')[0] + "}"
	})
	return snp.replace('<#code#>', `\${${index++}}`)
};

//TODO more meanful CompletionItemKinds...
function toCompletionItemKind(keyKind: string): CompletionItemKind {
	switch (keyKind) {
		case "source.lang.swift.decl.function.free":
		case "source.lang.swift.ref.function.free":
			return CompletionItemKind.Function;
		case "source.lang.swift.decl.function.method.instance":
		case "source.lang.swift.ref.function.method.instance":
		case "source.lang.swift.decl.function.method.static":
		case "source.lang.swift.ref.function.method.static":
			return CompletionItemKind.Method;
		case "source.lang.swift.decl.function.operator":
		case "source.lang.swift.ref.function.operator":
		case "source.lang.swift.decl.function.subscript":
		case "source.lang.swift.ref.function.subscript":
			return CompletionItemKind.Keyword;
		case "source.lang.swift.decl.function.constructor":
		case "source.lang.swift.ref.function.constructor":
		case "source.lang.swift.decl.function.destructor":
		case "source.lang.swift.ref.function.destructor":
			return CompletionItemKind.Constructor;
		case "source.lang.swift.decl.function.accessor.getter":
		case "source.lang.swift.ref.function.accessor.getter":
		case "source.lang.swift.decl.function.accessor.setter":
		case "source.lang.swift.ref.function.accessor.setter":
			return CompletionItemKind.Property;
		case "source.lang.swift.decl.class":
		case "source.lang.swift.ref.class":
		case "source.lang.swift.decl.struct":
		case "source.lang.swift.ref.struct":
			return CompletionItemKind.Class;
		case "source.lang.swift.decl.enum":
		case "source.lang.swift.ref.enum":
			return CompletionItemKind.Enum;
		case "source.lang.swift.decl.enumelement":
		case "source.lang.swift.ref.enumelement":
			return CompletionItemKind.Value;
		case "source.lang.swift.decl.protocol":
		case "source.lang.swift.ref.protocol":
			return CompletionItemKind.Interface;
		case "source.lang.swift.decl.typealias":
		case "source.lang.swift.ref.typealias":
			return CompletionItemKind.Reference;
		case "source.lang.swift.decl.var.instance":
		case "source.lang.swift.ref.var.instance":
			return CompletionItemKind.Field;
		case "source.lang.swift.decl.var.global":
		case "source.lang.swift.ref.var.global":
		case "source.lang.swift.decl.var.static":
		case "source.lang.swift.ref.var.static":
		case "source.lang.swift.decl.var.local":
		case "source.lang.swift.ref.var.local":
			return CompletionItemKind.Variable;

		case "source.lang.swift.decl.extension.struct":
		case "source.lang.swift.decl.extension.class":
			return CompletionItemKind.Class;
		case "source.lang.swift.decl.extension.enum":
			return CompletionItemKind.Enum;
		default:
			return CompletionItemKind.Text;//FIXME
	}
}


// This handler resolve additional information for the item selected in
// the completion list.
// connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
// 	if (item.data === 1) {
// 		item.detail = 'TypeScript details',
// 			item.documentation = 'TypeScript documentation'
// 	} else if (item.data === 2) {
// 		item.detail = 'JavaScript details',
// 			item.documentation = 'JavaScript documentation'
// 	}
// 	return item;
// });

connection.onHover(({textDocument, position}): Promise<Hover> => {
	const document: TextDocument = documents.get(textDocument.uri);
	const srcPath = fromDocumentUri(document);
	const srcText: string = document.getText();//NOTE needs on-the-fly buffer
	const offset = document.offsetAt(position);//FIXME
	return sourcekitProtocol
		.cursorInfo(srcText, srcPath, offset)
		.then(function (cursorInfo) {
			return extractHoverHelp(cursorInfo)
				.then(mks => { return { contents: mks } })
		}, function (err) {
			//FIXME
			return err;
		});
})

async function extractHoverHelp(cursorInfo: Object): Promise<MarkedString[]> {
	//local helper
	function extractText(
		elementName: string, full_as_xml: string) {
		let s = full_as_xml.indexOf(`<${elementName}>`)
		let e = full_as_xml.indexOf(`</${elementName}>`)
		let rt = full_as_xml.substring(s + elementName.length + 2, e)
		return rt
	}
	//TODO wait vscode to support full html rendering...
	//stripe all sub elements
	function stripeOutTags(str) {
		return str.replace(/(<.[^(><.)]+>)/g, (m, c) => '')
	}

	const keyKind = cursorInfo['key.kind']
	const keyName = cursorInfo['key.name']
	if (!keyName) {
		return null
	}

	const full_as_xml = cursorInfo['key.doc.full_as_xml']
	const annotated_decl = cursorInfo['key.annotated_decl']
	const moduleName = cursorInfo['key.modulename']
	const containerTypeUSR = cursorInfo['key.containertypeusr']
	let containerType = null
	if (containerTypeUSR) {
		const res: Array<Object> = await sourcekitProtocol.demangle(containerTypeUSR)
		containerType = res ? res.map(t => t["key.name"]).join(",") : null
	}
	const t = { language: 'markdown', value: keyName }
	const snippet = annotated_decl ?
		"**Declaration:**\n```swift\n" +
		decode(
			stripeOutTags(
				extractText('Declaration',
					full_as_xml ? full_as_xml : annotated_decl))) + "\n```\n"
		+ (containerType ? `**Declared In**:  ${containerType}\n\n` : '')
		+ (moduleName ? `**Module**:  ${moduleName}` : '')
		: keyName
	return [t, snippet];//FIXME clickable keyTypename
}


connection.onDefinition(({textDocument, position}): Promise<Definition> => {
	const document: TextDocument = documents.get(textDocument.uri);
	const srcPath = fromDocumentUri(document);
	const srcText: string = document.getText();//NOTE needs on-the-fly buffer
	const offset = document.offsetAt(position);//FIXME
	return sourcekitProtocol
		.cursorInfo(srcText, srcPath, offset)
		.then(function (cursorInfo) {
			let filepath = cursorInfo['key.filepath']
			if (filepath) {
				if (isWsl) filepath = winPath(filepath)
				const offset = cursorInfo['key.offset']
				const len = cursorInfo['key.length']
				const fileUri = Uri.file(filepath).toString()
				let document: TextDocument = documents.get(fileUri);//FIXME
				//FIXME more here: https://github.com/Microsoft/language-server-protocol/issues/96
				if (!document) {//FIXME just make a temp doc to let vscode help us
					const content = fs.readFileSync(filepath, "utf8");
					document = TextDocument.create(fileUri, "swift", 0, content);
				}
				return {
					uri: fileUri,
					range: {
						start: document.positionAt(offset),
						end: document.positionAt(offset + len)
					}
				}
			} else {
				return null
			}
		}, function (err) {//FIXME
			return err;
		});
})



connection.onDocumentFormatting(({textDocument, options}): Promise<TextEdit[]> => {
	const document: TextDocument = documents.get(textDocument.uri);
	const srcPath = fromDocumentUri(document);
	const srcText = document.getText();//NOTE here needs on-the-fly buffer
	return sourcekitProtocol.editorFormatText(document, srcText, srcPath, 1, document.lineCount);
});

connection.onDocumentRangeFormatting(({textDocument, options, range}): Promise<TextEdit[]> => {
	const document: TextDocument = documents.get(textDocument.uri);
	const srcPath = fromDocumentUri(document);
	const srcText = document.getText();//NOTE here needs on-the-fly buffer
	return sourcekitProtocol.editorFormatText(
		document,
		srcText, srcPath,
		range.start.line + 1,
		range.end.line + 1);//NOTE format req is 1-based
});

function fromDocumentUri(document: { uri: string; }): string {
	// return Files.uriToFilePath(document.uri);
	return fromUriString(document.uri)
}

function fromUriString(uri: string): string {
	return Uri.parse(uri).fsPath
}

/*
connection.onDidOpenTextDocument((params) => {
	// A text document got opened in VSCode.
	// params.uri uniquely identifies the document. For documents store on disk this is a file URI.
	// params.text the initial full content of the document.
	connection.console.log(`${params.uri} opened.`);
});

connection.onDidChangeTextDocument((params) => {
	// The content of a text document did change in VSCode.
	// params.uri uniquely identifies the document.
	// params.contentChanges describe the content changes to the document.
	connection.console.log(`${params.uri} changed: ${JSON.stringify(params.contentChanges)}`);
});

connection.onDidCloseTextDocument((params) => {
	// A text document got closed in VSCode.
	// params.uri uniquely identifies the document.
	connection.console.log(`${params.uri} closed.`);
});
*/

// Listen on the connection
connection.listen();


//=== helper

const xmlEntities = {
	'&amp;': '&',
	'&quot;': '"',
	'&lt;': '<',
	'&gt;': '>'
};
function decode(str) {
	return str.replace(/(&quot;|&lt;|&gt;|&amp;)/g, (m, c) => xmlEntities[c])
}

//FIX issue#15
export function getShellExecPath() {
	return fs.existsSync(shellPath) ? shellPath : "/usr/bin/sh"
}
/**
 * NOTE:
 * now the SDE only support the convention based build
 *
 * TODO: to use build yaml?
 */
let argsImportPaths: string[] = null

export function loadArgsImportPaths(): string[] {
	if (!argsImportPaths) {
		argsImportPaths = []
		argsImportPaths.push("-I")
		var debug = path.join(workspaceRoot, '.build', 'debug')
		if (isWsl) debug = wslPath(debug)
		argsImportPaths.push(debug)
		//FIXME system paths can not be available automatically?
		// rt += " -I"+"/usr/lib/swift/linux/x86_64"
		argsImportPaths.push("-I")
		argsImportPaths.push("/usr/lib/swift/pm/")
		return argsImportPaths
	} else {
		return argsImportPaths
	}
}

export function trace(prefix: string, msg?: string) {
	if (isTracingOn) {
		if (msg) {
			connection.console.log(prefix + msg)
		} else {
			connection.console.log(prefix)
		}
	}
}


//workaround for thenable:https://github.com/Microsoft/vscode-extension-vscode/issues/41
interface Thenable<T> extends PromiseLike<T> {}
import { exec } from "node:child_process";
import * as vscode from "vscode";

const getGitLogForFile = (
	workspaceFolder: string,
	filePath: string,
	startLine: number,
	endLine: number,
): Promise<string> => {
	return new Promise((resolve, reject) => {
		exec(
			`git log -L ${startLine},${endLine}:${filePath}`,
			{ cwd: workspaceFolder },
			(error, stdout, stderr) => {
				if (error) {
					return reject(stderr);
				}
				resolve(stdout);
			},
		);
	});
};

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerTextEditorCommand(
		"git-voyage.ask",
		async (textEditor: vscode.TextEditor) => {
			const workspaceFolder =
				vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			const filePath = textEditor.document.fileName;
			const selection = textEditor.selection;
			const startLine = selection.start.line + 1;
			const endLine = selection.end.line + 1;

			if (!workspaceFolder || !filePath) {
				vscode.window.showErrorMessage("No workspace folder or file found");
				return;
			}

			vscode.window.showInformationMessage(
				`Selected lines: ${startLine} to ${endLine}`,
			);

			const userInput = await vscode.window.showInputBox({
				prompt: "Please enter a question",
			});

			if (!userInput) {
				vscode.window.showWarningMessage("No string was entered");
				return;
			}

			try {
				const commits = await getGitLogForFile(
					workspaceFolder,
					filePath,
					startLine,
					endLine,
				);
				let chatResponse: vscode.LanguageModelChatResponse | undefined;
				const [model] = await vscode.lm.selectChatModels({
					vendor: "copilot",
					family: "gpt-3.5-turbo",
				});
				if (!model) {
					console.log(
						"Model not found. Please make sure the GitHub Copilot Chat extension is installed and enabled.",
					);
					return;
				}
				const messages = [
					vscode.LanguageModelChatMessage.User(
						`ask: ${userInput}. Results are brief.`,
					),
					vscode.LanguageModelChatMessage.User(commits),
				];
				chatResponse = await model.sendRequest(
					messages,
					{},
					new vscode.CancellationTokenSource().token,
				);

				const fragments: string[] = [];
				for await (const fragment of chatResponse.text) {
					fragments.push(fragment);
				}

				// Stream the code into the editor as it is coming in from the Language Model
				await textEditor.edit((edit) => {
					const position = new vscode.Position(
						startLine - 1,
						textEditor.document.lineAt(startLine - 2).text.length,
					);
					const resultText = fragments.join("\n").replaceAll("\n", "");
					edit.insert(position, `${resultText}\n`);
				});
			} catch (error) {
				vscode.window.showErrorMessage(`Error: ${error}`);
			}
		},
	);

	context.subscriptions.push(disposable);
}

export function deactivate() {}

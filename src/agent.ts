import * as readline from "readline";
import Anthropic from "@anthropic-ai/sdk";

const cliMd = require('cli-markdown').default;

let debug = false;

import type { ToolDefinition } from "./tools";

export class Agent {
	private client: Anthropic;
	private conversation: Anthropic.Messages.MessageParam[] = [];
	private tools: ToolDefinition[];
	private model: string;
	private modelShortName: string;

	constructor(apiKey: string, tools: ToolDefinition[]) {
		this.client = new Anthropic({ apiKey: apiKey });
		this.tools = tools;
		this.model = "claude-opus-4-7";
		this.modelShortName = this.model;
	}

	async run(): Promise<void> {
		let toolResult = false;  // flag whether there is a Tool Use result the LLM still needs to process

		while (true) {
			if (!toolResult) {
				// Step 1: get user's prompt/input
				let msg = await this.getUserInput();

				// Step 2: add the user's prompt to the Conversation (see https://platform.claude.com/docs/en/api/sdks/typescript#usage)
				if (msg) {
					this.conversation.push({ role: "user", content: msg });
				} else {
					continue; // prompt again if no input (eg: slash command used)
				}
			}

			// Step 3: send the Converation to the LLM
			const llmResponse = await this.sendConversation();
			toolResult = false; // regardless of whether there was a Tool result or not, it would have been processed at this point

			// Step 4: process LLM response(s)
			for (const block of llmResponse.content) {
				if (block.type === "text") {
					// text returned
					await this.handleTextResponse(block);

				} else if (block.type === "tool_use") {
					// tool used
					await this.handleToolUse(block);
					toolResult = true;
				}
			}

			if (debug) { this.printConversationDebug(); }
		}
	}

	private async getUserInput(): Promise<string> {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		const answer = await new Promise<string>((resolve) =>
			rl.question('\x1b[38;5;80mYou:\x1b[0m ', resolve)
		);
		rl.close();

		if (answer && (answer.indexOf("/") == 0)) {
			await this.slashCommand(answer);
			console.log();
			return "";

		} else {
			console.log();
			return answer;
		}
	}

	private async handleTextResponse(block: Anthropic.Messages.TextBlock) {
		// add the LLM's response to the Conversation
		this.conversation.push({
			role: "assistant",
			content: block.text
		});

		// display LLM text responses
		console.log('\x1b[38;5;208m' + this.modelShortName + ':\x1b[0m', cliMd(block.text).trim(), "\n");
	}

	private async handleToolUse(block: Anthropic.Messages.ToolUseBlock) {
		/* eg:
			{
				type: 'tool_use',
				id: 'toolu_01SvoWboiPLQzi3pub5o1tME',
				name: 'echo',
				input: { text: 'hello world' },
				caller: { type: 'direct' }
			}
		*/

		// add the LLM's tool use to the conversation
		this.conversation.push({ role: "assistant", content: [block] });

		// execute the tool 
		let toolResults = await this.executeTool(block.id, block.name, block.input);

		// add the tool's result to the Conversation
		this.conversation.push({ role: "user", content: toolResults });
	}

	private async slashCommand(msg: string) {
		if (msg == "/models") {
			// list available models
			console.log("Anthropic Models:")
			for await (const modelInfo of this.client.models.list()) {
			  console.log(" * " + modelInfo.id);
			}

		} else if (msg.startsWith("/model ")) {
			// change models
			const model = msg.slice(7).trim();
			if (model) {
				console.log("Switching from " + this.model + " to " + model);

				let modelShortName = model.replace("claude-", "");
				modelShortName = modelShortName.charAt(0).toUpperCase() + modelShortName.substring(1);
				const idx = modelShortName.indexOf("-202");
				if (idx !== -1) {
					modelShortName = modelShortName.slice(0, idx);
				}

				this.model = model;
				this.modelShortName = modelShortName;
			} else {
				console.log("Please specify a model name!");
			}

		} else if (msg === "/debug") {
			debug = !debug;
			console.log("Debug:", debug);

		} else if (msg === "/help") {
			console.log("* /model {model} = change active Anthropic model");
			console.log("* /models        = list available Anthropic models");
			console.log("* /debug         = enable debug logging");
			console.log("* /quit          = quit");

		} else if (msg === "/quit") {
			console.log("Good bye :)");
			console.log();
			process.exit(0);

		} else {
			console.log("Unknown command - try /help");
		}
	}

	private async sendConversation() {
		if (debug) { this.printConversationDebug(); }

		const message = await this.client.messages.create({
			max_tokens: 1024,
			messages: this.conversation,
			model: this.model,
			tools: this.tools,
		});

		return message;
	}

	private async executeTool(id: string, name: string, input: unknown): Promise<Anthropic.ToolResultBlockParam[]> {
		if (debug) {
			console.log("[DEBUG] Executing tool: ", name)
		}

		const toolResults: Anthropic.ToolResultBlockParam[] = [];

		try {
			const theTool = this.tools.find(t => t.name == name);

			if (theTool) {
				const result = await theTool.handler(input)
				toolResults.push({
					type: "tool_result",
					tool_use_id: id,
					content: typeof result === "string" ? result : JSON.stringify(result),
					is_error: false
				});
				if (debug) {
					console.log("[DEBUG] Tool results: ", toolResults);
				}

			} else {
				toolResults.push({
					type: "tool_result",
					tool_use_id: id,
					content: "tool not found",
					is_error: true
				});
			}

		} catch(e) {
			// if something goes wrong
			console.log("ERROR: exception while executing tool: ", e)
			toolResults.push({
				type: "tool_result",
				tool_use_id: id,
				content: "exception",
				is_error: true
			});
		}

		return toolResults;
	}

	private printConversationDebug() {
		console.log("----------------------------------------");
		console.log("[DEBUG] Conversation (context):");
		console.log(' ' + cliMd('```json\n' + JSON.stringify(this.conversation, null, 4), '```').trim());
		console.log("----------------------------------------");
	}
}
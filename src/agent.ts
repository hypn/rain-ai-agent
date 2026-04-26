import Anthropic from "@anthropic-ai/sdk";
import type { ToolDefinition } from "./tools";

export type GetUserMessage = () => Promise<[string, boolean]>;

export class Agent {
	private client: Anthropic;
	private getUserMessage: GetUserMessage;
	private conversation: Anthropic.Messages.MessageParam[] = [];
	private tools: ToolDefinition[];

	constructor(client: Anthropic, getUserMessage: GetUserMessage, tools: ToolDefinition[]) {
		this.client = client;
		this.getUserMessage = getUserMessage;
		this.tools = tools;
	}

	async run(): Promise<void> {
		console.log("Chatting with AI (press CTRL+C to quit)")
		let skipUserInput = false;

		while (true) {
			// allow a cycle without prompting the user (eg: tool use)
			if (skipUserInput) {
				skipUserInput = false;
			} else {
				const [msg, ok] = await this.getUserMessage();
				if (!ok) {
					break;
				}

				// see https://platform.claude.com/docs/en/api/sdks/typescript#usage

				// add the user's message to the conversation
				this.conversation.push({
					role: "user",
					content: msg
				});
			}


			// get a response from the AI
			const message = await this.client.messages.create({
				max_tokens: 1024,
				messages: this.conversation,
				model: "claude-opus-4-7",
  				tools: this.tools,
			});

			for (const block of message.content) {
				if (block.type === "text") {
					console.log("Claude: ", block.text);

					// ERROR: "This model does not support assistant message prefill. The conversation must end with a user message"
					// // add the AI's response to the conversation
					// this.conversation.push({
					// 	role: "assistant",
					// 	content: block.text
					// });

				} else if (block.type === "tool_use") {
					/*
						{
							type: 'tool_use',
							id: 'toolu_01SvoWboiPLQzi3pub5o1tME',
							name: 'echo',
							input: { text: 'hello world' },
							caller: { type: 'direct' }
						}
					*/
					this.conversation.push({
						role: "assistant", 
						content: message.content
					});

					let toolResults = await this.executTool(block.id, block.name, block.input);
			  		this.conversation.push({
						role: "user",
						content: toolResults
					});
					skipUserInput = true;


				} else {
					console.log("[DEBUG] Unknown block.type received: ", block.type);
				}
			}

		}
	}

	private async executTool(id: string, name: string, input: any): Promise<any> {
		console.log("[DEBUG] Executing tool: ", name)

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
				console.log("[DEBUG] Tool results: ", toolResults);

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

  		// this.conversation.push({
		// 	role: "user",
		// 	content: toolResults
		// });

  		// // send the result back to 
		// const message = await this.client.messages.create({
		// 	max_tokens: 1024,
		// 	messages: this.conversation,
		// 	model: "claude-opus-4-7",
		// 	tools: this.tools,
		// });
	}
}
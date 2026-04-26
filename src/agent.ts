import Anthropic from "@anthropic-ai/sdk";
export type GetUserMessage = () => Promise<[string, boolean]>;

export class Agent {
	private client: Anthropic;
	private getUserMessage: GetUserMessage;
	private conversation: Anthropic.Messages.MessageParam[] = [];

	constructor(client: Anthropic, getUserMessage: GetUserMessage) {
		this.client = client;
		this.getUserMessage = getUserMessage;
	}

	async run(): Promise<void> {
		console.log("Chatting with AI (press CTRL+C to quit)")

		while (true) {
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

			// get a response from the AI
			const message = await this.client.messages.create({
				max_tokens: 1024,
				messages: this.conversation,
				model: "claude-opus-4-7"
			});

			// add the AI's response to the conversation
			this.conversation.push({
				role: "assistant",
				content: msg
			});

			for (const block of message.content) {
				if (block.type === "text") {
					console.log("Claude: ", block.text)
				}
			}

		}
	}
}
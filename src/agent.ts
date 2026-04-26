export type GetUserMessage = () => Promise<[string, boolean]>;

export class Agent {
	private getUserMessage: GetUserMessage;

	constructor(getUserMessage: GetUserMessage) {
		this.getUserMessage = getUserMessage;
	}

	async run(): Promise<void> {
		while (true) {
			const [msg, ok] = await this.getUserMessage();

			if (!ok) {
				break;
			}

			console.log("User said: ", msg)
		}
	}
}
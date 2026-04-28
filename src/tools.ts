const { exec } = require('child_process')

const debug = false;

export type ToolDefinition = {
	name: string;
	description: string;
	input_schema: any;
	handler: (input: any) => Promise<string>;
};

export const tools: ToolDefinition[] = [
	{
	name: "cli",
	description: "Executes a Linux CLI command",
	input_schema: {
		type: "object",
		properties: {
		command: { type: "string" },
		arguments: { type: "string" },
		},
		required: ["command"],
	},
	async handler(input) {

		if (debug) {
			console.log("[DEBUG]: Running cli tool: ", input.command);
			if (input.arguments) {
				console.log("[DEBUG]: Arguments: ", input.arguments);
			}
		}

		return new Promise((resolve) => {
			let command = input.command;
			if (input.arguments) {
				command += " " + input.arguments;
			}

			exec(command, (error: Error | null, stdout: string, stderr: string) => {
				if (error) {
				console.log("ERROR: ", error.message)
				console.log("Returning: " + `Unexpected error running command!`);
				return resolve(`Unexpected error running command!`);

				} else if (stderr) {
				let errMessage = "Error running command \"" + command + "\" - consider running `tldr {command}` for usage examples."
				errMessage += "STDERR: " + stderr;

				return resolve(errMessage);

				} else {
				return resolve(stdout);
				}
			});
		});
	},
	},

];
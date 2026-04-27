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
    name: "echo",
    description: "Returns the same text",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string" },
      },
      required: ["text"],
    },
    async handler(input) {
      return input.text;
    },
  },

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
			  }
			  if (stderr) {
			    // console.log("Returning: " + `Stderr: ${stderr}`);
			    return resolve(`Stderr: ${stderr}`);
			  }
			  // console.log("Returning: " + stdout);
			  return resolve(stdout);
			});
		});
    },
  },

];
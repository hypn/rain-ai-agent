import * as readline from "readline";

const cliMd = require('cli-markdown').default;

let debug = false;

import type { ToolDefinition } from "./tools";
import { Tool } from "@anthropic-ai/sdk/resources";

type UserMessage = {
  role: "user";
  content: string;
};

type AssistantMessage = {
  role: "assistant";
  content: string;
  reasoning_content?: string;
  tool_calls?: {
    type: "function";
    id: string;
    function: {
      name: string;
      arguments: string;
    };
  }[];
};

type ToolResponse = {
  role: "tool";
  tool_call_id: string;
  content: string;
};

// // https://github.com/mubashir1osmani/litellm-docs/blob/1cdd15c5b27fd3fa934ff9724070167c18160819/reasoning_content.md?plain=1#L166-L170
// type AssistantToolUsageMessage = {
//   role: "assistant";
//   tool_calls: {
//     type: "function";
//     id: string;
//     function: {
//       name: string;
//       arguments: string;
//     };
//   }[];
// };

// // https://github.com/mubashir1osmani/litellm-docs/blob/1cdd15c5b27fd3fa934ff9724070167c18160819/reasoning_content.md?plain=1#L171
// type ToolUsageResponse = {
//   role: "tool";
//   tool_call_id: string;
//   content: string;
// };

type OpenAiTool = {
    type: string; 
    function: {
        name: string; 
        description: string; 
        parameters: Tool.InputSchema; 
    }; 
}

type LLMChoice = {
  finish_reason: string;
  index: number;
  message: AssistantMessage;
};

type LLMResponse = {
  choices: LLMChoice[];
};

type Message = UserMessage | AssistantMessage | ToolResponse

export class OpenAiAgent {
	private apiKey: string | undefined;
    private baseUrl: string;
    private conversation: Message[] = [];
    private tools: ToolDefinition[];
    private model: string;
    private modelShortName: string;

    constructor(tools: ToolDefinition[]) {
		this.apiKey = process.env.OPENAI_API_KEY;
		this.baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:8080/v1";
        this.tools = tools;
        this.model = process.env.LLM_MODEL || "Jackrong/Qwen3.5-9B-DeepSeek-V4-Flash-GGUF:Q8_0";
        this.modelShortName = this.shortenModelName();
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
            for (const choice of llmResponse.choices) {
                if ((choice.finish_reason === "stop" || choice.finish_reason === "length") && choice.message?.content) {  // or `finish_reason` "stop", "length"
                    // text returned
                    await this.handleTextResponse(choice.message);

                } else if (choice.finish_reason === "tool_calls") {
                    // tool used
                    await this.handleToolUse(choice.message);
                    toolResult = true;

                } else {
                    console.log("================================================")
                    console.log("Unexpected Response:")
                    console.log(JSON.stringify(choice, null, 4))
                    console.log("Conversation:")
                    console.log(JSON.stringify(this.conversation, null, 4))
                    console.log("================================================")
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


    private async handleTextResponse(block: AssistantMessage) {
        // add the LLM's response to the Conversation
        const msg: AssistantMessage = {
            role: "assistant",
            content: block.content,
        };
        this.conversation.push(msg);

        // display LLM text responses
        console.log('\x1b[38;5;208m' + this.modelShortName + ':\x1b[0m', cliMd(block.content).trim(), "\n");
    }

    private async handleToolUse(block: AssistantMessage) {
        // add the LLM's response to the Conversation
        this.conversation.push(block);

        const tool = block.tool_calls?.[0];
        if (tool) {
            // execute the tool 
            let toolResult: string = await this.executeTool(tool.id, tool.function.name, tool.function.arguments);

            // // add the tool's result to the Conversation
            this.conversation.push({ role: "tool", "tool_call_id": tool.id, content: toolResult });
        }
    }

    private async slashCommand(msg: string) {
        if (msg.startsWith("/model ")) {
            // change models
            const model = msg.slice(7).trim();
            if (model) {
                console.log("Switching from " + this.model + " to " + model);
                this.model = model;
                this.modelShortName = this.shortenModelName();
            } else {
                console.log("Please specify a model name!");
            }

        } else if (msg === "/debug") {
            debug = !debug;
            console.log("Debug:", debug);

        } else if (msg === "/help") {
            console.log("* /model {model} = change active Anthropic model");
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

    private shortenModelName(): string {
        // eg: "Jackrong/Qwen3.5-9B-DeepSeek-V4-Flash-GGUF:Q8_0"
        // to: "Qwen3.5-9B-DeepSeek-V4-Flash-GGUF"
        let modelShortName = this.model.split("/")[1]?.split(":")[0] ?? "";
        modelShortName = modelShortName.replace("-GGUF", "");
        return modelShortName || this.model;
    }

    private async sendConversation(): Promise<LLMResponse> {
        let tools: OpenAiTool[] = []
        this.tools.forEach(t => {
            tools.push({
                type: "function",
                function: {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.input_schema
                }
            })
        });

        const response = await fetch(this.baseUrl + "/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                "model": this.model,
                "messages": this.conversation,
                tools: tools,
                "temperature": 0.7,
                "max_tokens": 1024 // TODO: make this configurable?
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        if (debug) {
            console.log(JSON.stringify(data, null, 4))
        }
        return data;
    }

    private async executeTool(id: string, name: string, input: string) {
        if (debug) {
            console.log("[DEBUG] Executing tool: ", name)
        }

        try {
            const theTool = this.tools.find(t => t.name == name);

            if (theTool) {
                const values = JSON.parse(input);
                const result = await theTool.handler(values);
                if (debug) {
                    console.log("[DEBUG] Tool result: ", result);
                }
                return typeof result === "string" ? result : JSON.stringify(result);

            } else {
                return "Error: Tool not found!";
            }

        } catch(e) {
            // if something goes wrong
            console.log("ERROR: exception while executing tool: ", e)
            return "ERROR: exception while executing tool: " + e;
        }
    }

    private printConversationDebug() {
        console.log("----------------------------------------");
        console.log("[DEBUG] Conversation (context):");
        console.log(' ' + cliMd('```json\n' + JSON.stringify(this.conversation, null, 4), '```').trim());
        console.log("----------------------------------------");
    }
}
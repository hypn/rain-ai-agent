import * as readline from "readline";
import Anthropic from "@anthropic-ai/sdk";

import { Agent } from "./agent";
import type { GetUserMessage } from "./agent";
import type { ToolDefinition } from "./tools";
import { tools } from "./tools";

function createUserInput(): GetUserMessage {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return () => {
    return new Promise((resolve) => {
      rl.question('\x1b[38;5;80mYou:\x1b[0m ', (answer :string) => {
        if (!answer) {
          rl.close();
          resolve(["", false]);
        } else {
          console.log();
          resolve([answer, true]);
        }
      });
    });
  }
}

async function main() {
  const client = new Anthropic({
    // https://platform.claude.com/settings/workspaces/default/keys
    apiKey: "KEY_HERE"
  });

  const getUserMessage = createUserInput();
  const agent = new Agent(client, getUserMessage, tools);

  await agent.run();
}

main();
import * as readline from "readline";
import { Agent } from "./agent";
import type { GetUserMessage } from "./agent";

function createUserInput(): GetUserMessage {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return () => {
    return new Promise((resolve) => {
      rl.question("> ", (answer :string) => {
        if (!answer) {
          rl.close();
          resolve(["", false]);
        } else {
          resolve([answer, true]);
        }
      });
    });
  }
}

async function main() {
  const getUserMessage = createUserInput();
  const agent = new Agent(getUserMessage);

  await agent.run();
}

main();
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
];
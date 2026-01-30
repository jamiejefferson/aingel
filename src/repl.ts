import * as readline from 'readline';
import chalk from 'chalk';
import { LLMClient, ChatMessage, ToolCall } from './client.js';
import { toolDefinitions, executeTool } from './tools.js';

export class Repl {
  private client: LLMClient;
  private projectRoot: string;
  private history: ChatMessage[] = [];
  private rl: readline.Interface | null = null;

  constructor(client: LLMClient, projectRoot: string) {
    this.client = client;
    this.projectRoot = projectRoot;
  }

  private getSystemPrompt(): string {
    return `You are Aingel, a helpful coding assistant. You are working in the project directory: ${this.projectRoot}

You have access to these tools:
- read_file: Read file contents
- write_file: Create or update files
- list_files: List files matching a glob pattern
- search_files: Search for text/regex in files
- run_command: Execute shell commands (requires user confirmation)

Always use relative paths from the project root. Be concise and helpful.`;
  }

  async start(): Promise<void> {
    this.history = [
      { role: 'system', content: this.getSystemPrompt() },
    ];

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(chalk.green('\n  Ready! Type your message or /help for commands.\n'));

    this.prompt();
  }

  private prompt(): void {
    this.rl?.question(chalk.cyan('  You: '), async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        this.prompt();
        return;
      }

      // Handle commands
      if (trimmed.startsWith('/')) {
        await this.handleCommand(trimmed);
        this.prompt();
        return;
      }

      // Process user message
      await this.processMessage(trimmed);
      this.prompt();
    });
  }

  private async handleCommand(command: string): Promise<void> {
    const parts = command.slice(1).split(' ');
    const cmd = parts[0].toLowerCase();

    switch (cmd) {
      case 'quit':
      case 'exit':
      case 'q':
        console.log(chalk.yellow('\n  Goodbye!\n'));
        this.rl?.close();
        process.exit(0);
        break;

      case 'clear':
        this.history = [
          { role: 'system', content: this.getSystemPrompt() },
        ];
        console.log(chalk.yellow('  Conversation cleared.\n'));
        break;

      case 'model':
        console.log(chalk.blue(`  Current model: ${this.client.getModel()}\n`));
        break;

      case 'history':
        console.log(chalk.blue(`  Messages in history: ${this.history.length}\n`));
        break;

      case 'help':
        console.log(chalk.blue(`
  Available commands:
    /quit, /exit, /q  - Exit Aingel
    /clear            - Clear conversation history
    /model            - Show current model
    /history          - Show message count
    /help             - Show this help
`));
        break;

      default:
        console.log(chalk.red(`  Unknown command: ${cmd}. Type /help for available commands.\n`));
    }
  }

  private async processMessage(userMessage: string): Promise<void> {
    this.history.push({ role: 'user', content: userMessage });

    try {
      await this.getResponse();
    } catch (error) {
      const err = error as Error;
      console.log(chalk.red(`\n  Error: ${err.message}\n`));
    }
  }

  private async getResponse(): Promise<void> {
    process.stdout.write(chalk.magenta('\n  Aingel: '));

    let fullContent = '';
    let toolCalls: ToolCall[] = [];

    for await (const chunk of this.client.chatStream(this.history, toolDefinitions)) {
      if (chunk.type === 'content') {
        process.stdout.write(chunk.content);
        fullContent += chunk.content;
      } else if (chunk.type === 'tool_calls') {
        toolCalls = chunk.tool_calls;
      }
    }

    // Handle tool calls
    if (toolCalls.length > 0) {
      console.log(''); // Newline after any content

      // Add assistant message with tool calls
      this.history.push({
        role: 'assistant',
        content: fullContent || null,
        tool_calls: toolCalls,
      });

      // Execute each tool and collect results
      for (const toolCall of toolCalls) {
        console.log(chalk.yellow(`\n  [Tool: ${toolCall.function.name}]`));

        let args: Record<string, unknown>;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }

        const result = await executeTool(toolCall.function.name, args, this.projectRoot);

        // Show abbreviated result
        const preview = result.result.length > 200
          ? result.result.slice(0, 200) + '...'
          : result.result;
        console.log(chalk.gray(`  ${preview.split('\n').join('\n  ')}`));

        // Add tool result to history
        this.history.push({
          role: 'tool',
          content: result.result,
          tool_call_id: toolCall.id,
        });
      }

      // Get follow-up response after tool execution
      await this.getResponse();
    } else if (fullContent) {
      console.log('\n');
      this.history.push({ role: 'assistant', content: fullContent });
    } else {
      console.log(chalk.gray('(no response)'));
      console.log('');
    }
  }

  close(): void {
    this.rl?.close();
  }
}

#!/usr/bin/env node

import * as readline from 'readline';
import { existsSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import { loadConfig, saveConfig, addRecentFolder, Config } from './config.js';
import { LLMClient } from './client.js';
import { Repl } from './repl.js';

function printBanner(): void {
  console.log(chalk.cyan(`
  ╭─────────────────────────────────────╮
  │  Aingel - Local LLM Code Assistant  │
  ╰─────────────────────────────────────╯
`));
}

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function promptForHost(): Promise<{ host: string; port: number }> {
  console.log(chalk.yellow('  First time setup - configure LM Studio connection\n'));

  const hostInput = await prompt('  LM Studio host IP (e.g., 192.168.1.50): ');
  const portInput = await prompt('  LM Studio port (default: 1234): ');

  const host = hostInput || 'localhost';
  const port = portInput ? parseInt(portInput, 10) : 1234;

  return { host, port };
}

async function selectFolder(config: Config): Promise<string> {
  console.log(chalk.blue('\n  Which folder are you working on today?'));

  if (config.recentFolders.length > 0) {
    console.log(chalk.gray('  Recent folders:'));
    config.recentFolders.slice(0, 5).forEach((folder, i) => {
      console.log(chalk.gray(`    ${i + 1}. ${folder}`));
    });
    console.log('');
  }

  const input = await prompt('  > ');

  // Check if it's a number (selecting recent folder)
  const num = parseInt(input, 10);
  if (!isNaN(num) && num >= 1 && num <= config.recentFolders.length) {
    return config.recentFolders[num - 1];
  }

  // Otherwise treat as path
  return resolve(input || process.cwd());
}

async function main(): Promise<void> {
  printBanner();

  // Parse command line args
  const args = process.argv.slice(2);
  let hostArg: string | undefined;
  let portArg: number | undefined;
  let folderArg: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--host' && args[i + 1]) {
      hostArg = args[++i];
    } else if (arg === '--port' && args[i + 1]) {
      portArg = parseInt(args[++i], 10);
    } else if (!arg.startsWith('--')) {
      folderArg = arg;
    }
  }

  // Load config
  let config = await loadConfig();

  // Get host/port from args, env, or config
  let host = hostArg || process.env.LLM_HOST || config.host;
  let port = portArg || (process.env.LLM_PORT ? parseInt(process.env.LLM_PORT, 10) : config.port);

  // First run - prompt for host
  if (!host) {
    const setup = await promptForHost();
    host = setup.host;
    port = setup.port;
    config.host = host;
    config.port = port;
    await saveConfig(config);
  }

  // Connect to LM Studio
  console.log(chalk.gray(`  Connecting to LM Studio at ${host}:${port}...`));

  const client = new LLMClient(host, port);

  try {
    const connected = await client.testConnection();
    if (!connected) {
      console.log(chalk.red('\n  Failed to connect to LM Studio.'));
      console.log(chalk.yellow('  Make sure LM Studio is running and the server is enabled.'));
      console.log(chalk.gray(`  Tried: http://${host}:${port}/v1/models\n`));
      process.exit(1);
    }

    // Auto-detect model
    const models = await client.listModels();
    if (models.length === 0) {
      console.log(chalk.red('\n  No models found in LM Studio.'));
      console.log(chalk.yellow('  Load a model in LM Studio before starting Aingel.\n'));
      process.exit(1);
    }

    const selectedModel = models[0].id;
    client.setModel(selectedModel);
    console.log(chalk.green(`  ✓ Connected! Model: ${selectedModel}`));
  } catch (error) {
    const err = error as Error;
    console.log(chalk.red(`\n  Connection error: ${err.message}`));
    console.log(chalk.yellow('  Make sure LM Studio is running and the server is enabled.\n'));
    process.exit(1);
  }

  // Select project folder
  let projectFolder: string;
  if (folderArg) {
    projectFolder = resolve(folderArg);
  } else {
    projectFolder = await selectFolder(config);
  }

  // Validate folder exists
  if (!existsSync(projectFolder)) {
    console.log(chalk.red(`\n  Folder not found: ${projectFolder}\n`));
    process.exit(1);
  }

  // Save to recent folders
  await addRecentFolder(projectFolder);

  console.log(chalk.gray(`  Working directory: ${projectFolder}`));

  // Start REPL
  const repl = new Repl(client, projectFolder);
  await repl.start();
}

main().catch((error) => {
  console.error(chalk.red(`Fatal error: ${error.message}`));
  process.exit(1);
});

#!/usr/bin/env node

import * as readline from 'readline';
import { existsSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import { loadConfig, saveConfig, addRecentFolder, addServer, setDefaultServer, Config, LLMServer } from './config.js';
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

async function promptForNewServer(): Promise<LLMServer> {
  console.log(chalk.yellow('\n  Add a new LLM server\n'));

  const name = await prompt('  Server name (e.g., "llama", "mistral"): ');
  const hostInput = await prompt('  Host IP (e.g., 192.168.1.50 or localhost): ');
  const portInput = await prompt('  Port (default: 1234): ');

  return {
    name: name || 'default',
    host: hostInput || 'localhost',
    port: portInput ? parseInt(portInput, 10) : 1234,
  };
}

async function selectServer(config: Config): Promise<LLMServer | null> {
  if (config.servers.length === 0) {
    return null;
  }

  console.log(chalk.blue('\n  Select an LLM server:'));
  config.servers.forEach((server, i) => {
    const isDefault = server.name === config.defaultServer ? chalk.green(' (default)') : '';
    console.log(chalk.gray(`    ${i + 1}. ${server.name} - ${server.host}:${server.port}${isDefault}`));
  });
  console.log(chalk.gray(`    ${config.servers.length + 1}. Add new server`));
  console.log('');

  const input = await prompt('  > ');
  const num = parseInt(input, 10);

  if (num === config.servers.length + 1) {
    return null; // Signal to add new server
  }

  if (!isNaN(num) && num >= 1 && num <= config.servers.length) {
    return config.servers[num - 1];
  }

  // Try to match by name
  const byName = config.servers.find(s => s.name.toLowerCase() === input.toLowerCase());
  if (byName) return byName;

  // Default to first server or default server
  if (config.defaultServer) {
    const defaultServer = config.servers.find(s => s.name === config.defaultServer);
    if (defaultServer) return defaultServer;
  }

  return config.servers[0];
}

async function selectModel(client: LLMClient, models: { id: string }[]): Promise<string> {
  if (models.length === 1) {
    return models[0].id;
  }

  console.log(chalk.blue('\n  Available models:'));
  models.forEach((model, i) => {
    console.log(chalk.gray(`    ${i + 1}. ${model.id}`));
  });
  console.log('');

  const input = await prompt('  Select model (number or name, default: 1): ');
  const num = parseInt(input, 10);

  if (!isNaN(num) && num >= 1 && num <= models.length) {
    return models[num - 1].id;
  }

  // Try to match by partial name
  if (input) {
    const byName = models.find(m => m.id.toLowerCase().includes(input.toLowerCase()));
    if (byName) return byName.id;
  }

  return models[0].id;
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
  let serverArg: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--host' && args[i + 1]) {
      hostArg = args[++i];
    } else if (arg === '--port' && args[i + 1]) {
      portArg = parseInt(args[++i], 10);
    } else if ((arg === '--server' || arg === '-s') && args[i + 1]) {
      serverArg = args[++i];
    } else if (!arg.startsWith('--') && !arg.startsWith('-')) {
      folderArg = arg;
    }
  }

  // Load config
  let config = await loadConfig();

  // Get host/port from args, env, or config
  let host = hostArg || process.env.LLM_HOST;
  let port = portArg || (process.env.LLM_PORT ? parseInt(process.env.LLM_PORT, 10) : undefined);

  // If --server flag provided, find that server
  if (!host && serverArg && config.servers.length > 0) {
    const server = config.servers.find(s => s.name.toLowerCase() === serverArg.toLowerCase());
    if (server) {
      host = server.host;
      port = server.port;
      console.log(chalk.gray(`  Using server: ${server.name}`));
    } else {
      console.log(chalk.red(`\n  Server not found: ${serverArg}`));
      console.log(chalk.yellow('  Available servers:'));
      config.servers.forEach(s => console.log(chalk.gray(`    - ${s.name}`)));
      console.log('');
      process.exit(1);
    }
  }

  // If no args/env, use server selector or legacy config
  if (!host) {
    if (config.servers.length > 0) {
      // Multi-server mode: select from configured servers
      let selectedServer = await selectServer(config);

      if (!selectedServer) {
        // User wants to add a new server
        const newServer = await promptForNewServer();
        await addServer(newServer);
        config = await loadConfig();
        selectedServer = newServer;
      }

      host = selectedServer.host;
      port = selectedServer.port;

      // Ask if this should be the default
      if (config.servers.length > 1 && selectedServer.name !== config.defaultServer) {
        const makeDefault = await prompt(`  Set "${selectedServer.name}" as default? (y/N): `);
        if (makeDefault.toLowerCase() === 'y') {
          await setDefaultServer(selectedServer.name);
        }
      }
    } else if (config.host) {
      // Legacy single-host mode
      host = config.host;
      port = config.port;
    } else {
      // First run - prompt for host and save as server
      const setup = await promptForHost();
      host = setup.host;
      port = setup.port;

      // Save as first server
      const serverName = await prompt('  Give this server a name (e.g., "main", "llama"): ');
      const newServer: LLMServer = {
        name: serverName || 'default',
        host,
        port,
      };
      await addServer(newServer);
      await setDefaultServer(newServer.name);

      // Also update legacy config for backwards compat
      config.host = host;
      config.port = port;
      await saveConfig(config);
    }
  }

  port = port || 1234;

  // Connect to LM Studio
  console.log(chalk.gray(`\n  Connecting to ${host}:${port}...`));

  const client = new LLMClient(host, port);

  try {
    const connected = await client.testConnection();
    if (!connected) {
      console.log(chalk.red('\n  Failed to connect to LLM server.'));
      console.log(chalk.yellow('  Make sure the server is running and accessible.'));
      console.log(chalk.gray(`  Tried: http://${host}:${port}/v1/models\n`));
      process.exit(1);
    }

    // List and select model
    const models = await client.listModels();
    if (models.length === 0) {
      console.log(chalk.red('\n  No models found on server.'));
      console.log(chalk.yellow('  Load a model before starting Aingel.\n'));
      process.exit(1);
    }

    const selectedModel = await selectModel(client, models);
    client.setModel(selectedModel);
    console.log(chalk.green(`  ✓ Connected! Model: ${selectedModel}`));
  } catch (error) {
    const err = error as Error;
    console.log(chalk.red(`\n  Connection error: ${err.message}`));
    console.log(chalk.yellow('  Make sure the LLM server is running and accessible.\n'));
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

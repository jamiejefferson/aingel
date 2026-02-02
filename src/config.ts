import { homedir } from 'os';
import { join } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

export interface LLMServer {
  name: string;
  host: string;
  port: number;
}

export interface Config {
  host: string;
  port: number;
  recentFolders: string[];
  servers: LLMServer[];
  defaultServer?: string;
}

const CONFIG_PATH = join(homedir(), '.aingel.json');

const DEFAULT_CONFIG: Config = {
  host: '',
  port: 1234,
  recentFolders: [],
  servers: [],
};

export async function loadConfig(): Promise<Config> {
  try {
    if (!existsSync(CONFIG_PATH)) {
      return { ...DEFAULT_CONFIG };
    }
    const data = await readFile(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(data) as Partial<Config>;
    return {
      ...DEFAULT_CONFIG,
      ...config,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export async function addRecentFolder(folder: string): Promise<void> {
  const config = await loadConfig();

  // Remove if already exists, then add to front
  config.recentFolders = config.recentFolders.filter(f => f !== folder);
  config.recentFolders.unshift(folder);

  // Keep only last 10 folders
  config.recentFolders = config.recentFolders.slice(0, 10);

  await saveConfig(config);
}

export async function updateHost(host: string, port: number = 1234): Promise<void> {
  const config = await loadConfig();
  config.host = host;
  config.port = port;
  await saveConfig(config);
}

export async function addServer(server: LLMServer): Promise<void> {
  const config = await loadConfig();
  // Remove if exists (by name), then add
  config.servers = config.servers.filter(s => s.name !== server.name);
  config.servers.push(server);
  await saveConfig(config);
}

export async function removeServer(name: string): Promise<void> {
  const config = await loadConfig();
  config.servers = config.servers.filter(s => s.name !== name);
  if (config.defaultServer === name) {
    config.defaultServer = undefined;
  }
  await saveConfig(config);
}

export async function setDefaultServer(name: string): Promise<void> {
  const config = await loadConfig();
  config.defaultServer = name;
  await saveConfig(config);
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

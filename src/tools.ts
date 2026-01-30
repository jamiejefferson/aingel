import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve, relative, dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { glob } from 'glob';
import * as readline from 'readline';
import type { ToolDefinition } from './client.js';

const execAsync = promisify(exec);

export const toolDefinitions: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to project root' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file. Creates the file and parent directories if they don\'t exist. Overwrites existing files.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to project root' },
          content: { type: 'string', description: 'Content to write to the file' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files matching a glob pattern in the project directory',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern (e.g., "**/*.ts", "src/**/*")' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for text or regex pattern in files',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Search pattern (regex supported)' },
          glob_pattern: { type: 'string', description: 'Optional glob pattern to filter files (default: "**/*")' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a shell command in the project directory. Requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
        },
        required: ['command'],
      },
    },
  },
];

function isPathSafe(projectRoot: string, requestedPath: string): boolean {
  const absolutePath = resolve(projectRoot, requestedPath);
  const relativePath = relative(projectRoot, absolutePath);
  return !relativePath.startsWith('..') && !relativePath.startsWith('/');
}

async function confirmCommand(command: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`\n  Execute command: ${command}\n  Confirm? (y/n): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export interface ToolResult {
  success: boolean;
  result: string;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  projectRoot: string
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'read_file': {
        const path = args.path as string;
        if (!isPathSafe(projectRoot, path)) {
          return { success: false, result: 'Error: Path traversal not allowed' };
        }
        const fullPath = join(projectRoot, path);
        if (!existsSync(fullPath)) {
          return { success: false, result: `Error: File not found: ${path}` };
        }
        const content = await readFile(fullPath, 'utf-8');
        return { success: true, result: content };
      }

      case 'write_file': {
        const path = args.path as string;
        const content = args.content as string;
        if (!isPathSafe(projectRoot, path)) {
          return { success: false, result: 'Error: Path traversal not allowed' };
        }
        const fullPath = join(projectRoot, path);
        const dir = dirname(fullPath);

        // Create parent directories if needed
        if (!existsSync(dir)) {
          await mkdir(dir, { recursive: true });
        }

        const existed = existsSync(fullPath);
        await writeFile(fullPath, content, 'utf-8');
        return {
          success: true,
          result: existed ? `File updated: ${path}` : `File created: ${path}`,
        };
      }

      case 'list_files': {
        const pattern = args.pattern as string;
        const files = await glob(pattern, {
          cwd: projectRoot,
          nodir: true,
          ignore: ['**/node_modules/**', '**/.git/**'],
        });
        if (files.length === 0) {
          return { success: true, result: 'No files found matching pattern' };
        }
        return { success: true, result: files.join('\n') };
      }

      case 'search_files': {
        const pattern = args.pattern as string;
        const globPattern = (args.glob_pattern as string) || '**/*';
        const files = await glob(globPattern, {
          cwd: projectRoot,
          nodir: true,
          ignore: ['**/node_modules/**', '**/.git/**'],
        });

        const regex = new RegExp(pattern, 'gi');
        const results: string[] = [];

        for (const file of files) {
          try {
            const fullPath = join(projectRoot, file);
            const content = await readFile(fullPath, 'utf-8');
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                results.push(`${file}:${i + 1}: ${lines[i].trim()}`);
              }
              regex.lastIndex = 0; // Reset regex state
            }
          } catch {
            // Skip files that can't be read (e.g., binary files)
          }
        }

        if (results.length === 0) {
          return { success: true, result: 'No matches found' };
        }
        return { success: true, result: results.slice(0, 100).join('\n') };
      }

      case 'run_command': {
        const command = args.command as string;
        const confirmed = await confirmCommand(command);
        if (!confirmed) {
          return { success: false, result: 'Command cancelled by user' };
        }

        try {
          const { stdout, stderr } = await execAsync(command, {
            cwd: projectRoot,
            timeout: 60000,
            maxBuffer: 1024 * 1024,
          });
          const output = stdout + (stderr ? `\nStderr:\n${stderr}` : '');
          return { success: true, result: output || 'Command completed (no output)' };
        } catch (error) {
          const execError = error as { stdout?: string; stderr?: string; message: string };
          return {
            success: false,
            result: `Command failed: ${execError.message}\n${execError.stderr || ''}`,
          };
        }
      }

      default:
        return { success: false, result: `Unknown tool: ${name}` };
    }
  } catch (error) {
    const err = error as Error;
    return { success: false, result: `Tool execution error: ${err.message}` };
  }
}

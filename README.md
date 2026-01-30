# Aingel

A local LLM coding assistant that connects to LM Studio over your network. Think Claude Code, but running on your own hardware.

## Features

- Connects to LM Studio's OpenAI-compatible API
- Streaming responses with tool calling support
- File operations: read, write, list, search
- Shell command execution (with confirmation)
- Remembers recent project folders
- Works with any model loaded in LM Studio

## Requirements

- Node.js 18+
- [LM Studio](https://lmstudio.ai/) running with a model loaded and server enabled

## Installation

```bash
git clone https://github.com/YOUR_USERNAME/aingel.git
cd aingel
npm install
npm run build
npm link
```

## Usage

```bash
# Start interactive mode
aingel

# Open a specific folder
aingel /path/to/project

# Specify LM Studio location
aingel --host 192.168.1.50 --port 1234
```

On first run, you'll be prompted for your LM Studio server IP. This is saved to `~/.aingel.json`.

### Commands

| Command | Description |
|---------|-------------|
| `/quit` | Exit Aingel |
| `/clear` | Clear conversation history |
| `/model` | Show current model |
| `/history` | Show message count |
| `/help` | Show available commands |

### Environment Variables

- `LLM_HOST` - LM Studio host IP
- `LLM_PORT` - LM Studio port (default: 1234)

## Available Tools

The assistant can use these tools to help with your code:

- **read_file** - Read file contents
- **write_file** - Create or update files
- **list_files** - List files matching a glob pattern
- **search_files** - Search for text/regex in files
- **run_command** - Execute shell commands (requires confirmation)

## LM Studio Setup

1. Open LM Studio and load a model (e.g., Qwen Coder, DeepSeek Coder, etc.)
2. Go to the "Local Server" tab
3. Click "Start Server"
4. Note your computer's local IP address (e.g., `192.168.1.50`)
5. Make sure port 1234 is accessible on your network

## License

MIT

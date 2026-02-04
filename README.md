# Aingel

A local LLM coding assistant that connects to LM Studio over your network. Think Claude Code, but running on your own hardware.

## Features

- Connects to LM Studio's OpenAI-compatible API
- **Multi-server support** - configure and switch between multiple LLM servers
- **Model selection** - choose from available models at startup or mid-session
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
git clone https://github.com/jamiejefferson/aingel.git
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

# Connect to a specific server by name
aingel --server llama
aingel -s mistral

# Specify host/port directly
aingel --host 192.168.1.50 --port 1234
```

On first run, you'll be prompted to configure your first LLM server. This is saved to `~/.aingel.json`.

### Multi-Server Setup

Aingel supports multiple LLM servers. On startup, if you have multiple servers configured, you'll see a selection menu:

```
  Select an LLM server:
    1. llama - 192.168.1.50:1234 (default)
    2. mistral - 192.168.1.51:1234
    3. Add new server
```

You can also skip the menu by using the `--server` or `-s` flag with the server name.

### Model Selection

When a server has multiple models loaded, you'll be prompted to choose one. You can also switch models mid-session using the `/models` command.

### Commands

| Command | Description |
|---------|-------------|
| `/quit` | Exit Aingel |
| `/clear` | Clear conversation history |
| `/model` | Show current model |
| `/models` | List and switch models |
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
4. Note your computer's local IP address (the team server is `10.10.5.30`)
5. Make sure port 1234 is accessible on your network

## License

MIT

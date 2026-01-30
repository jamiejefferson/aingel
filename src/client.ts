export interface Model {
  id: string;
  object: string;
  owned_by: string;
}

export interface ModelsResponse {
  object: string;
  data: Model[];
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
}

export interface StreamDelta {
  role?: string;
  content?: string | null;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
}

export interface StreamChoice {
  index: number;
  delta: StreamDelta;
  finish_reason: string | null;
}

export interface StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: StreamChoice[];
}

export class LLMClient {
  private baseUrl: string;
  private model: string | null = null;

  constructor(host: string, port: number = 1234) {
    this.baseUrl = `http://${host}:${port}/v1`;
  }

  setModel(model: string): void {
    this.model = model;
  }

  getModel(): string | null {
    return this.model;
  }

  async listModels(): Promise<Model[]> {
    const response = await fetch(`${this.baseUrl}/models`);
    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as ModelsResponse;
    return data.data;
  }

  async *chatStream(
    messages: ChatMessage[],
    tools?: ToolDefinition[]
  ): AsyncGenerator<{ type: 'content'; content: string } | { type: 'tool_calls'; tool_calls: ToolCall[] }> {
    if (!this.model) {
      throw new Error('No model selected. Call setModel() first.');
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: true,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chat request failed: ${response.status} ${response.statusText}\n${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Accumulate tool calls across chunks
    const toolCallsMap = new Map<number, ToolCall>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6)) as StreamChunk;
          const choice = json.choices[0];
          if (!choice) continue;

          const delta = choice.delta;

          // Handle content
          if (delta.content) {
            yield { type: 'content', content: delta.content };
          }

          // Handle tool calls
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index;
              let existing = toolCallsMap.get(index);

              if (!existing) {
                existing = {
                  id: tc.id || '',
                  type: 'function',
                  function: {
                    name: tc.function?.name || '',
                    arguments: '',
                  },
                };
                toolCallsMap.set(index, existing);
              }

              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.function.name = tc.function.name;
              if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
            }
          }

          // Check if we're done
          if (choice.finish_reason === 'tool_calls') {
            const toolCalls = Array.from(toolCallsMap.values());
            if (toolCalls.length > 0) {
              yield { type: 'tool_calls', tool_calls: toolCalls };
            }
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    // Final check for accumulated tool calls (in case finish_reason wasn't "tool_calls")
    const toolCalls = Array.from(toolCallsMap.values());
    if (toolCalls.length > 0 && toolCalls.some(tc => tc.function.name)) {
      yield { type: 'tool_calls', tool_calls: toolCalls };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.listModels();
      return true;
    } catch {
      return false;
    }
  }
}

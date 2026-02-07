# AFFiNE Copilot System Overview

A guide to understanding the AI/Chat backend abstraction layer.

---

## What is This?

AFFiNE's **Copilot plugin** provides a plug-and-play backend abstraction for AI/chat APIs. The frontend stays the same — you just swap out the backend provider.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Stays Same)                         │
│       Uses GraphQL to call: createChatSession, chat, streamText         │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    BACKEND: Copilot Plugin                              │
│          packages/backend/server/src/plugins/copilot/                   │
├─────────────────────────────────────────────────────────────────────────┤
│  resolver.ts     → GraphQL API endpoints (createSession, chat, etc.)   │
│  session.ts      → Chat session management (history, messages)         │
│  providers/      → PLUG-AND-PLAY providers (the key part!)             │
│     ├── provider.ts   → Base abstract class all providers extend       │
│     ├── factory.ts    → Picks the right provider based on config       │
│     ├── openai.ts     → OpenAI implementation                          │
│     ├── anthropic/    → Claude implementation                          │
│     ├── gemini/       → Google Gemini implementation                   │
│     ├── perplexity.ts → Perplexity implementation                      │
│     └── fal.ts        → Fal (image generation) implementation          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Key Functionalities

| Feature               | What it does                                               |
| --------------------- | ---------------------------------------------------------- |
| **Chat Sessions**     | Create, fork, delete chat sessions with history            |
| **Text Generation**   | `text()` and `streamText()` - single response or streaming |
| **Image Generation**  | `streamImages()` - DALL-E, GPT-Image, Fal models           |
| **Embeddings**        | `embedding()` - for semantic search                        |
| **Structured Output** | `structure()` - JSON schema-based responses                |
| **Tool Calling**      | Built-in tools for doc search, web search, code artifacts  |
| **Multi-Provider**    | Swap between OpenAI, Anthropic, Gemini etc. via config     |

---

## Where to Make Changes

### Option 1: Create a Custom Provider (Recommended)

Add your own provider in `packages/backend/server/src/plugins/copilot/providers/`:

```typescript
// your-provider.ts
export class YourProvider extends CopilotProvider<YourConfig> {
  readonly type = CopilotProviderType.YourProvider;  // add to enum
  readonly models = [...];  // define your models

  configured(): boolean { return !!this.config.apiKey; }

  async text(model, messages, options): Promise<string> {
    // Call YOUR backend API here
  }

  async *streamText(model, messages, options): AsyncIterable<string> {
    // Call YOUR streaming API here
  }
}
```

### Option 2: Modify Config for OpenAI-Compatible API

If your API follows OpenAI format, update `config.ts`:

```typescript
'providers.openai': {
  default: {
    apiKey: 'your-key',
    baseURL: 'https://your-backend.com/v1',  // Your API URL
    oldApiStyle: true,  // if not using responses API
  },
}
```

---

## Key Files Reference

| File                    | Purpose                               |
| ----------------------- | ------------------------------------- |
| `providers/provider.ts` | Base class - understand the interface |
| `providers/openai.ts`   | Example implementation to copy from   |
| `providers/types.ts`    | Add your provider type to the enum    |
| `config.ts`             | Add config for your provider          |
| `providers/index.ts`    | Export your new provider              |

---

## Provider Interface (Methods to Implement)

```typescript
abstract class CopilotProvider {
  // Required
  abstract text(model, messages, options): Promise<string>;
  abstract streamText(model, messages, options): AsyncIterable<string>;
  abstract configured(): boolean;

  // Optional (have default implementations that throw)
  streamObject(...): AsyncIterable<StreamObject>;
  structure(...): Promise<string>;
  streamImages(...): AsyncIterable<string>;
  embedding(...): Promise<number[][]>;
  rerank(...): Promise<number[]>;
}
```

---

## Configuration

Enable copilot and configure providers in your environment:

```typescript
// packages/backend/server/src/plugins/copilot/config.ts

copilot: {
  enabled: true,
  providers: {
    openai: { apiKey: 'sk-...', baseURL: 'https://api.openai.com/v1' },
    anthropic: { apiKey: 'sk-ant-...' },
    gemini: { apiKey: '...' },
    // Add your provider config here
  }
}
```

---

## Quick Summary

- **Frontend stays same** — uses GraphQL endpoints
- **Backend uses provider pattern** — easy to swap AI backends
- **To add your API**: Create provider class extending `CopilotProvider`
- **Config-driven** — enable/disable providers via environment

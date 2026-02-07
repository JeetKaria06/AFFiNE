import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { IREProvider } from './ire';
import {
  CopilotChatOptions,
  CopilotProviderType,
  PromptMessage,
} from './types';

// Mock global fetch
global.fetch = jest.fn();

describe('IREProvider', () => {
  let provider: IREProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IREProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation(key => {
              if (key === 'copilot.providers.ire.baseUrl')
                return 'http://localhost:8000';
              return null;
            }),
          },
        },
      ],
    }).compile();

    provider = module.get<IREProvider>(IREProvider);
    // Manually inject config since we are accessing it directly in the class via generic CopilotProvider
    // @ts-ignore
    provider.config = { baseUrl: 'http://localhost:8000' };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  it('should successfully generate text from IRE', async () => {
    const sessionId = 'test-session-123';
    const userMessage = 'Hello IRE';
    const expectedResponse = 'Hello from IRE!';
    const chatId = 'ire-chat-456';

    // Mock Chat Creation Response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, chat_id: chatId }),
    });

    // Mock Generation Response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ answer: expectedResponse }),
    });

    const messages: PromptMessage[] = [
      { role: 'user', content: userMessage, id: '1' },
    ];
    const options: CopilotChatOptions = {
      session: sessionId,
      user: 'test-user',
    };

    const result = await provider.text(
      { modelId: 'ire-default' },
      messages,
      options
    );

    expect(result).toBe(expectedResponse);

    // Verify Chat Creation Call
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8000/chat',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          query: userMessage,
          client_reference_id: sessionId,
          type: 'literature_review',
        }),
      })
    );

    // Verify Generation Call
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8000/conversations/generate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          chat_id: chatId,
          query: userMessage,
        }),
      })
    );
  });

  it('should throw error if session ID is missing', async () => {
    await expect(
      provider.text({ modelId: 'ire-default' }, [], {} as any)
    ).rejects.toThrow('Session ID is required');
  });
});

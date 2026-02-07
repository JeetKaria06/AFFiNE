import { Injectable } from '@nestjs/common';

import { CopilotProvider } from './provider';
import { PromptMessage } from './types';
import {
  CopilotChatOptions,
  CopilotProviderModel,
  CopilotProviderType,
  ModelConditions,
  ModelFullConditions,
  ModelInputType,
  ModelOutputType,
  StreamObject,
} from './types';

export interface IREConfig {
  apiKey?: string;
  baseUrl: string;
  serviceToken?: string;
}

@Injectable()
export class IREProvider extends CopilotProvider<IREConfig> {
  constructor() {
    super();
    console.log('IREProvider: Instance created');
  }

  readonly type = CopilotProviderType.IRE;

  override setup() {
    console.log(
      'IREProvider: setup called, config:',
      JSON.stringify(this.config)
    );
    super.setup();
  }

  // Define the model capabilities for IRE
  readonly models: CopilotProviderModel[] = [
    {
      id: 'ire-default',
      name: 'IRE Model',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Text, ModelOutputType.Object],
          defaultForOutputType: true,
        },
      ],
    },
  ];

  configured(): boolean {
    // IRE is configured if we have a base URL
    // We can add more checks here if needed (e.g. API key)
    return !!this.config.baseUrl;
  }

  override async match(cond: ModelFullConditions = {}): Promise<boolean> {
    this.logger.log(
      `IREProvider.match called with cond: ${JSON.stringify(cond)}`
    );
    const isMatched = await super.match(cond);
    this.logger.log(`IREProvider.match returning: ${isMatched}`);
    return isMatched;
  }

  async text(
    _model: ModelConditions,
    messages: PromptMessage[],
    options?: CopilotChatOptions
  ): Promise<string> {
    this.logger.debug(
      `IREProvider.text called with modelId: ${_model.modelId}, session: ${options?.session}`
    );
    const baseUrl = this.config.baseUrl.replace(/\/$/, '');
    const sessionId = options?.session;

    if (!sessionId) {
      throw new Error('Session ID is required for IRE integration');
    }

    // Get the last user message
    const lastMessage = messages.findLast(m => m.role === 'user');
    if (!lastMessage || !lastMessage.content) {
      return '';
    }

    try {
      // Step 1: Create or Get Chat (Idempotent via client_reference_id)
      // We use the AFFiNE session ID as the client_reference_id
      this.logger.debug(`IREProvider: Creating chat for session ${sessionId}`);

      // Get user email from options (passed from CopilotController)
      const userEmail = options?.userEmail;
      const serviceToken =
        this.config.serviceToken || process.env.IRE_SERVICE_TOKEN;

      if (!serviceToken) {
        this.logger.error('IREProvider: IRE_SERVICE_TOKEN is not configured!');
        throw new Error('IRE Service Token not configured');
      }

      if (!userEmail) {
        this.logger.error('IREProvider: User email not available in options!');
        throw new Error('User identity not available');
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
        'X-Service-Token': serviceToken,
        'X-AFFiNE-User-Email': userEmail,
      };

      this.logger.debug(
        `IREProvider: Using Service-to-Service auth for user: ${userEmail}`
      );

      const createChatResponse = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: lastMessage.content,
          client_reference_id: sessionId,
          type: 'literature_review',
        }),
      });

      if (!createChatResponse.ok) {
        const error = await createChatResponse.text();
        this.logger.error(
          `IRE Create Chat Error (${createChatResponse.status}): ${error}`
        );
        throw new Error(
          `IRE Create Chat Error: ${createChatResponse.status} ${createChatResponse.statusText}`
        );
      }

      const chatData = (await createChatResponse.json()) as { chat_id: string };
      const chatId = chatData.chat_id;
      this.logger.debug(`IREProvider: Got chat_id ${chatId}`);

      // Step 2: Generate Response
      this.logger.debug(
        `IREProvider: Generating response for chat_id ${chatId}`
      );
      const generateResponse = await fetch(
        `${baseUrl}/conversations/generate`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            chat_id: chatId,
            query: lastMessage.content,
          }),
        }
      );

      if (!generateResponse.ok) {
        const error = await generateResponse.text();
        this.logger.error(
          `IRE Generate Error (${generateResponse.status}): ${error}`
        );
        throw new Error(
          `IRE Generate Error: ${generateResponse.status} ${generateResponse.statusText}`
        );
      }

      const conversationData = (await generateResponse.json()) as {
        answer: string;
      };
      this.logger.debug(`IREProvider: Successfully generated response`);

      // Return the answer from IRE
      return conversationData.answer;
    } catch (error) {
      this.logger.error('Error in IRE provider text generation', error);
      throw error;
    }
  }

  // IRE currently doesn't support streaming in this integration
  // We implement it by just calling text() and yielding the result
  async *streamText(
    model: ModelConditions,
    messages: PromptMessage[],
    options?: CopilotChatOptions
  ): AsyncIterable<string> {
    this.logger.debug('IREProvider.streamText called');
    const text = await this.text(model, messages, options);
    yield text;
  }

  override async *streamObject(
    model: ModelConditions,
    messages: PromptMessage[],
    options?: CopilotChatOptions
  ): AsyncIterable<StreamObject> {
    this.logger.debug('IREProvider.streamObject called');
    const text = await this.text(model, messages, options);
    yield {
      type: 'text-delta',
      textDelta: text,
    };
  }
}

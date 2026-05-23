import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  CreateConversationDto,
  SendMessageDto,
  UpdateConversationDto,
  GenerateImageDto,
  GenerateImageFromChatDto,
} from './dto';
import { Conversation, Message } from './entities';
import { Observable } from 'rxjs';

@Injectable()
export class AiChatService {
  private conversations: Map<string, Conversation> = new Map();

  private readonly apiKey: string;
  private readonly apiBaseUrl: string;
  private readonly defaultModel: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    this.apiBaseUrl = this.configService.get<string>(
      'OPENAI_API_BASE_URL',
      'https://api.deepseek.com',
    );
    this.defaultModel = this.configService.get<string>(
      'OPENAI_MODEL',
      'qwen/qwen3.5-35b-a3b',
    );
  }

  createConversation(dto: CreateConversationDto): Conversation {
    const conversation: Conversation = {
      id: randomUUID(),
      title: dto.title,
      model: dto.model || this.defaultModel,
      systemPrompt: dto.systemPrompt,
      messages: dto.systemPrompt
        ? [
            {
              id: randomUUID(),
              role: 'system',
              content: dto.systemPrompt,
              createdAt: new Date(),
            },
          ]
        : [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  getAllConversations(): Conversation[] {
    return Array.from(this.conversations.values())
      .map((conv) => ({ ...conv, messages: undefined }))
      .sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
      ) as Conversation[];
  }

  getConversationById(id: string): Conversation {
    const conversation = this.conversations.get(id);
    if (!conversation) throw new NotFoundException(`对话 ${id} 不存在`);
    return conversation;
  }

  updateConversation(id: string, dto: UpdateConversationDto): Conversation {
    const conversation = this.getConversationById(id);
    if (dto.title !== undefined) conversation.title = dto.title;
    if (dto.systemPrompt !== undefined) conversation.systemPrompt = dto.systemPrompt;
    conversation.updatedAt = new Date();
    this.conversations.set(id, conversation);
    return conversation;
  }

  deleteConversation(id: string): { success: boolean } {
    const exists = this.conversations.has(id);
    if (!exists) throw new NotFoundException(`对话 ${id} 不存在`);
    this.conversations.delete(id);
    return { success: true };
  }

  /**
   * 获取默认系统提示词（含当前日期时间）
   */
  private getDefaultSystemPrompt(): string {
    const now = new Date();
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
    const weekDay = `星期${weekDays[now.getDay()]}`;
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    return `你是雨木科技的AI助手。当前日期时间：${dateStr} ${weekDay} ${timeStr}。请根据当前时间准确回答用户关于日期、时间、星期的问题。`;
  }

  /**
   * 构建发送给AI的消息格式（支持多模态图片）
   */
  private buildApiMessages(conversation: Conversation, dto?: SendMessageDto) {
    // 检查对话中是否已有系统提示词
    const hasSystemPrompt = conversation.messages.some((m) => m.role === 'system');

    const messages: { role: string; content: string | object[] }[] = [];

    // 如果没有系统提示词，注入默认的（含当前日期）
    if (!hasSystemPrompt) {
      messages.push({ role: 'system', content: this.getDefaultSystemPrompt() });
    }

    for (const m of conversation.messages) {
      messages.push({ role: m.role, content: m.content });
    }

    // 如果有图片，将最后一条用户消息替换为多模态格式
    if (dto?.images && dto.images.length > 0) {
      const lastUserIdx = messages.map((m, i) => m.role === 'user' ? i : -1).filter(i => i !== -1).pop();
      if (lastUserIdx !== undefined) {
        const textContent: { type: string; text?: string; image_url?: { url: string } }[] = [
          { type: 'text', text: messages[lastUserIdx].content as string },
        ];
        for (const img of dto.images) {
          textContent.push({ type: 'image_url', image_url: img.image_url });
        }
        messages[lastUserIdx].content = textContent;
      }
    }

    return messages;
  }

  async sendMessage(dto: SendMessageDto): Promise<Conversation> {
    let conversation: Conversation;

    if (dto.conversationId) {
      conversation = this.getConversationById(dto.conversationId);
    } else {
      conversation = this.createConversation({
        title: dto.content.substring(0, 20) + (dto.content.length > 20 ? '...' : ''),
        model: dto.model || this.defaultModel,
      });
    }

    const userMessage: Message = {
      id: randomUUID(),
      role: 'user',
      content: dto.content,
      createdAt: new Date(),
    };
    conversation.messages.push(userMessage);

    const assistantMessage: Message = await this.callAiModel(conversation, dto.model || conversation.model, dto);
    conversation.messages.push(assistantMessage);

    conversation.updatedAt = new Date();
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  sendMessageStream(dto: SendMessageDto): { conversation: Conversation; stream$: Observable<string> } {
    let conversation: Conversation;

    if (dto.conversationId) {
      conversation = this.getConversationById(dto.conversationId);
    } else {
      conversation = this.createConversation({
        title: dto.content.substring(0, 20) + (dto.content.length > 20 ? '...' : ''),
        model: dto.model || this.defaultModel,
      });
    }

    const userMessage: Message = {
      id: randomUUID(),
      role: 'user',
      content: dto.content,
      createdAt: new Date(),
    };
    conversation.messages.push(userMessage);

    const { stream$, fullContent } = this.callAiModelStream(conversation, dto.model || conversation.model, dto);

    const convId = conversation.id;
    stream$.subscribe({
      complete: () => {
        const conv = this.conversations.get(convId);
        if (conv) {
          conv.messages.push({
            id: randomUUID(),
            role: 'assistant',
            content: fullContent(),
            createdAt: new Date(),
          });
          conv.updatedAt = new Date();
          this.conversations.set(convId, conv);
        }
      },
    });

    return { conversation, stream$ };
  }

  /**
   * 非流式调用AI模型
   */
  private async callAiModel(conversation: Conversation, model: string, dto?: SendMessageDto): Promise<Message> {
    const messages = this.buildApiMessages(conversation, dto);

    try {
      const response = await fetch(`${this.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model, messages, max_tokens: 4096, temperature: 0.7 }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI API Error:', response.status, errorText);
        throw new Error(`AI API调用失败: ${response.status}`);
      }

      const data = await response.json();
      const replyContent = data.choices?.[0]?.message?.content || '抱歉，AI暂无回复。';
      return { id: randomUUID(), role: 'assistant', content: replyContent, createdAt: new Date() };
    } catch (error) {
      console.error('调用AI模型异常:', error.message);
      return {
        id: randomUUID(),
        role: 'assistant',
        content: `AI服务暂时不可用，请稍后重试。错误信息：${error.message}`,
        createdAt: new Date(),
      };
    }
  }

  /**
   * 流式调用AI模型
   */
  private callAiModelStream(conversation: Conversation, model: string, dto?: SendMessageDto): { stream$: Observable<string>; fullContent: () => string } {
    const messages = this.buildApiMessages(conversation, dto);
    let fullText = '';

    const stream$ = new Observable<string>((subscriber) => {
      const doStream = async () => {
        try {
          const response = await fetch(`${this.apiBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages,
              max_tokens: 4096,
              temperature: 0.7,
              stream: true,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            subscriber.next(`[Error] AI API调用失败: ${response.status} - ${errorText}`);
            subscriber.complete();
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter((line) => line.trim() !== '');

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed === 'data: [DONE]') continue;
              if (!trimmed.startsWith('data: ')) continue;

              try {
                const json = JSON.parse(trimmed.slice(6));
                const delta = json.choices?.[0]?.delta?.content;
                if (delta) {
                  fullText += delta;
                  subscriber.next(delta);
                }
              } catch {
                // 忽略解析错误
              }
            }
          }

          subscriber.complete();
        } catch (error) {
          console.error('流式调用异常:', error.message);
          subscriber.next(`[Error] ${error.message}`);
          subscriber.complete();
        }
      };

      doStream();
    });

    return { stream$, fullContent: () => fullText };
  }

  /**
   * 从用户输入生成专业图片描述提示词
   */
  async generateImagePrompt(content: string): Promise<string> {
    const systemPrompt = `你是一个专业的电商图片描述专家。用户会给你一个商品名称和图片类型描述，你需要将其转化为详细的、专业的AI图片生成提示词（英文）。
规则：
1. 输出纯英文提示词，不需要任何解释
2. 包含商品特征、风格、背景、光线、构图等专业描述
3. 适合电商场景，突出产品质感和高级感
4. 适当加入摄影术语（如studio lighting, 8k, ultra detailed等）
5. 只输出提示词本身，不要输出其他内容`;

    try {
      const response = await fetch(`${this.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.defaultModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content },
          ],
          max_tokens: 500,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI API调用失败: ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || content;
    } catch (error) {
      console.error('生成图片提示词失败:', error.message);
      return content;
    }
  }

  /**
   * 生成图片（调用OpenAI兼容图片生成接口）
   */
  async generateImages(dto: GenerateImageDto): Promise<{ images: string[]; prompt: string }> {
    // 先生成专业提示词
    const enhancedPrompt = await this.generateImagePrompt(dto.prompt);

    const n = dto.n || 2;
    const size = dto.width && dto.height ? `${dto.width}x${dto.height}` : '1024x1024';

    try {
      // 尝试调用图片生成API (OpenAI兼容格式)
      const imageApiUrl = this.configService.get<string>(
        'IMAGE_API_URL',
        `${this.apiBaseUrl}/images/generations`,
      );

      const response = await fetch(imageApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.configService.get<string>('IMAGE_MODEL', 'dall-e-3'),
          prompt: enhancedPrompt,
          n: n,
          size: size,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Image API Error:', response.status, errorText);
        throw new Error(`图片生成API调用失败: ${response.status}`);
      }

      const data = await response.json();
      const images: string[] = [];

      if (data.data && Array.isArray(data.data)) {
        for (const item of data.data) {
          if (item.url) {
            images.push(item.url);
          } else if (item.b64_json) {
            images.push(`data:image/png;base64,${item.b64_json}`);
          }
        }
      }

      return { images, prompt: enhancedPrompt };
    } catch (error) {
      console.error('图片生成异常:', error.message);
      throw error;
    }
  }

  /**
   * 从聊天消息生成图片（一站式：分析输入 → 生成提示词 → 生成图片）
   */
  async generateImagesFromChat(dto: GenerateImageFromChatDto): Promise<{ images: string[]; prompt: string; description: string }> {
    // 第一步：让AI分析用户输入，生成图片描述
    const analyzePrompt = `分析以下用户输入，提取商品信息和图片类型，生成一个简洁的中文图片描述（一句话），以及对应的英文AI绘图提示词。

用户输入：${dto.content}

请严格按照以下JSON格式输出，不要输出其他内容：
{"description": "中文图片描述", "prompt": "英文AI绘图提示词"}`;

    let description = dto.content;
    let imagePrompt = dto.content;

    try {
      const response = await fetch(`${this.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.defaultModel,
          messages: [{ role: 'user', content: analyzePrompt }],
          max_tokens: 500,
          temperature: 0.5,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';
        // 尝试解析JSON
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            description = parsed.description || dto.content;
            imagePrompt = parsed.prompt || dto.content;
          } catch {
            // 解析失败使用原始文本
          }
        }
      }
    } catch (error) {
      console.error('分析用户输入失败:', error.message);
    }

    // 第二步：生成图片
    const result = await this.generateImages({
      prompt: imagePrompt,
      n: dto.n || 2,
      width: 1024,
      height: 1024,
    });

    return {
      images: result.images,
      prompt: result.prompt,
      description,
    };
  }
}

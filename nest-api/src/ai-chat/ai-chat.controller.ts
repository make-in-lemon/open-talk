import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { AiChatService } from './ai-chat.service';
import {
  CreateConversationDto,
  SendMessageDto,
  UpdateConversationDto,
  GenerateImageDto,
  GenerateImageFromChatDto,
} from './dto';
import { Conversation } from './entities';

@ApiTags('AI对话')
@ApiBearerAuth()
@Controller('ai-chat')
export class AiChatController {
  constructor(private readonly aiChatService: AiChatService) {}

  @Post('conversations')
  @ApiOperation({ summary: '创建新对话' })
  createConversation(@Body() dto: CreateConversationDto): Conversation {
    return this.aiChatService.createConversation(dto);
  }

  @Get('conversations')
  @ApiOperation({ summary: '获取对话列表' })
  getAllConversations(): Conversation[] {
    return this.aiChatService.getAllConversations();
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: '获取对话详情（含消息）' })
  getConversationById(@Param('id') id: string): Conversation {
    return this.aiChatService.getConversationById(id);
  }

  @Put('conversations/:id')
  @ApiOperation({ summary: '更新对话信息' })
  updateConversation(
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ): Conversation {
    return this.aiChatService.updateConversation(id, dto);
  }

  @Delete('conversations/:id')
  @ApiOperation({ summary: '删除对话' })
  deleteConversation(@Param('id') id: string): { success: boolean } {
    return this.aiChatService.deleteConversation(id);
  }

  @Post('messages')
  @ApiOperation({ summary: '发送消息（非流式）' })
  sendMessage(@Body() dto: SendMessageDto): Promise<Conversation> {
    return this.aiChatService.sendMessage(dto);
  }

  @Post('messages/stream')
  @ApiOperation({ summary: '发送消息（SSE流式输出）' })
  sendMessageStream(
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ): void {
    const { conversation, stream$ } = this.aiChatService.sendMessageStream(dto);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    res.write(`data: ${JSON.stringify({ type: 'conversation', conversationId: conversation.id })}\n\n`);

    const subscription = stream$.subscribe({
      next: (delta) => {
        res.write(`data: ${JSON.stringify({ type: 'delta', content: delta })}\n\n`);
      },
      error: (err) => {
        res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`);
        res.end();
      },
      complete: () => {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
      },
    });

    res.on('close', () => {
      subscription.unsubscribe();
    });
  }

  @Post('images/generate')
  @ApiOperation({ summary: 'AI图片生成（从聊天输入）' })
  async generateImagesFromChat(
    @Body() dto: GenerateImageFromChatDto,
    @Res() res: Response,
  ): Promise<void> {
    // 使用SSE返回进度信息
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      // 步骤1：分析用户输入
      res.write(`data: ${JSON.stringify({ type: 'progress', step: 1, total: 3, message: '正在分析图片需求...' })}\n\n`);

      const analyzePrompt = `分析以下用户输入，提取商品信息和图片类型，生成一个简洁的中文图片描述（一句话），以及对应的英文AI绘图提示词。

用户输入：${dto.content}

请严格按照以下JSON格式输出，不要输出其他内容：
{"description": "中文图片描述", "prompt": "英文AI绘图提示词"}`;

      let description = dto.content;
      let imagePrompt = dto.content;

      try {
        const response = await fetch(`${this.aiChatService['apiBaseUrl']}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.aiChatService['apiKey']}`,
          },
          body: JSON.stringify({
            model: this.aiChatService['defaultModel'],
            messages: [{ role: 'user', content: analyzePrompt }],
            max_tokens: 500,
            temperature: 0.5,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const text = data.choices?.[0]?.message?.content || '';
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0]);
              description = parsed.description || dto.content;
              imagePrompt = parsed.prompt || dto.content;
            } catch {}
          }
        }
      } catch {}

      // 发送图片描述
      res.write(`data: ${JSON.stringify({ type: 'description', description, prompt: imagePrompt })}\n\n`);

      // 步骤2：增强提示词
      res.write(`data: ${JSON.stringify({ type: 'progress', step: 2, total: 3, message: '正在优化图片描述...' })}\n\n`);

      const enhancedPrompt = await this.aiChatService.generateImagePrompt(imagePrompt);

      // 步骤3：生成图片
      res.write(`data: ${JSON.stringify({ type: 'progress', step: 3, total: 3, message: '正在生成图片...' })}\n\n`);

      const result = await this.aiChatService.generateImages({
        prompt: enhancedPrompt,
        n: dto.n || 2,
        width: 1024,
        height: 1024,
      });

      // 返回结果
      res.write(`data: ${JSON.stringify({ type: 'complete', images: result.images, description, prompt: result.prompt })}\n\n`);
      res.end();
    } catch (error) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      res.end();
    }
  }

  @Post('images/direct')
  @ApiOperation({ summary: 'AI图片生成（直接提供提示词）' })
  async generateImagesDirect(
    @Body() dto: GenerateImageDto,
  ): Promise<{ images: string[]; prompt: string }> {
    return this.aiChatService.generateImages(dto);
  }
}

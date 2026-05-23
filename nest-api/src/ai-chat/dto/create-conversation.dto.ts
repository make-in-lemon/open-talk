import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';

export class CreateConversationDto {
  @ApiProperty({ description: '对话标题', example: 'AI对话' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiPropertyOptional({ description: 'AI模型', example: 'deepseek-v4-flash', default: 'deepseek-v4-flash' })
  @IsString()
  @IsOptional()
  model?: string;

  @ApiPropertyOptional({ description: '系统提示词', example: '你是一个有帮助的AI助手' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  systemPrompt?: string;
}

export class SendMessageDto {
  @ApiProperty({ description: '消息内容', example: '你好，请介绍一下你自己' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content: string;

  @ApiPropertyOptional({ description: '对话ID（新对话可不传）' })
  @IsString()
  @IsOptional()
  conversationId?: string;

  @ApiPropertyOptional({ description: 'AI模型', example: 'deepseek-v4-flash' })
  @IsString()
  @IsOptional()
  model?: string;

  @ApiPropertyOptional({ description: '是否流式输出', default: false })
  @IsOptional()
  stream?: boolean;

  @ApiPropertyOptional({ description: '上传的图片列表', type: [Object] })
  @IsArray()
  @IsOptional()
  images?: { type: string; image_url: { url: string } }[];
}

export class SendMessageStreamDto extends SendMessageDto {
  @ApiProperty({ description: '是否流式输出', default: true })
  stream: boolean = true;
}

export class DeleteConversationDto {
  @ApiProperty({ description: '对话ID' })
  @IsString()
  @IsNotEmpty()
  conversationId: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, IsNotEmpty } from 'class-validator';

export class UpdateConversationDto {
  @ApiPropertyOptional({ description: '对话标题', example: '新的对话标题' })
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ description: '系统提示词' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  systemPrompt?: string;
}

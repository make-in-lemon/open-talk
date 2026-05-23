import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsArray, IsNotEmpty, MaxLength, Min, Max } from 'class-validator';

export class GenerateImageDto {
  @ApiProperty({ description: '图片描述/关键词', example: '保温杯 极简风 白色背景 电商主图' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  prompt: string;

  @ApiPropertyOptional({ description: '生成图片数量(1-4)', default: 2 })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(4)
  n?: number;

  @ApiPropertyOptional({ description: '图片宽度', default: 1024 })
  @IsNumber()
  @IsOptional()
  width?: number;

  @ApiPropertyOptional({ description: '图片高度', default: 1024 })
  @IsNumber()
  @IsOptional()
  height?: number;
}

export class GenerateImageFromChatDto {
  @ApiProperty({ description: '用户原始输入', example: '保温杯 电商主图' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  content: string;

  @ApiPropertyOptional({ description: '生成图片数量(1-4)', default: 2 })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(4)
  n?: number;
}

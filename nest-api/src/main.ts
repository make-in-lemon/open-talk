import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('APP_PORT', 3000);

  // 全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // 跨域配置
  app.enableCors();

  // API前缀
  app.setGlobalPrefix('api');

  // 静态文件服务 - 提供前端页面
  app.useStaticAssets(join(__dirname, '..', 'public'));

  // Swagger文档
  const swaggerConfig = new DocumentBuilder()
    .setTitle('AI对话接口')
    .setDescription('AI Chat API 文档')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}/api`);
  console.log(`Chat UI: http://localhost:${port}`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();

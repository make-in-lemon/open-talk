import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const PERMISSIONS_KEY = 'permissions';

/**
 * 权限守卫
 * 基于请求头中的 Authorization 进行权限验证
 * 实际项目中应替换为真实的鉴权逻辑（如JWT验证）
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    // 检查是否有Authorization头
    if (!authHeader) {
      throw new UnauthorizedException('未提供认证信息');
    }

    // TODO: 实际项目中替换为JWT验证逻辑
    // const token = authHeader.replace('Bearer ', '');
    // const decoded = this.jwtService.verify(token);
    // request.user = decoded;

    return true;
  }
}

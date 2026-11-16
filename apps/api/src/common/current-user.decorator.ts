import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { AuthUser } from './access.service'

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<{ user: AuthUser }>().user
})

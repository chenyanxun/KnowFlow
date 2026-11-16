import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { EmployeeUser } from './client.guard'

export const CurrentEmployee = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<{ employee: EmployeeUser }>().employee
})

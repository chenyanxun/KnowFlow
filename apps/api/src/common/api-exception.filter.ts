import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<{ status: (code: number) => { json: (body: unknown) => void } }>()
    if ((exception as { code?: string })?.code === 'LIMIT_FILE_SIZE') {
      response.status(HttpStatus.BAD_REQUEST).json({ message: '文件不能超过 20MB' })
      return
    }
    if (exception instanceof Error && exception.message === '不支持这个文件类型') {
      response.status(HttpStatus.BAD_REQUEST).json({ message: exception.message })
      return
    }
    if (exception instanceof HttpException) {
      const body = exception.getResponse()
      const message = typeof body === 'string' ? body : (body as { message?: string | string[] }).message
      const text = Array.isArray(message) ? message[0] : message
      response.status(exception.getStatus()).json({ message: text ?? '请求失败' })
      return
    }
    console.error(exception)
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: '服务器错误' })
  }
}

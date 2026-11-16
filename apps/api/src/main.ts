import './env'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ApiExceptionFilter } from './common/api-exception.filter'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.setGlobalPrefix('api')
  app.enableCors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174'] })
  app.useGlobalFilters(new ApiExceptionFilter())
  await app.listen(Number(process.env.PORT ?? 3000))
}

void bootstrap()

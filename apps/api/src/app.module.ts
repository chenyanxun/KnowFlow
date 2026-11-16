import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AuthController } from './auth/auth.controller'
import { AnswerService } from './client/answer.service'
import { ClientController } from './client/client.controller'
import { ClientGuard } from './client/client.guard'
import { AccessService } from './common/access.service'
import { ApiExceptionFilter } from './common/api-exception.filter'
import { AuthGuard } from './common/auth.guard'
import { DashboardController } from './dashboard/dashboard.controller'
import { DbService } from './db/db.service'
import { DocumentsController } from './documents/documents.controller'
import { EmployeesController } from './employees/employees.controller'
import { EmbeddingService } from './documents/embedding.service'
import { IndexingService } from './documents/indexing.service'
import { VectorStoreService } from './documents/vector-store.service'
import { MenusController } from './menus/menus.controller'
import { RolesController } from './roles/roles.controller'
import { UsersController } from './users/users.controller'

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'knowflow-dev-secret',
      signOptions: { expiresIn: 60 * 60 * 12 },
    }),
  ],
  controllers: [AuthController, UsersController, RolesController, MenusController, DocumentsController, DashboardController, EmployeesController, ClientController],
  providers: [DbService, AccessService, AuthGuard, ClientGuard, ApiExceptionFilter, EmbeddingService, VectorStoreService, IndexingService, AnswerService],
})
export class AppModule {}

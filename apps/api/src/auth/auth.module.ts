import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionEntity } from '../database/entities/session.entity';
import { UserEntity } from '../database/entities/user.entity';
import { TypeOrmUsersRepository } from '../users/typeorm-users.repository';
import { UsersRepository } from '../users/users.repository';
import { AuthController } from './auth.controller';
import { GoogleAuthLibraryVerifier } from './google-auth-library.verifier';
import { GoogleVerifier } from './google-verifier';
import { OriginGuard } from './origin.guard';
import { SessionRepository } from './session.repository';
import { SessionGuard } from './session.guard';
import { AuthService } from './auth.service';
import { TypeOrmSessionRepository } from './typeorm-session.repository';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, SessionEntity])],
  controllers: [AuthController],
  providers: [
    AuthService,
    OriginGuard,
    SessionGuard,
    { provide: GoogleVerifier, useClass: GoogleAuthLibraryVerifier },
    { provide: UsersRepository, useClass: TypeOrmUsersRepository },
    { provide: SessionRepository, useClass: TypeOrmSessionRepository },
  ],
  exports: [AuthService, SessionGuard, OriginGuard],
})
export class AuthModule {}

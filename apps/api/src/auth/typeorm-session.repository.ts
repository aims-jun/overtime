import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { SessionEntity } from '../database/entities/session.entity';
import type { UserEntity } from '../database/entities/user.entity';
import { SessionRepository } from './session.repository';
import type { CreateSessionInput } from './session.repository';

@Injectable()
export class TypeOrmSessionRepository extends SessionRepository {
  constructor(
    @InjectRepository(SessionEntity)
    private readonly repository: Repository<SessionEntity>,
  ) {
    super();
  }

  async create(input: CreateSessionInput): Promise<void> {
    await this.repository.save(this.repository.create(input));
  }

  async findActiveUserByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<UserEntity | null> {
    const session = await this.repository.findOne({
      where: { tokenHash, expiresAt: MoreThan(now) },
      relations: { user: true },
    });
    return session?.user ?? null;
  }

  async revokeByTokenHash(tokenHash: string): Promise<void> {
    await this.repository.delete({ tokenHash });
  }
}

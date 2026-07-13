import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { UserEntity } from '../database/entities/user.entity';
import { UsersRepository } from './users.repository';
import type { UpsertGoogleUserInput } from './users.repository';

@Injectable()
export class TypeOrmUsersRepository extends UsersRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: Repository<UserEntity>,
  ) {
    super();
  }

  async upsertGoogleUser(input: UpsertGoogleUserInput): Promise<UserEntity> {
    const existing = await this.repository.findOne({
      where: { googleSubject: input.googleSubject },
    });
    const user =
      existing ??
      this.repository.create({
        id: randomUUID(),
        googleSubject: input.googleSubject,
        createdAt: input.lastLoginAt,
      });

    user.email = input.email;
    user.name = input.name;
    user.profileImageUrl = input.profileImageUrl;
    user.lastLoginAt = input.lastLoginAt;
    return this.repository.save(user);
  }
}

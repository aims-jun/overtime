import type { UserEntity } from '../database/entities/user.entity';

export type CreateSessionInput = {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
};

export abstract class SessionRepository {
  abstract create(input: CreateSessionInput): Promise<void>;
  abstract findActiveUserByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<UserEntity | null>;
  abstract revokeByTokenHash(tokenHash: string): Promise<void>;
}

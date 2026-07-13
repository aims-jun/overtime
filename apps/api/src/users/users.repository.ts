import type { UserEntity } from '../database/entities/user.entity';

export type UpsertGoogleUserInput = {
  googleSubject: string;
  email: string;
  name: string;
  profileImageUrl: string | null;
  lastLoginAt: Date;
};

export abstract class UsersRepository {
  abstract upsertGoogleUser(input: UpsertGoogleUserInput): Promise<UserEntity>;
}

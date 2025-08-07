import { User } from './';

export enum UserRoleEnum {
  USER = 'user',
  ADMIN = 'admin',
}

/**
 * Interface for Current User
 */
export interface CurrentUser {
  userName: User['username'];
  fid: User['fid'];
  role: UserRoleEnum;
  token: string;
}

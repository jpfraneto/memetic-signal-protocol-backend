import { User } from './';

export enum UserRoleEnum {
  USER = 'user',
  ADMIN = 'admin',
}

export enum UserStateOnTheSystemEnum {
  WITHOUT_ACCOUNT = 'WITHOUT_ACCOUNT',
  WITH_ACCOUNT = 'WITH_ACCOUNT',
  ACCOUNT_CREATED_WELCOME_SCREEN = 'ACCOUNT_CREATED_WELCOME_SCREEN',
  ONE = 'one',
  TWO = 'two',
  THREE = 'three',
  FOUR = 'four',
  FIVE = 'five',
  SIX = 'six',
  SEVEN = 'seven',
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

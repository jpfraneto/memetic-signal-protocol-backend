// src/models/User/User.model.ts

/**
 * @file This file defines the User entity with its properties and relationships.
 */
import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

// Types
import { UserRoleEnum, UserStateOnTheSystemEnum } from './User.types';
import { Signal } from '../Signal/Signal.model';

/**
 * @class User
 * @classdesc User class represents a user in the SIGIL system.
 */
@Entity({ name: 'users' })
export class User {
  @PrimaryColumn()
  fid: number;

  // ================================
  // FARCASTER IDENTITY
  // ================================

  @Column()
  username: string;

  @Column({
    default: null,
    nullable: true,
  })
  displayName: string;

  @Column({
    type: 'text',
    default: null,
    nullable: true,
  })
  pfpUrl: string;

  @Column({
    default: false,
  })
  isVerified: boolean;

  @Column({
    type: 'int',
    default: 0,
  })
  followerCount: number;

  @Column({
    type: 'int',
    default: 0,
  })
  followingCount: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 3,
    default: 0,
  })
  mfsScore: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  winRate: number;

  @Column({
    type: 'int',
    default: 0,
  })
  totalSignals: number;

  @Column({
    type: 'int',
    default: 0,
  })
  activeSignals: number;

  @Column({
    type: 'int',
    default: 0,
  })
  settledSignals: number;

  @Column({
    type: 'int',
    default: null,
    nullable: true,
  })
  rank: number;

  // ================================
  // USER ROLE & PERMISSIONS
  // ================================

  @Column({
    type: 'enum',
    enum: UserRoleEnum,
    default: UserRoleEnum.USER,
  })
  role: UserRoleEnum;

  // ================================
  // NOTIFICATION SETTINGS
  // ================================

  @Column({
    default: false,
  })
  notificationsEnabled: boolean;

  @Column({
    default: null,
    nullable: true,
  })
  notificationToken: string;

  @Column({
    default: null,
    nullable: true,
  })
  notificationUrl: string;

  @Column({ default: false })
  isBanned: boolean; // Whether user is currently banned

  @Column({ type: 'timestamp', nullable: true })
  bannedAt: Date; // When the ban started

  // ================================
  // TIMESTAMPS
  // ================================

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastActiveAt: Date;

  // ================================
  // RELATIONSHIPS
  // ================================

  @OneToMany(() => Signal, (signal) => signal.user)
  signals: Signal[];

  // ================================
  // DAILY SIGNAL TRACKING
  // ================================

  @Column({ type: 'date', nullable: true })
  lastSignalDate: Date;

  @Column({ default: false })
  usedRetryToday: boolean;

  @Column({ default: false })
  submittedSignalToday: boolean;

  // ================================
  // DEFAULT TOKENS
  // ================================

  @Column({ type: 'json', nullable: true })
  defaultTokens: Array<{
    ca: string;
    ticker: string;
  }>;

  @Column({
    type: 'enum',
    enum: UserStateOnTheSystemEnum,
    default: UserStateOnTheSystemEnum.WITHOUT_ACCOUNT,
  })
  stateOnTheSystem: UserStateOnTheSystemEnum;

  @Column({
    type: 'varchar',
    length: 42,
    nullable: true,
    unique: true,
  })
  walletAddress: string;

  // ================================
  // JBM TOKEN BALANCE
  // ================================

  @Column({
    type: 'decimal',
    precision: 65,
    scale: 0,
    default: '0',
    nullable: true,
  })
  jbmBalance: string;

  // ================================
  // SUBSCRIPTION STATUS
  // ================================

  @Column({ default: false })
  isSubscriber: boolean; // Whether user has active subscription

  @Column({ type: 'timestamp', nullable: true })
  subscriptionExpiresAt: Date; // When subscription expires

  @Column({ type: 'timestamp', nullable: true })
  subscribedAt: Date; // When subscription was purchased
}

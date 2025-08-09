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
import { UserRoleEnum } from './User.types';
import { Call } from '../Call/Call.model';

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
  bio: string;

  @Column({
    default: null,
    nullable: true,
  })
  avatar: string;

  @Column({
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
  totalCalls: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
  })
  totalStaked: number;

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

  @OneToMany(() => Call, (call) => call.user)
  calls: Call[];
}

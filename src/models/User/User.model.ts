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
    name: 'display_name',
    type: 'text',
    nullable: true,
  })
  display_name: string;

  @Column({
    name: 'pfp_url',
    type: 'text',
    nullable: true,
  })
  pfp_url: string;

  @Column({
    name: 'is_verified',
    default: false,
  })
  is_verified: boolean;

  @Column({
    name: 'follower_count',
    type: 'int',
    default: 0,
  })
  follower_count: number;

  @Column({
    name: 'following_count',
    type: 'int',
    default: 0,
  })
  following_count: number;

  @Column({
    name: 'mfs_score',
    type: 'real',
    default: 0,
  })
  mfs_score: number;

  @Column({
    name: 'win_rate',
    type: 'real',
    default: 0,
  })
  win_rate: number;

  @Column({
    name: 'total_signals',
    type: 'int',
    default: 0,
  })
  total_signals: number;

  @Column({
    name: 'active_signals',
    type: 'int',
    default: 0,
  })
  active_signals: number;

  @Column({
    name: 'settled_signals',
    type: 'int',
    default: 0,
  })
  settled_signals: number;

  @Column({
    name: 'total_score',
    type: 'real',
    default: 0,
  })
  total_score: number; // Accumulated score from all resolved signals

  @Column({
    name: 'rank',
    type: 'int',
    nullable: true,
  })
  rank: number;

  @Column({
    name: 'last_score_update',
    type: 'int',
    nullable: true,
  })
  last_score_update: number;

  // ================================
  // USER ROLE & PERMISSIONS
  // ================================

  @Column({
    type: 'text',
    default: 'USER',
  })
  role: string;

  @Column({
    name: 'is_banned',
    default: false,
  })
  is_banned: boolean; // Whether user is currently banned

  @Column({
    name: 'banned_at',
    type: 'timestamp',
    nullable: true,
  })
  banned_at: Date; // When the ban started

  // ================================
  // NOTIFICATION SETTINGS
  // ================================

  @Column({
    name: 'notifications_enabled',
    default: true,
  })
  notifications_enabled: boolean;

  @Column({
    name: 'notification_token',
    type: 'text',
    nullable: true,
  })
  notification_token: string;

  @Column({
    name: 'notification_url',
    type: 'text',
    nullable: true,
  })
  notification_url: string;

  @Column({
    name: 'last_signal_date',
    type: 'text',
    nullable: true,
  })
  last_signal_date: string;

  @Column({
    name: 'state_on_the_system',
    type: 'text',
    default: 'ACTIVE',
  })
  state_on_the_system: string;

  @Column({
    name: 'wallet_address',
    type: 'varchar',
    length: 42,
    nullable: true,
    unique: true,
  })
  wallet_address: string;

  // ================================
  // JBM TOKEN BALANCE
  // ================================

  @Column({
    name: 'jbm_balance',
    type: 'text',
    default: '0',
  })
  jbm_balance: string;

  // ================================
  // SUBSCRIPTION STATUS
  // ================================

  // ================================
  // TIMESTAMPS
  // ================================

  @Column({
    name: 'created_at',
    type: 'timestamp',
  })
  created_at: Date;

  @Column({
    name: 'updated_at',
    type: 'timestamp',
  })
  updated_at: Date;

  @Column({
    name: 'last_active_at',
    type: 'timestamp',
    nullable: true,
  })
  last_active_at: Date;

  // ================================
  // RELATIONSHIPS
  // ================================

  @OneToMany(() => Signal, (signal) => signal.user)
  signals: Signal[];
}

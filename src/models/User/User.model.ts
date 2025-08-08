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
  pfpUrl: string;

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

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
} from 'typeorm';

// Types
import { UserRoleEnum } from './User.types';

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

  @Column({
    default: null,
    nullable: true,
  })
  lastRunReminderSent: Date;

  // ================================
  // QUICK STATS (Denormalized for performance)
  // ================================

  @Column({ default: 0 })
  totalRuns: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  totalDistance: number;

  @Column({ default: 0 })
  totalTimeMinutes: number;

  @Column({ default: 0 })
  currentStreak: number;

  @Column({ default: 0 })
  longestStreak: number;

  // ================================
  // WORKOUT VALIDATION & BAN SYSTEM
  // ================================

  @Column({ default: 0 })
  invalidWorkoutSubmissions: number; // Count of invalid workout submissions

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
}

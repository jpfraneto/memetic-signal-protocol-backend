// src/models/NotificationQueue/NotificationQueue.model.ts

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

import {
  NotificationTypeEnum,
  NotificationStatusEnum,
} from './NotificationQueue.types';

@Entity({ name: 'notification_queue' })
export class NotificationQueue {
  @Column({ type: 'text', primary: true })
  id: string;

  @Column({ name: 'user_id', type: 'integer' })
  user_id: number;

  @Column({ type: 'text' })
  type: string;

  @Column({ name: 'notification_id', type: 'text', nullable: true })
  notification_id: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'target_url', type: 'text', nullable: true })
  target_url: string;

  @Column({ type: 'text', default: 'PENDING' })
  status: string;

  @Column({ name: 'retry_count', type: 'integer', default: 0 })
  retry_count: number;

  @Column({ name: 'scheduled_for', type: 'date' })
  scheduled_for: Date;

  @Column({ name: 'sent_at', type: 'date', nullable: true })
  sent_at: Date;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  error_message: string;

  @Column({ name: 'created_at', type: 'date' })
  created_at: Date;

  @Column({ name: 'updated_at', type: 'date' })
  updated_at: Date;
}

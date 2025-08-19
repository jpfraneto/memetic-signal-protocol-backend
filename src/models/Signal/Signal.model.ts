import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import {
  SignalDirection,
  SignalStatus,
  TokenPrediction,
  SignalMetadata,
} from './Signal.types';
import { User } from '../User/User.model';

@Entity({ name: 'signals' })
export class Signal {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  signalId: string;

  @Column({ type: 'json' })
  tokens: TokenPrediction[];

  @Column({ type: 'bigint' })
  timestamp: number;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({
    type: 'enum',
    enum: ['ACTIVE', 'WON', 'LOST', 'EXPIRED'],
    default: 'ACTIVE',
  })
  status: SignalStatus;

  @Column({ type: 'tinyint', default: 0 })
  correctPredictions: number;

  @Column({ type: 'json', nullable: true })
  metadata: SignalMetadata;

  // ================================
  // FOREIGN KEYS
  // ================================

  @Column()
  fid: number;

  // ================================
  // RELATIONSHIPS
  // ================================

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fid', referencedColumnName: 'fid' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
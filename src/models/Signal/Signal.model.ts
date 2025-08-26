import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { SignalDirection, SignalStatus } from './Signal.types';
import { User } from '../User/User.model';

@Entity({ name: 'signals' })
export class Signal {
  @PrimaryColumn({ type: 'varchar', length: 66 })
  signalId: string;

  @Column({ type: 'varchar', length: 255 })
  tokenAddress: string;

  @Column({ type: 'varchar', length: 50 })
  symbol: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  initialMarketCap: number;

  @Column({
    type: 'enum',
    enum: ['UP', 'DOWN'],
  })
  direction: SignalDirection;

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

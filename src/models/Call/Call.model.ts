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
  CallDirection,
  CallMetadata,
  CallStatus,
  CallTimeframe,
} from './Call.types';
import { User } from '../User/User.model';

@Entity({ name: 'calls' })
export class Call {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  signalId: string;

  @Column({ unique: true })
  transactionHash: string;

  @Column()
  tokenAddress: string;

  @Column()
  ticker: string;

  @Column({
    type: 'enum',
    enum: ['up', 'down'],
  })
  direction: CallDirection;

  @Column({ type: 'bigint' })
  timestamp: number;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  callPrice: number;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  currentPrice: number;

  @Column({
    type: 'enum',
    enum: ['24h', '7d', '30d'],
    default: '24h',
  })
  timeframe: CallTimeframe;

  @Column({
    type: 'enum',
    enum: ['active', 'won', 'lost', 'expired'],
    default: 'active',
  })
  status: CallStatus;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  pnlPercentage: number;

  @Column({ type: 'json', nullable: true })
  metadata: CallMetadata;

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

import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { CallDirection, CallMetadata } from './Call.types';
import { User } from '../User/User.model';

@Entity({ name: 'calls' })
export class Call {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  signalId: string;

  @Column({ unique: true })
  transactionHash: string;

  @Column()
  fid: number;

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

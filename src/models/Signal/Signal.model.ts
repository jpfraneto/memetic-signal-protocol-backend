import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../User/User.model';
import { Token } from '../Token/Token.model';

@Entity({ name: 'signals' })
export class Signal {
  @PrimaryColumn({ type: 'int' })
  signal_id: number; // Primary key from contract

  @Column({ type: 'varchar', length: 66 })
  transaction_hash: string;

  @Column({ type: 'int' })
  fid: number;

  @Column({ type: 'varchar', length: 42 })
  ca: string; // Contract address - hex format

  @Column({ type: 'boolean' })
  direction: boolean; // false = DOWN, true = UP

  @Column({ type: 'int' })
  duration_days: number; // Duration in days (uint32)

  @Column({ type: 'bigint' })
  created_at: bigint; // uint64 timestamp from contract

  @Column({ type: 'bigint' })
  expires_at: bigint; // uint64 timestamp from contract

  @Column({ type: 'date' })
  timestamp: Date; // Block timestamp when signal was created

  @Column({ type: 'bigint' })
  block_number: bigint;

  @Column({ type: 'boolean', default: false })
  resolved: boolean; // Whether signal has been resolved on-chain

  @Column({ type: 'text', default: '0' })
  mfs_applied: string; // int256 MFS delta applied (as string for precision)

  @Column({ type: 'int', default: 0 })
  status: number; // 0 = active, 1 = won, 2 = lost (legacy backend status)

  @Column({ type: 'int' })
  mc: number; // Market cap when signal was created

  // Optional relations for backend convenience (not part of Ponder schema)
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fid', referencedColumnName: 'fid' })
  user?: User;

  @ManyToOne(() => Token, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ca', referencedColumnName: 'ca' })
  token?: Token;

  // Helper property to get expires_at as Date (computed from bigint timestamp)
  get expiresAtDate(): Date {
    return new Date(Number(this.expires_at) * 1000);
  }

  // Helper property to get created_at as Date (computed from bigint timestamp)
  get createdAtDate(): Date {
    return new Date(Number(this.created_at) * 1000);
  }

  // Helper property to get duration in days (alias for duration_days)
  get duration(): number {
    return this.duration_days;
  }
}

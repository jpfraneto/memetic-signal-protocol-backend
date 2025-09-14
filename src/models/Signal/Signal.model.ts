import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';

import { User } from '../User/User.model';
import { Token } from '../Token/Token.model';

@Entity({ name: 'signals' })
export class Signal {
  @PrimaryColumn({ type: 'int' })
  signal_id: number;

  @Column({ type: 'varchar', length: 66 })
  transaction_hash: string;

  @Column({ type: 'int' })
  fid: number;

  @Column({ type: 'varchar', length: 66 })
  ca: string;

  @Column({ type: 'boolean' })
  direction: boolean;

  @Column({ type: 'int' })
  duration_days: number;

  @Column({ type: 'bigint' })
  entry_market_cap: bigint;

  @Column({ type: 'bigint' })
  created_at: bigint;

  @Column({ type: 'bigint' })
  expires_at: bigint;

  @Column({ type: 'date' })
  timestamp: Date;

  @Column({ type: 'bigint' })
  block_number: bigint;

  @Column({ type: 'boolean', default: false })
  resolved: boolean;

  @Column({ type: 'int', default: 0 })
  mfs_delta: number;

  @Column({ type: 'boolean', default: false })
  manually_updated: boolean;

  @Column({ type: 'boolean', default: false })
  resolution_error: boolean;

  @Column({ type: 'bigint', nullable: true })
  exit_market_cap: bigint;

  @Column({ type: 'text', nullable: true })
  resolution_attempts: string;

  @Column({ type: 'text', nullable: true })
  data_sources: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fid', referencedColumnName: 'fid' })
  user?: User;

  @ManyToOne(() => Token, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ca', referencedColumnName: 'ca' })
  token?: Token;

  get expiresAtDate(): Date {
    return new Date(Number(this.expires_at) * 1000);
  }

  get createdAtDate(): Date {
    return new Date(Number(this.created_at) * 1000);
  }

  get duration(): number {
    return this.duration_days;
  }
}

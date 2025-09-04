import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../User/User.model';

@Entity({ name: 'daily_signal_counts' })
export class DailySignalCount {
  @PrimaryColumn({ type: 'varchar', length: 66 })
  id: string; // Primary key - hex format

  @Column({ type: 'int' })
  fid: number;

  @Column({ type: 'date' })
  day: Date; // Day in YYYY-MM-DD format

  @Column({ type: 'int' })
  count: number; // Number of signals created on this day

  @Column({ type: 'bigint', name: 'block_number' })
  blockNumber: number;

  @Column({ type: 'varchar', length: 66, name: 'transaction_hash' })
  transactionHash: string;

  // Optional relation for backend convenience
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fid', referencedColumnName: 'fid' })
  user?: User;
}
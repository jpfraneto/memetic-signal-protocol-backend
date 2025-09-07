import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../User/User.model';

@Entity({ name: 'fid_stats' })
export class FidStats {
  @PrimaryColumn({ type: 'int' })
  fid: number;

  @Column({ type: 'int', name: 'total_signals', default: 0 })
  totalSignals: number;

  @Column({ type: 'int', name: 'active_signals', default: 0 })
  activeSignals: number;

  @Column({ type: 'int', name: 'won_signals', default: 0 })
  wonSignals: number;

  @Column({ type: 'int', name: 'lost_signals', default: 0 })
  lostSignals: number;

  @Column({ type: 'bigint', name: 'block_number' })
  blockNumber: number;

  @Column({ type: 'varchar', length: 66, name: 'transaction_hash' })
  transactionHash: string;

  // Optional relation for backend convenience
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fid', referencedColumnName: 'fid' })
  user?: User;
}

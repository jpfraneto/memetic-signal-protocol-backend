import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';

import { User } from '../User/User.model';
import { Token } from '../Token/Token.model';

@Entity({ name: 'signals' })
export class Signal {
  @PrimaryColumn({ type: 'varchar', length: 66 })
  transaction_hash: string;

  @Column({ type: 'int' })
  fid: number;

  @Column({ type: 'varchar', length: 42 })
  ca: string; // Contract address - hex format

  @Column({ type: 'boolean' })
  direction: boolean; // false = DOWN, true = UP

  @Column({ type: 'int' })
  duration: number; // Duration in days

  @Column({ type: 'int' })
  mc: number; // Market cap when signal was created

  @Column({ type: 'varchar' })
  timestamp: string; // Block timestamp

  @Column({ type: 'bigint', name: 'block_number' })
  block_number: number;

  @Column({ type: 'int', default: 0 })
  status: number; // 0 = active, 1 = won, 2 = lost

  @Column({ type: 'date', name: 'expires_at' })
  expires_at: Date;

  // Optional relations for backend convenience (not part of Ponder schema)
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fid', referencedColumnName: 'fid' })
  user?: User;

  @ManyToOne(() => Token, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ca', referencedColumnName: 'ca' })
  token?: Token;
}

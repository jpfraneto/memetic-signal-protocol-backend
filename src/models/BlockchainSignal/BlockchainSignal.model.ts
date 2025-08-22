import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Token } from '../Token/Token.model';

@Entity({ name: 'blockchain_signals' })
export class BlockchainSignal {
  @PrimaryColumn({ type: 'varchar' })
  id: string; // Use the indexer's event ID

  @Column({ type: 'bigint' })
  signalId: string; // Signal ID from smart contract

  @Column({ type: 'bigint' })
  fid: string; // Farcaster ID

  @Column({ type: 'varchar', length: 42 })
  ca: string; // Contract address

  @Column({ type: 'tinyint' })
  direction: number; // 0 = DOWN, 1 = UP

  @Column({ type: 'tinyint' })
  timeframe: number; // 0-100

  @Column({ type: 'bigint' })
  expiresAt: string; // Expiration timestamp

  @Column({ type: 'boolean' })
  isSubscriber: boolean;

  @Column({ type: 'boolean', default: false })
  isResolved: boolean;

  @Column({ type: 'boolean', nullable: true })
  won: boolean | null;

  @Column({ type: 'bigint', nullable: true })
  blockTimestamp: string;

  @Column({ type: 'varchar', nullable: true })
  transactionHash: string;

  // Relationship to token metadata
  @ManyToOne(() => Token, { nullable: true })
  @JoinColumn({ name: 'ca', referencedColumnName: 'address' })
  token: Token;

  // Sync tracking
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  syncedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
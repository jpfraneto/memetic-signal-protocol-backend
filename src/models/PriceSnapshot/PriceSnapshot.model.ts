import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'price_snapshots' })
@Index('idx_price_snapshot_token_time', ['tokenAddress', 'snapshotAt'])
@Index('idx_price_snapshot_token', ['tokenAddress'])
export class PriceSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 42 })
  tokenAddress: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  marketCap: number;

  @Column({ type: 'decimal', precision: 10, scale: 8 })
  price: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  volume24h: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp' })
  snapshotAt: Date;
}

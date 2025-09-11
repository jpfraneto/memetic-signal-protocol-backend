import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'price_snapshots' })
export class PriceSnapshot {
  @Column({ type: 'text', primary: true })
  id: string;

  @Column({ name: 'token_address', type: 'varchar', length: 66 })
  token_address: string;

  @Column({ name: 'market_cap', type: 'text' })
  market_cap: string;

  @Column({ type: 'text' })
  price: string;

  @Column({ name: 'volume_24h', type: 'text', nullable: true })
  volume_24h: string;

  @Column({ name: 'created_at', type: 'date' })
  created_at: Date;

  @Column({ name: 'snapshot_at', type: 'date' })
  snapshot_at: Date;
}

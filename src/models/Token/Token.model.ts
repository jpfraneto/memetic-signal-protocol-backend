import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'tokens' })
export class Token {
  @PrimaryColumn({ type: 'varchar', length: 66 }) // hex format
  ca: string;

  @Column({ type: 'text', nullable: true })
  coingecko_id: string;

  @Column({ type: 'text', nullable: true })
  platform_id: string;

  @Column({ type: 'text', nullable: true })
  fetched_from: string;

  @Column({ type: 'text', nullable: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  symbol: string;

  @Column({ type: 'integer', nullable: true })
  decimals: number;

  @Column({ type: 'text', nullable: true })
  categories: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  image: string;

  @Column({ type: 'text', nullable: true })
  image_small: string;

  @Column({ type: 'text', nullable: true })
  image_thumb: string;

  @Column({ type: 'bigint', nullable: true })
  market_cap_rank: bigint;

  @Column({ type: 'text', nullable: true })
  market_data: string; // JSON string

  @Column({ type: 'date' })
  created_at: Date;

  @Column({ type: 'date' })
  updated_at: Date;
}

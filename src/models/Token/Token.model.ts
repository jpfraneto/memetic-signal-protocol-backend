import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'tokens' })
export class Token {
  @PrimaryColumn({ type: 'varchar', length: 42 })
  ca: string;

  @Column()
  name: string;

  @Column()
  symbol: string;

  @Column({ type: 'int', default: 18 })
  decimals: number;

  @Column({ type: 'simple-array', nullable: true })
  categories: string[];

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  image: string;

  @Column({ type: 'text', nullable: true })
  image_small: string;

  @Column({ type: 'text', nullable: true })
  image_thumb: string;

  @Column({ type: 'int', nullable: true })
  market_cap_rank: number;

  @Column({ type: 'json', nullable: true })
  market_data: {
    current_price: number;
    ath: number;
    ath_change_percentage: number;
    ath_date: string;
    market_cap: number;
    price_change_24h: number;
  };

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'varchar', nullable: false })
  coingecko_id: string;

  @Column({ type: 'varchar', nullable: true })
  coin_id: string;
}

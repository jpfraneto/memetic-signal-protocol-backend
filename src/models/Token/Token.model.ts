import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { TokenMetadata } from './Token.types';

@Entity({ name: 'tokens' })
export class Token {
  @PrimaryColumn({ type: 'varchar', length: 42 })
  address: string;

  @Column()
  name: string;

  @Column()
  symbol: string;

  @Column({ type: 'int', default: 18 })
  decimals: number;

  @Column({ type: 'decimal', precision: 36, scale: 18, nullable: true })
  totalSupply: string;

  @Column({ type: 'text', nullable: true })
  image: string;

  @Column({ type: 'decimal', precision: 20, scale: 10, nullable: true })
  price: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  change24h: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, nullable: true })
  marketCap: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, nullable: true })
  marketCapChange24h: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, nullable: true })
  marketCapChange7d: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, nullable: true })
  marketCapChange30d: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, nullable: true })
  peakMarketCap: number;

  @Column({ type: 'timestamp', nullable: true })
  peakMarketCapDate: Date;

  @Column({ type: 'int', default: 0 })
  marketCapRank: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, nullable: true })
  avgMarketCap7d: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, nullable: true })
  avgMarketCap30d: number;

  @Column({ type: 'json', nullable: true })
  marketCapHistory: { timestamp: Date; marketCap: number }[];

  @Column({ type: 'json', nullable: true })
  metadata: TokenMetadata;

  @Column({ type: 'timestamp', nullable: true })
  lastPriceUpdate: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastMetadataUpdate: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastMarketCapUpdate: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
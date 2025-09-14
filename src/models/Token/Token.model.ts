import {
  Entity,
  Column,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'tokens' })
export class Token {
  @PrimaryColumn({ type: 'varchar', length: 66 })
  ca: string;

  @Column({ type: 'text', nullable: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  symbol: string;

  @Column({ type: 'integer', nullable: true })
  decimals: number;

  @Column({ type: 'text', nullable: true })
  image: string;

  @Column({ type: 'date' })
  created_at: Date;

  @Column({ type: 'date' })
  updated_at: Date;
}

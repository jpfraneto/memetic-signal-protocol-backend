import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../User/User.model';

@Entity({ name: 'fid_bans' })
export class FidBan {
  @PrimaryColumn({ type: 'varchar', length: 66 })
  id: string; // Primary key - hex format

  @Column({ type: 'int' })
  fid: number;

  @Column({ type: 'boolean' })
  banned: boolean; // true = banned, false = unbanned

  @Column({ type: 'bigint', name: 'block_number' })
  blockNumber: number;

  @Column({ type: 'varchar', length: 66, name: 'transaction_hash' })
  transactionHash: string;

  // Optional relation for backend convenience
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fid', referencedColumnName: 'fid' })
  user?: User;
}
import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity({ name: 'wallet_bans' })
export class WalletBan {
  @PrimaryColumn({ type: 'varchar', length: 66 })
  id: string; // Primary key - hex format

  @Column({ type: 'varchar', length: 42 })
  wallet: string; // Wallet address - hex format

  @Column({ type: 'boolean' })
  banned: boolean; // true = banned, false = unbanned

  @Column({ type: 'bigint', name: 'block_number' })
  blockNumber: number;

  @Column({ type: 'varchar', length: 66, name: 'transaction_hash' })
  transactionHash: string;
}

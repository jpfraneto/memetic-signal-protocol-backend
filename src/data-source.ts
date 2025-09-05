import { DataSource } from 'typeorm';
import { getConfig } from './security/config';

// Import all entities
import { User } from './models/User/User.model';
import { NotificationQueue } from './models/NotificationQueue/NotificationQueue.model';
import { Signal } from './models/Signal/Signal.model';
import { Token } from './models/Token/Token.model';
// Import Ponder entities
import { FidStats } from './models/FidStats/FidStats.model';
import { WalletAuthorization } from './models/WalletAuthorization/WalletAuthorization.model';
import { DailySignalCount } from './models/DailySignalCount/DailySignalCount.model';
import { FidBan } from './models/FidBan/FidBan.model';
import { WalletBan } from './models/WalletBan/WalletBan.model';

// Create data source for TypeORM CLI commands
export const AppDataSource = new DataSource({
  type: 'postgres',
  ...(getConfig().db.url
    ? { url: getConfig().db.url }
    : {
        host: getConfig().db.host,
        port: getConfig().db.port,
        username: getConfig().db.username,
        password: getConfig().db.password,
        database: getConfig().db.name,
      }),
  entities: [
    User,
    NotificationQueue,
    Signal,
    Token,
    FidStats,
    WalletAuthorization,
    DailySignalCount,
    FidBan,
    WalletBan,
  ],
  migrations: [],
  subscribers: ['src/database/subscribers/*.ts'],
  synchronize: false, // Always false for CLI commands
  logging: false,
  ssl: getConfig().db.requireSSL ? { rejectUnauthorized: false } : false,
  extra: {
    connectionLimit: 10,
  },
});

// Initialize data source
AppDataSource.initialize()
  .then(() => {
    console.log('Data Source has been initialized!');
  })
  .catch((err) => {
    console.error('Error during Data Source initialization', err);
  });

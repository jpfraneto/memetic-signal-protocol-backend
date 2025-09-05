import { Logger } from '@nestjs/common';

const logger = new Logger('MSPSystem');

/**
 * Configuration object for the Memetic Signal Protocol (MSP) application environment.
 * @property {boolean} isProduction - Determines if the environment is production based on the NODE_ENV variable.
 * @property {Object} runtime - Contains runtime configuration.
 * @property {number|string} runtime.port - The port the application runs on, defaults to 8080 if not specified.
 * @property {Object} db - Contains database connection configuration.
 * @property {string} db.name - The name of the database from the DATABASE_NAME environment variable.
 * @property {string} db.host - The database host, defaults to an empty string if not specified.
 * @property {number} db.port - The database port, parsed from the DATABASE_PORT environment variable, defaults to 5432 for PostgreSQL.
 * @property {string} db.username - The database username from the DATABASE_USER environment variable.
 * @property {string} db.password - The database password from the DATABASE_PASSWORD environment variable.
 */

export const getConfig = () => {
  // Debug logging to see what environment variables are being read

  const config = {
    identifier: process.env.IDENTIFIER || 'MSP API',
    version: process.env.VERSION || '2.0',
    isProduction: process.env.NODE_ENV === 'production',
    runtime: {
      host: process.env.HOST || '',
      port:
        process.env.PORT ||
        (process.env.NODE_ENV === 'production' ? 3000 : 8080),
    },
    session: {
      key: process.env.SESSION_KEY || 'msp_session_key',
      domain: process.env.SESSION_DOMAIN || '127.0.0.1',
    },
    db: {
      name:
        process.env.DATABASE_NAME ||
        process.env.DATABASE_URL?.split('/').pop() ||
        'railway',
      host:
        process.env.DATABASE_HOST ||
        process.env.DATABASE_URL?.split('@')[1]?.split(':')[0] ||
        'localhost',
      port: process.env.DATABASE_PORT
        ? parseInt(process.env.DATABASE_PORT, 10)
        : process.env.DATABASE_URL
          ? parseInt(
              process.env.DATABASE_URL.split(':')[2]?.split('/')[0] || '5432',
              10,
            )
          : 5432,
      username:
        process.env.DATABASE_USER ||
        process.env.DATABASE_URL?.split('://')[1]?.split(':')[0] ||
        'postgres',
      password:
        process.env.DATABASE_PASSWORD ||
        process.env.DATABASE_URL?.split(':')[2]?.split('@')[0] ||
        '',
      requireSSL: process.env.DATABASE_SSL === 'true',
      url: process.env.DATABASE_URL,
    },
    neynar: {
      apiKey: process.env.NEYNAR_API_KEY || '',
    },
    blockchain: {
      backendPrivateKey: process.env.PRIVATE_KEY,
      contractAddress:
        process.env.CONTRACT_ADDRESS ||
        '0xd02De59d7Cc4dbbB609BB84fAb85936739ae0068',
    },
    notifications: {
      enabled: process.env.NOTIFICATIONS_ENABLED !== 'false',
      baseUrl: process.env.NOTIFICATION_BASE_URL || 'https://msp.app',
      miniappUrl: process.env.MINIAPP_URL || 'https://msp.app',
      dailyReminderHour: parseInt(process.env.DAILY_REMINDER_HOUR || '7', 10),
      eveningReminderHour: parseInt(
        process.env.EVENING_REMINDER_HOUR || '18',
        10,
      ),
      maxRetries: parseInt(process.env.NOTIFICATION_MAX_RETRIES || '3', 10),
      rateLimitPerMinute: parseInt(
        process.env.NOTIFICATION_RATE_LIMIT || '100',
        10,
      ),
    },
    msp: {
      // MSP-specific configurations
      defaultEngagementThreshold: parseInt(
        process.env.DEFAULT_ENGAGEMENT_THRESHOLD || '10',
        10,
      ),
      memeticRewardThreshold: parseInt(
        process.env.MEMETIC_REWARD_THRESHOLD || '5',
        10,
      ),
      tokenRewardAmount: parseInt(process.env.TOKEN_REWARD_AMOUNT || '100', 10),
      aiAgentEnabled: process.env.AI_AGENT_ENABLED !== 'false',
      // MSP exponential decay configuration
      decayConstant: parseFloat(process.env.MSP_DECAY_CONSTANT || '0.088'),
      maxSignalDuration: parseInt(process.env.MAX_SIGNAL_DURATION || '333', 10),
      dailySignalLimit: parseInt(process.env.DAILY_SIGNAL_LIMIT || '3', 10),
    },
    tools: {},
    startup: () => {
      logger.log(`
        ╔══════════════════════════════════════════════════════════════════════════════╗
        ║                                                                              ║
        ║    ███╗   ███╗███████╗██████╗                                                      ║
        ║    ████╗ ████║██╔════╝██╔══██╗                                                     ║
        ║    ██╔████╔██║███████╗██████╔╝                                                     ║
        ║    ██║╚██╔╝██║╚════██║██╔═══╝                                                      ║
        ║    ██║ ╚═╝ ██║███████║██║                                                          ║
        ║    ╚═╝     ╚═╝╚══════╝╚═╝                                                          ║
        ║                                                                              ║
        ║                MEMETIC SIGNAL PROTOCOL (MSP)                                ║
        ║                                                                              ║
        ║              🔮 Cryptographic Reputation for Crypto Predictions 🔮         ║
        ║                               Version ${config.version}                 ║
        ║                                                                              ║
        ╠══════════════════════════════════════════════════════════════════════════════╣

        ║    🔮 MEMETIC SIGNAL PROTOCOL:                                               ║
        ║       • Exponential decay scoring for precise market timing                 ║
        ║       • Cryptographic reputation on Base Chain                              ║
        ║       • Farcaster decentralized social infrastructure                      ║
        ║       • Trustless foundation for memetic reputation                         ║
        ║                                                                              ║
        ╠══════════════════════════════════════════════════════════════════════════════╣
        ║                                                                              ║
        ║  🚀 MSP SYSTEM STATUS:                                                       ║
        ║                                                                              ║
        ║    ✅ Smart Contract Layer (ProjectLighthouseV16)                            ║
        ║    ✅ Blockchain Indexing (Ponder)                                           ║
        ║    ✅ NestJS Backend & Redis Caching                                         ║
        ║    ✅ Farcaster Miniapp Interface                                            ║
        ║    ✅ Exponential Decay Scoring (λ = ${config.msp.decayConstant})                              ║
        ║    ✅ EIP-712 Signature Verification                                         ║
        ║    ${process.env.NODE_ENV === 'production' ? '🌐 PRODUCTION MODE' : '🔧 DEVELOPMENT MODE'}              ║
        ║                                                                              ║
        ║  🌐 Server listening on: http://localhost:${config.runtime.port}                             ║
        ║  📡 Database: PostgreSQL with Ponder Indexer                                ║
        ║  🔐 Auth: Farcaster + Neynar API                                           ║
        ║  🗄️  SSL: ${config.db.requireSSL ? 'Enabled' : 'Disabled'}                                      ║
        ║  🤖 AI Agent: ${config.msp.aiAgentEnabled ? 'Active' : 'Disabled'}                           ║
        ║  ⚡ Decay Constant: ${config.msp.decayConstant} (${config.msp.maxSignalDuration} day max)              ║
        ║                                                                              ║
        ╠══════════════════════════════════════════════════════════════════════════════╣
        ║                                                                              ║
        ║  ⚖️  EVERYTHING IS OPEN SOURCE                                              ║
        ║                                                                              ║
        ║     We believe in learning together, and sharing how to do things.            ║
        ║     Building open protocols for memetic coordination                        ║
        ║     Learn more about the Memetic Signal Protocol                            ║
        ║                                                                              ║
        ║     © ${new Date().getFullYear()} MSP - Memetic Signal Protocol - MIT License              ║
        ║                                                                              ║
        ╠══════════════════════════════════════════════════════════════════════════════╣
        ║                                                                              ║
        ║  🎯 READY TO POWER MEMETIC REPUTATION ON FARCASTER                           ║
        ║     Building cryptographic reputation through social signals                ║
        ║                                                                              ║
        ╚══════════════════════════════════════════════════════════════════════════════╝
        
        🔗 API Documentation: ${process.env.NODE_ENV === 'production' ? 'Disabled in production' : 'Available in development mode'}
        📊 Health Check: All systems operational and ready for signalers
        🏗️  Built on: Farcaster Protocol + Base Chain + Railway Infrastructure
        
      `);
    },
  };

  return config;
};

/**
 * Configuration options for CSRF protection middleware.
 * @property {Object} cookie - The configuration for the cookie to be set by CSRF middleware.
 * @property {string} cookie.key - The name of the cookie.
 * @property {boolean} cookie.sameSite - Strictly set to the same site for CSRF protection.
 * @property {boolean} cookie.httpOnly - Ensures the cookie is sent only over HTTP(S), not accessible through JavaScript.
 * @property {boolean} cookie.secure - Ensures the cookie is sent over HTTPS.
 */
export const csurfConfigOptions = {
  cookie: {
    key: '_csrf_msp',
    sameSite: true,
    httpOnly: true,
    secure: true,
  },
};

// Types
type Domains = Record<'LOCAL' | 'STAGING' | 'PRO', string[]>;

/**
 * Domains configuration for different environments.
 * LOCAL: Domains for local development.
 * STAGING: Domains for the staging environment.
 * PRO: Domains for the production environment.
 */
const domains: Domains = {
  LOCAL: [
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'https://localhost:3000',
    'https://miniapp.anky.app',
    'https://sigil.lat',
    'https://www.sigil.lat',
  ],
  STAGING: [
    'https://staging-msp.app',
    'https://dev-msp.app',
    'https://msp.lat',
    'https://sigil.lat',
    'https://www.sigil.lat',
  ],
  PRO: ['https://sigil.lat', 'https://www.sigil.lat'],
};

export default domains;

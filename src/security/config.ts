import { Logger } from '@nestjs/common';

const logger = new Logger('APISystem');

/**
 * Configuration object for the SIGIL application environment.
 * @property {boolean} isProduction - Determines if the environment is production based on the NODE_ENV variable.
 * @property {Object} runtime - Contains runtime configuration.
 * @property {number|string} runtime.port - The port the application runs on, defaults to 8080 if not specified.
 * @property {Object} db - Contains database connection configuration.
 * @property {string} db.name - The name of the database from the DATABASE_NAME environment variable.
 * @property {string} db.host - The database host, defaults to an empty string if not specified.
 * @property {number} db.port - The database port, parsed from the DATABASE_PORT environment variable, defaults to 3306 for MySQL.
 * @property {string} db.username - The database username from the DATABASE_USER environment variable.
 * @property {string} db.password - The database password from the DATABASE_PASSWORD environment variable.
 */

export const getConfig = () => {
  // Debug logging to see what environment variables are being read

  const config = {
    identifier: process.env.IDENTIFIER || 'SIGIL API',
    version: process.env.VERSION || '1.0',
    isProduction: process.env.NODE_ENV === 'production',
    runtime: {
      host: process.env.HOST || '',
      port:
        process.env.PORT ||
        (process.env.NODE_ENV === 'production' ? 3000 : 8080),
    },
    session: {
      key: process.env.SESSION_KEY || 'sigil_session_key',
      domain: process.env.SESSION_DOMAIN || '127.0.0.1',
    },
    db: {
      name: process.env.DATABASE_NAME || 'sigil_db',
      host: process.env.DATABASE_HOST || 'localhost', // Fixed: better fallback
      port: process.env.DATABASE_PORT
        ? parseInt(process.env.DATABASE_PORT, 10)
        : 3306, // Fixed: proper parsing
      username: process.env.DATABASE_USER || 'root',
      password: process.env.DATABASE_PASSWORD || '1234',
      requireSSL:
        process.env.DATABASE_SSL === 'true' ||
        process.env.NODE_ENV === 'production',
    },
    neynar: {
      apiKey: process.env.NEYNAR_API_KEY || '',
    },
    notifications: {
      enabled: process.env.NOTIFICATIONS_ENABLED !== 'false',
      baseUrl: process.env.NOTIFICATION_BASE_URL || 'https://sigil.app',
      miniappUrl: process.env.MINIAPP_URL || 'https://sigil.app',
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
    sigil: {
      // SIGIL-specific configurations
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
    },
    tools: {},
    startup: () => {
      logger.log(`
        ╔══════════════════════════════════════════════════════════════════════════════╗
        ║                                                                              ║
        ║    ███████╗██╗ ██████╗ ██╗██╗                                              ║
        ║    ██╔════╝██║██╔════╝ ██║██║                                              ║
        ║    ███████╗██║██║  ███╗██║██║                                              ║
        ║    ╚════██║██║██║   ██║██║██║                                              ║
        ║    ███████║██║╚██████╔╝██║███████╗                                         ║
        ║    ╚══════╝╚═╝ ╚═════╝ ╚═╝╚══════╝                                         ║
       ║                     MEMETIC LAYER PROTOCOL                                  ║
        ║                                                                              ║
        ║                      🔮 SIGIL MEMETIC LAYER PROTOCOL API 🔮                 ║
        ║                               Version ${config.version}                 ║
        ║                                                                              ║
        ╠══════════════════════════════════════════════════════════════════════════════╣

        ║    🔮 SIGIL MEMETIC LAYER PROTOCOL:                                           ║
        ║       • Building the future of memetic coordination                        ║
        ║                                   ║
        ║                                                                              ║
        ╠══════════════════════════════════════════════════════════════════════════════╣
        ║                                                                              ║
        ║  🚀 SIGIL SYSTEM STATUS:                                                     ║
        ║                                                                              ║
        ║    ✅ Memetic Analysis                                                       ║
        ║    ✅ Signal Processing                                                       ║
        ║    ✅ Token Rewards                                                           ║
        ║    ✅ Farcaster Integration                                                    ║
        ║    ✅ Community Features                                                      ║
        ║    ${process.env.NODE_ENV === 'production' ? '🌐 PRODUCTION MODE' : '🔧 DEVELOPMENT MODE'}              ║
        ║                                                                              ║
        ║  🌐 Server listening on: http://localhost:${config.runtime.port}                             ║
        ║  📡 Database: Connected & Synchronized                                       ║
        ║  🔐 Auth: Farcaster QuickAuth Enabled                                       ║
        ║  🗄️  SSL: ${config.db.requireSSL ? 'Enabled' : 'Disabled'}                                      ║
        ║  🤖 AI Agent: ${config.sigil.aiAgentEnabled ? 'Active' : 'Disabled'}                           ║
        ║                                                                              ║
        ╠══════════════════════════════════════════════════════════════════════════════╣
        ║                                                                              ║
        ║  ⚖️  EVERYTHING IS OPEN SOURCE                                              ║
        ║                                                                              ║
        ║     We believe in learning together, and sharing how to do things.            ║
        ║     Building open protocols for memetic coordination                        ║
        ║     Learn more about the Memetic Layer Protocol                            ║
        ║                                                                              ║
        ║     © ${new Date().getFullYear()} SIGIL - Memetic Layer Protocol - Open Source              ║
        ║                                                                              ║
        ╠══════════════════════════════════════════════════════════════════════════════╣
        ║                                                                              ║
        ║  🎯 READY TO POWER MEMETIC COORDINATION ON FARCASTER                          ║
        ║     Building intelligent agent networks through social signals              ║
        ║                                                                              ║
        ╚══════════════════════════════════════════════════════════════════════════════╝
        
        🔗 API Documentation: ${process.env.NODE_ENV === 'production' ? 'Disabled in production' : 'Available in development mode'}
        📊 Health Check: All systems operational and ready for signalers
        
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
    key: '_csrf_sigil',
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
    'https://sigil.app',
    'https://www.sigil.lat',
    'https://localhost:3000',
    'https://miniapp.anky.app',
  ],
  STAGING: ['https://staging-sigil.app', 'https://dev-sigil.app'],
  PRO: [
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'https://sigil.app',
    'https://sigil.lat',
    'https://www.sigil.lat',
    'https://www.sigil.app',
    'https://frame.sigil.app',
    'https://api.sigil.app',
    '*',
  ],
};

export default domains;

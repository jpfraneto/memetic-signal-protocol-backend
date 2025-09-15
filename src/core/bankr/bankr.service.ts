import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  formatEther,
  parseEther,
  maxUint256,
  Address,
} from 'viem';
import { base } from 'viem/chains';
import { getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { wrapFetchWithPayment } from 'x402-fetch';

// Reverse-engineered constants from Bankr SDK documentation
const BANKR_CONSTANTS = {
  BNKR_TOKEN_ADDRESS: '0x22aF33FE49fD1Fa80c7149773dDe5890D3c76f3b' as Address, // From docs
  FACILITATOR_ADDRESS: '0x4a15fc613c713FC52E907a77071Ec2d0a392a584' as Address, // From docs
  PERMIT2_ADDRESS: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address, // For swaps
  API_BASE_URL: 'https://api-staging.bankr.bot', // Base URL (per latest docs)
  CHAIN_ID: 8453, // Base network
  PAYMENT_SCHEME: 'exact',
  COST_PER_REQUEST: '100000000000000000', // $0.10 in wei (0.1 ETH equivalent)
} as const;

// ERC-20 ABI for token operations
const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
]);

interface PaymentRequirement {
  scheme: string;
  network: string;
  amount: string;
  recipient_address: string;
  asset?: string;
  resource?: string;
}

interface PaymentPayload {
  scheme: string;
  network: string;
  signature: string;
  address: string;
  amount: string;
  recipient_address: string;
  timestamp: number;
  asset?: string;
  resource?: string;
  version?: number;
}

interface TrendingTokensRequest {
  prompt: string;
  xmtp: boolean;
  walletAddress: string;
}

@Injectable()
export class BankrService {
  private readonly logger = new Logger(BankrService.name);
  private readonly walletClient;
  private readonly publicClient;
  private readonly account;
  private readonly apiKey: string;
  private readonly apiBaseUrl: string;
  private fetchWithPayment: any;

  constructor(private readonly configService: ConfigService) {
    this.logger.log('🚀 [BANKR INIT] Starting Bankr service initialization...');

    const privateKey = this.configService.get<string>(
      'PRIVATE_KEY',
    ) as `0x${string}`;
    const walletAddress = this.configService.get<string>(
      'WALLET_ADDRESS',
    ) as Address;
    this.apiKey = this.configService.get<string>('BANKR_API_KEY');
    this.apiBaseUrl =
      this.configService.get<string>('BANKR_API_URL') ||
      BANKR_CONSTANTS.API_BASE_URL;

    this.logger.log('🔍 [BANKR INIT] Environment variables check:');
    this.logger.log(
      `   - PRIVATE_KEY: ${privateKey ? '✅ Found' : '❌ Missing'}`,
    );
    this.logger.log(
      `   - WALLET_ADDRESS: ${walletAddress ? `✅ ${walletAddress}` : '❌ Missing'}`,
    );
    this.logger.log(
      `   - BANKR_API_KEY: ${this.apiKey ? `✅ ${this.apiKey.slice(0, 10)}...` : '❌ Missing'}`,
    );

    if (!privateKey || !walletAddress || !this.apiKey) {
      this.logger.error(
        '❌ [BANKR INIT] Missing required environment variables for Bankr integration',
      );
      throw new Error(
        'Missing required environment variables for Bankr integration',
      );
    }

    // Initialize viem clients
    this.logger.log('⚙️ [BANKR INIT] Initializing blockchain clients...');
    this.account = privateKeyToAccount(privateKey);
    this.logger.log(`   - Account address: ${this.account.address}`);

    this.walletClient = createWalletClient({
      account: this.account,
      chain: base,
      transport: http(),
    });

    this.publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    this.logger.log('🏗️ [BANKR INIT] Reverse-engineered constants:');
    this.logger.log(`   - BNKR Token: ${BANKR_CONSTANTS.BNKR_TOKEN_ADDRESS}`);
    this.logger.log(`   - Facilitator: ${BANKR_CONSTANTS.FACILITATOR_ADDRESS}`);
    this.logger.log(`   - API Base URL: ${this.apiBaseUrl}`);
    this.logger.log(
      `   - Cost per request: ${formatEther(BigInt(BANKR_CONSTANTS.COST_PER_REQUEST))} BNKR ($0.10)`,
    );

    // Initialize x402-enabled fetch using viem wallet client
    this.fetchWithPayment = wrapFetchWithPayment(
      fetch as any,
      this.walletClient,
      1000n * 10n ** 18n, // allow up to 1000 BNKR per request
    );

    this.logger.log(
      '✅ [BANKR INIT] Bankr service initialized with x402 payment support',
    );
  }

  /**
   * Main method to get trending tokens using Bankr API with x402 payments
   */
  async getTrendingTokens(limit: number = 30): Promise<any[]> {
    try {
      this.logger.log(
        `🎯 [BANKR TOKENS] Starting trending tokens fetch (limit: ${limit})`,
      );

      // Step 1: Check and ensure BNKR approval FIRST
      this.logger.log(
        '🔐 [BANKR TOKENS] Step 1: Checking BNKR token approval status...',
      );
      await this.ensureInitialApproval();

      // Step 2: Check current balance
      this.logger.log('💰 [BANKR TOKENS] Step 2: Checking BNKR balance...');
      const balance = await this.getBnkrBalance();
      this.logger.log(`   - Current BNKR balance: ${balance} BNKR`);

      const costInBNKR = formatEther(BigInt(BANKR_CONSTANTS.COST_PER_REQUEST));
      if (parseFloat(balance) < parseFloat(costInBNKR)) {
        this.logger.error(
          `❌ [BANKR TOKENS] Insufficient BNKR balance: ${balance} < ${costInBNKR}`,
        );
        throw new Error(
          `Insufficient BNKR balance: ${balance} BNKR (need ${costInBNKR} BNKR)`,
        );
      }

      // Step 3: Send the prompt
      this.logger.log(
        '📡 [BANKR TOKENS] Step 3: Sending prompt to Bankr API...',
      );
      const request: TrendingTokensRequest = {
        prompt: `sup bankr. this is jp from the msp (memetic signal protocol). can you please reply to this message with an array of 8 comma separated base tokens contract addresses? always have the first one be jungle may memes (0x3313338Fe4bB2A166B81483bfCb2d4A6A1ebBa8D). the rest ones you define a criteria to choose them. i like thinking of them as the "trending" tokens, for that moment in time, but you could think of them as you see fit. this miniapp is for "signaling" tokens, which means predicting the direction on which they will move on a given timeframe. i will display the tokens you reply with to the user.`,
        xmtp: false,
        walletAddress: this.account.address,
      };

      const response = await this.sendPrompt(request);

      // Step 4: Parse and validate the response
      this.logger.log('🔍 [BANKR TOKENS] Step 4: Parsing API response...');
      const tokens = this.parseTokensResponse(response);

      if (tokens && tokens.length > 0) {
        this.logger.log(
          `✅ [BANKR TOKENS] Successfully fetched ${tokens.length} trending tokens`,
        );
        return tokens;
      }

      throw new Error('No valid tokens returned from Bankr API');
    } catch (error) {
      this.logger.error(
        '❌ [BANKR TOKENS] Failed to fetch trending tokens:',
        error.message,
      );
      throw error;
    }
  }

  /**
   * Ensure BNKR tokens are approved for the facilitator (must be done once)
   */
  async ensureInitialApproval(): Promise<void> {
    try {
      this.logger.log('🔍 [BANKR APPROVAL] Checking current BNKR allowance...');

      const currentAllowance = await this.publicClient.readContract({
        address: getAddress(BANKR_CONSTANTS.BNKR_TOKEN_ADDRESS),
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [
          getAddress(this.account.address),
          getAddress(BANKR_CONSTANTS.FACILITATOR_ADDRESS),
        ],
      });

      const currentAllowanceFormatted = formatEther(currentAllowance);
      const requiredAllowance = formatEther(
        BigInt(BANKR_CONSTANTS.COST_PER_REQUEST),
      );

      this.logger.log(
        `   - Current allowance: ${currentAllowanceFormatted} BNKR`,
      );
      this.logger.log(`   - Required allowance: ${requiredAllowance} BNKR`);

      if (currentAllowance < BigInt(BANKR_CONSTANTS.COST_PER_REQUEST)) {
        this.logger.log(
          '⚠️ [BANKR APPROVAL] Insufficient allowance, approving maximum amount...',
        );

        const txHash = await this.walletClient.writeContract({
          address: getAddress(BANKR_CONSTANTS.BNKR_TOKEN_ADDRESS),
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [getAddress(BANKR_CONSTANTS.FACILITATOR_ADDRESS), maxUint256],
        });

        this.logger.log(
          `📝 [BANKR APPROVAL] Approval transaction submitted: ${txHash}`,
        );
        this.logger.log(
          '⏳ [BANKR APPROVAL] Waiting for transaction confirmation...',
        );

        const receipt = await this.publicClient.waitForTransactionReceipt({
          hash: txHash,
        });
        this.logger.log(
          `✅ [BANKR APPROVAL] BNKR approval confirmed! Block: ${receipt.blockNumber}`,
        );
      } else {
        this.logger.log(
          '✅ [BANKR APPROVAL] Sufficient allowance already exists',
        );
      }
    } catch (error) {
      this.logger.error(
        '❌ [BANKR APPROVAL] Failed to ensure BNKR allowance:',
        error.message,
      );
      throw new Error(`BNKR approval failed: ${error.message}`);
    }
  }

  /**
   * Send prompt to Bankr API with x402 payment handling (reverse-engineered)
   */
  private async sendPrompt(request: TrendingTokensRequest): Promise<any> {
    const url = `${this.apiBaseUrl.replace(/\/$/, '')}/prompt`;

    this.logger.log(`📡 [BANKR API] Sending request to: ${url}`);
    this.logger.log(
      `📝 [BANKR API] Request payload: ${JSON.stringify(request, null, 2)}`,
    );

    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
    } as Record<string, string>;

    this.logger.log(
      `📋 [BANKR API] Request headers: ${JSON.stringify(headers, null, 2)}`,
    );

    try {
      // Use x402-enabled fetch: it will handle 402 flows including building/sending tx
      const response = await this.fetchWithPayment(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `❌ [BANKR API] API error: ${response.status} ${response.statusText}`,
        );
        this.logger.error(`❌ [BANKR API] Error body: ${errorBody}`);
        throw new Error(
          `Bankr API error: ${response.status} ${response.statusText} - ${errorBody}`,
        );
      }

      const result = await response.json();
      this.logger.log(`✅ [BANKR API] Response received:`, result);

      if (result.jobId) {
        this.logger.log(
          `⏳ [BANKR API] Job created: ${result.jobId}, waiting for completion...`,
        );
        return await this.waitForJobCompletion(result.jobId);
      }

      return result;
    } catch (error) {
      this.logger.error('❌ [BANKR API] Prompt request failed:', error.message);
      throw error;
    }
  }

  /**
   * Create x402 payment payload with signature (reverse-engineered from SDK)
   */
  private async createPaymentPayload(
    paymentReq: PaymentRequirement,
  ): Promise<PaymentPayload> {
    const timestamp = Math.floor(Date.now() / 1000);

    this.logger.log('🔐 [BANKR PAYMENT] Creating x402 payment payload...');
    this.logger.log(`   - Scheme: ${paymentReq.scheme}`);
    this.logger.log(`   - Network: ${paymentReq.network}`);
    this.logger.log(
      `   - Amount: ${paymentReq.amount} wei (${formatEther(BigInt(paymentReq.amount))} BNKR)`,
    );
    this.logger.log(`   - Recipient: ${paymentReq.recipient_address}`);
    this.logger.log(`   - Timestamp: ${timestamp}`);

    // Create payment message matching x402 specification
    const paymentMessage = {
      scheme: paymentReq.scheme,
      network: paymentReq.network,
      amount: paymentReq.amount,
      recipient_address: paymentReq.recipient_address,
      timestamp,
    };

    this.logger.log(
      `🔏 [BANKR PAYMENT] Message to sign: ${JSON.stringify(paymentMessage)}`,
    );

    // Sign the payment message
    const messageString = JSON.stringify(paymentMessage);
    this.logger.log(
      '✍️ [BANKR PAYMENT] Signing payment message with wallet...',
    );

    const signature = await this.walletClient.signMessage({
      message: messageString,
    });

    this.logger.log(
      `✅ [BANKR PAYMENT] Payment signature created: ${signature}`,
    );

    const payload: PaymentPayload = {
      scheme: paymentReq.scheme,
      network: paymentReq.network,
      signature,
      address: this.account.address,
      amount: paymentReq.amount,
      recipient_address: paymentReq.recipient_address,
      timestamp,
      asset: paymentReq.asset,
      resource: paymentReq.resource,
      version: 1,
    };

    this.logger.log(`📦 [BANKR PAYMENT] Final payment payload:`, payload);
    return payload;
  }

  /**
   * Ensure sufficient BNKR allowance for facilitator (reverse-engineered approval logic)
   */
  private async ensureAllowance(requiredAmount: string): Promise<void> {
    try {
      // Check current allowance
      const currentAllowance = await this.publicClient.readContract({
        address: getAddress(BANKR_CONSTANTS.BNKR_TOKEN_ADDRESS),
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [
          getAddress(this.account.address),
          getAddress(BANKR_CONSTANTS.FACILITATOR_ADDRESS),
        ],
      });

      const required = BigInt(requiredAmount);

      this.logger.log(
        `[BANKR] Current allowance: ${formatEther(currentAllowance)} BNKR, Required: ${formatEther(required)} BNKR`,
      );

      if (currentAllowance < required) {
        this.logger.log(
          '[BANKR] Insufficient allowance, approving maximum amount',
        );

        // Approve maximum amount for future transactions
        const txHash = await this.walletClient.writeContract({
          address: getAddress(BANKR_CONSTANTS.BNKR_TOKEN_ADDRESS),
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [getAddress(BANKR_CONSTANTS.FACILITATOR_ADDRESS), maxUint256],
        });

        this.logger.log(`[BANKR] Approval transaction submitted: ${txHash}`);

        // Wait for confirmation
        await this.publicClient.waitForTransactionReceipt({ hash: txHash });
        this.logger.log('[BANKR] BNKR approval confirmed');
      }
    } catch (error) {
      this.logger.error(
        '[BANKR] Failed to ensure BNKR allowance:',
        error.message,
      );
      throw new Error(`BNKR approval failed: ${error.message}`);
    }
  }

  /**
   * Wait for async job completion (reverse-engineered polling logic)
   */
  private async waitForJobCompletion(
    jobId: string,
    maxAttempts: number = 50,
  ): Promise<any> {
    const pollInterval = 5000; // 5 seconds
    let attempts = 0;

    this.logger.log(`⏳ [BANKR JOB] Starting job polling for: ${jobId}`);
    this.logger.log(`   - Max attempts: ${maxAttempts}`);
    this.logger.log(`   - Poll interval: ${pollInterval}ms`);

    while (attempts < maxAttempts) {
      try {
        attempts++;
        this.logger.log(
          `🔄 [BANKR JOB] Attempt ${attempts}/${maxAttempts} - Checking job status...`,
        );

        const response = await fetch(
          `${this.apiBaseUrl.replace(/\/$/, '')}/job/${jobId}`,
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
            },
          },
        );

        this.logger.log(
          `📡 [BANKR JOB] Status check response: ${response.status} ${response.statusText}`,
        );

        if (!response.ok) {
          const errorBody = await response.text();
          this.logger.error(
            `❌ [BANKR JOB] Status check failed: ${response.status} - ${errorBody}`,
          );
          throw new Error(
            `Job status check failed: ${response.status} - ${errorBody}`,
          );
        }

        const job = await response.json();
        this.logger.log(`📋 [BANKR JOB] Job details:`, job);

        if (job.status === 'completed') {
          this.logger.log(
            `✅ [BANKR JOB] Job ${jobId} completed successfully!`,
          );
          this.logger.log(`📄 [BANKR JOB] Job result:`, job.result);
          // Bankr returns response as a comma-separated string under job.response
          return job.response || job.result;
        }

        if (job.status === 'failed') {
          this.logger.error(`❌ [BANKR JOB] Job ${jobId} failed:`, job.error);
          throw new Error(`Job ${jobId} failed: ${job.error}`);
        }

        this.logger.log(
          `⏸️ [BANKR JOB] Job ${jobId} status: ${job.status} - waiting ${pollInterval}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (error) {
        this.logger.error(
          `❌ [BANKR JOB] Job polling error (attempt ${attempts}):`,
          error.message,
        );

        // Only throw on the last attempt or if it's a non-retryable error
        if (attempts >= maxAttempts || error.message.includes('failed')) {
          throw error;
        }

        this.logger.log(`🔄 [BANKR JOB] Retrying in ${pollInterval}ms...`);
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }

    this.logger.error(
      `⏰ [BANKR JOB] Job ${jobId} timed out after ${maxAttempts} attempts (${(maxAttempts * pollInterval) / 1000}s)`,
    );
    throw new Error(`Job ${jobId} timed out after ${maxAttempts} attempts`);
  }

  /**
   * Parse and validate tokens response
   */
  private parseTokensResponse(response: any): any[] | null {
    try {
      let data = response;

      // Handle different response formats
      if (typeof response === 'string') {
        data = JSON.parse(response);
      }

      // Extract data from various response structures
      if (data.result) data = data.result;
      if (data.data) data = data.data;
      if (data.tokens) data = data.tokens;

      if (!Array.isArray(data)) {
        this.logger.warn('[BANKR] Response is not an array:', typeof data);
        return null;
      }

      // Validate and normalize token objects
      const validTokens = data
        .filter(
          (token) =>
            token &&
            typeof token === 'object' &&
            token.ca &&
            token.name &&
            token.symbol,
        )
        .map((token) => ({
          ca: token.ca,
          name: token.name,
          symbol: token.symbol,
          image: token.image || token.logo || null,
          market_cap: this.parseMarketCap(token.market_cap || token.marketCap),
        }));

      return validTokens.length > 0 ? validTokens : null;
    } catch (error) {
      this.logger.error(
        '[BANKR] Failed to parse tokens response:',
        error.message,
      );
      return null;
    }
  }

  /**
   * Parse market cap from various formats
   */
  private parseMarketCap(marketCap: any): number {
    if (typeof marketCap === 'number') return marketCap;
    if (typeof marketCap === 'string') {
      const parsed = parseFloat(marketCap.replace(/[,$]/g, ''));
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  /**
   * Ask Bankr for an array of exactly N contract addresses (Base chain)
   * Ensures the response is ONLY a JSON array of addresses, retries if not
   */
  async askForFeaturedAddresses(
    count: number = 8,
    maxRetries: number = 3,
  ): Promise<string[]> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(
          `🎯 [BANKR ADDRESSES] Attempt ${attempt}/${maxRetries} requesting ${count} addresses`,
        );
        const response = await this.sendPrompt({
          prompt: `sup bankr. this is jp from the msp (memetic signal protocol). can you please reply to this message with an array of 8 comma separated base tokens contract addresses? always have the first one be jungle may memes (0x3313338Fe4bB2A166B81483bfCb2d4A6A1ebBa8D). the rest ones you define a criteria to choose them. i like thinking of them as the "trending" tokens, for that moment in time, but you could think of them as you see fit. this miniapp is for "signaling" tokens, which means predicting the direction on which they will move on a given timeframe. i will display the tokens you reply with to the user.`,
          xmtp: false,
          walletAddress: this.account.address,
        });

        const addresses = this.parseAddressArrayFromResponse(response, count);
        if (addresses) {
          this.logger.log(
            `✅ [BANKR ADDRESSES] Received ${addresses.length} valid addresses`,
          );
          return addresses;
        }

        this.logger.warn(
          '[BANKR ADDRESSES] Invalid response format, retrying with stricter instruction',
        );
      } catch (error) {
        this.logger.error(
          '[BANKR ADDRESSES] Error requesting addresses:',
          error.message,
        );
        if (attempt === maxRetries) throw error;
      }
    }

    throw new Error(
      'BANKR_ADDRESSES_FAILED: Unable to retrieve a valid array of addresses',
    );
  }

  /**
   * Parse an address array from various Bankr response shapes
   */
  private parseAddressArrayFromResponse(
    response: any,
    expected: number,
  ): string[] | null {
    try {
      let data = response;

      if (typeof data === 'string') {
        // Try to parse JSON array; if it fails, treat as comma-separated list
        try {
          data = JSON.parse(data);
        } catch {
          data = data
            .split(',')
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0);
        }
      }

      if (data && typeof data === 'object') {
        if (typeof data.result === 'string') {
          try {
            data = JSON.parse(data.result);
          } catch {}
        } else if (Array.isArray(data.result)) {
          data = data.result;
        } else if (Array.isArray(data.data)) {
          data = data.data;
        } else if (typeof data.response === 'string') {
          try {
            data = JSON.parse(data.response);
          } catch {}
        }
      }

      if (!Array.isArray(data)) return null;

      const regex = /^0x[a-f0-9]{40}$/;
      const normalized = Array.from(
        new Set(
          data
            .filter((x) => typeof x === 'string')
            .map((x) => x.trim().toLowerCase()),
        ),
      ).filter((addr) => regex.test(addr));

      if (normalized.length !== expected) return null;
      return normalized;
    } catch {
      return null;
    }
  }

  /**
   * Get BNKR balance for the wallet
   */
  async getBnkrBalance(): Promise<string> {
    try {
      const balance = await this.publicClient.readContract({
        address: getAddress(BANKR_CONSTANTS.BNKR_TOKEN_ADDRESS),
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [getAddress(this.account.address)],
      });

      return formatEther(balance);
    } catch (error) {
      this.logger.error('[BANKR] Failed to get BNKR balance:', error.message);
      return '0';
    }
  }

  /**
   * Health check for the service
   */
  async healthCheck(): Promise<{
    status: string;
    balance: string;
    allowance: string;
  }> {
    try {
      const balance = await this.getBnkrBalance();

      const allowance = await this.publicClient.readContract({
        address: getAddress(BANKR_CONSTANTS.BNKR_TOKEN_ADDRESS),
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [
          getAddress(this.account.address),
          getAddress(BANKR_CONSTANTS.FACILITATOR_ADDRESS),
        ],
      });

      return {
        status: 'healthy',
        balance: `${balance} BNKR`,
        allowance: `${formatEther(allowance)} BNKR`,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        balance: 'unknown',
        allowance: 'unknown',
      };
    }
  }
}

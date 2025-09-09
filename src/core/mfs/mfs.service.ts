import { Injectable, Logger } from '@nestjs/common';

export interface MFSCalculationInput {
  entryMarketCap: number;
  exitMarketCap: number;
  direction: boolean; // true = UP, false = DOWN
  durationDays: number;
  isCorrect: boolean;
}

export interface MFSResult {
  mfsDelta: number;
  isCorrect: boolean;
  marketCapChange: number;
  marketCapChangePercentage: number;
  decayMultiplier: number;
}

@Injectable()
export class MFSService {
  private readonly logger = new Logger(MFSService.name);
  private readonly DECAY_CONSTANT: number;
  private readonly SCALE_FACTOR = 1e18; // Scale factor for BigInt precision

  constructor() {
    // Get decay constant from config (default to 0.888 to match your existing system)
    this.DECAY_CONSTANT = parseFloat(process.env.MSP_DECAY_CONSTANT || '0.888');
    this.logger.log(
      `Initialized MFS Service with decay constant: ${this.DECAY_CONSTANT}`,
    );
  }

  /**
   * Calculate MFS delta for a signal
   * Formula: Market Cap Change (in $USDC) × Direction × e^(-λ×(days-1))
   * Where λ = decay constant (for this system it is 0.888)
   */
  calculateMFSDelta(input: MFSCalculationInput): MFSResult {
    const {
      entryMarketCap,
      exitMarketCap,
      direction,
      durationDays,
      isCorrect,
    } = input;

    // Calculate market cap change in absolute dollars
    const marketCapChange = exitMarketCap - entryMarketCap;

    // Calculate percentage change for logging
    const marketCapChangePercentage =
      entryMarketCap > 0 ? (marketCapChange / entryMarketCap) * 100 : 0;

    // Determine direction multiplier based on correctness
    const directionMultiplier = isCorrect ? 1 : -1;

    // Calculate exponential decay multiplier
    // Day 1 signals get full multiplier (e^0 = 1)
    // Longer duration signals get exponentially reduced multiplier
    const decayExponent = -this.DECAY_CONSTANT * Math.max(0, durationDays - 1);
    const decayMultiplier = Math.exp(decayExponent);

    // Calculate raw MFS score in dollars
    const rawMFSScore = marketCapChange * directionMultiplier * decayMultiplier;

    // Convert to BigInt with scaling factor for smart contract
    const mfsDelta = Math.floor(rawMFSScore * this.SCALE_FACTOR);

    this.logger.debug(`MFS Calculation:
      Entry MC: $${entryMarketCap.toLocaleString()}
      Exit MC: $${exitMarketCap.toLocaleString()}
      Change: $${marketCapChange.toLocaleString()} (${marketCapChangePercentage.toFixed(2)}%)
      Direction: ${direction ? 'UP' : 'DOWN'}
      Duration: ${durationDays} days
      Correct: ${isCorrect}
      Decay Constant (λ): ${this.DECAY_CONSTANT}
      Decay Multiplier: ${decayMultiplier.toFixed(6)}
      MFS Delta: ${mfsDelta.toString()}`);

    return {
      mfsDelta,
      isCorrect,
      marketCapChange,
      marketCapChangePercentage,
      decayMultiplier,
    };
  }

  /**
   * Calculate batch MFS deltas for multiple signals
   */
  calculateBatchMFSDeltas(inputs: MFSCalculationInput[]): MFSResult[] {
    return inputs.map((input) => this.calculateMFSDelta(input));
  }

  /**
   * Determine if a signal prediction was correct
   */
  isPredictionCorrect(
    entryMarketCap: number,
    exitMarketCap: number,
    direction: boolean,
  ): boolean {
    const marketCapChange = exitMarketCap - entryMarketCap;

    if (direction) {
      // UP prediction - correct if market cap increased
      return marketCapChange > 0;
    } else {
      // DOWN prediction - correct if market cap decreased
      return marketCapChange < 0;
    }
  }

  /**
   * Convert BigInt MFS delta back to human-readable format
   */
  formatMFSDelta(mfsDelta: bigint): number {
    return Number(mfsDelta) / this.SCALE_FACTOR;
  }

  /**
   * Get decay multiplier for a given duration
   */
  getDecayMultiplier(durationDays: number): number {
    const decayExponent = -this.DECAY_CONSTANT * Math.max(0, durationDays - 1);
    return Math.exp(decayExponent);
  }

  /**
   * Calculate the effective scoring window (days where decay multiplier > 0.01)
   */
  getEffectiveScoringWindow(): number {
    // Find when e^(-0.075×(days-1)) = 0.01
    // -0.075×(days-1) = ln(0.01)
    // days-1 = -ln(0.01) / 0.075
    // days = 1 + (-ln(0.01) / 0.075)
    const effectiveDays = Math.ceil(1 + -Math.log(0.01) / this.DECAY_CONSTANT);
    return effectiveDays;
  }
}

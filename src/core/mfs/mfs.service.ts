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

  constructor() {
    // Get decay constant from config (default to 0.088 as per specification)
    this.DECAY_CONSTANT = parseFloat(process.env.MSP_DECAY_CONSTANT || '0.088');
    this.logger.log(
      `Initialized MFS Service with decay constant: ${this.DECAY_CONSTANT}`,
    );
  }

  /**
   * Calculate MFS delta for a signal
   * Formula: abs((exitMC - entryMC) / entryMC) × 1000 × correctnessMultiplier × e^(-λ×(days-1))
   * Where λ = 0.088 (decay constant favoring shorter-term accuracy)
   */
  calculateMFSDelta(input: MFSCalculationInput): MFSResult {
    const {
      entryMarketCap,
      exitMarketCap,
      direction,
      durationDays,
      isCorrect,
    } = input;

    // Calculate market cap change in absolute dollars for logging
    const marketCapChange = exitMarketCap - entryMarketCap;

    // Calculate percentage change
    const marketCapChangePercentage =
      entryMarketCap > 0 ? (marketCapChange / entryMarketCap) * 100 : 0;

    // Calculate absolute percentage change (as per formula)
    const absPercentageChange = entryMarketCap > 0 ? Math.abs(marketCapChange / entryMarketCap) : 0;

    // Determine correctness multiplier
    const correctnessMultiplier = isCorrect ? 1 : -1;

    // Calculate exponential decay multiplier
    // Day 1 signals get full multiplier (e^0 = 1)
    // Longer duration signals get exponentially reduced multiplier
    const decayExponent = -this.DECAY_CONSTANT * Math.max(0, durationDays - 1);
    const decayMultiplier = Math.exp(decayExponent);

    // Apply the correct MFS formula: abs((exitMC - entryMC) / entryMC) × 1000 × correctnessMultiplier × e^(-λ×(days-1))
    const mfsDelta = absPercentageChange * 1000 * correctnessMultiplier * decayMultiplier;

    this.logger.debug(`MFS Calculation:
      Entry MC: $${entryMarketCap.toLocaleString()}
      Exit MC: $${exitMarketCap.toLocaleString()}
      Change: $${marketCapChange.toLocaleString()} (${marketCapChangePercentage.toFixed(2)}%)
      Direction: ${direction ? 'UP' : 'DOWN'}
      Duration: ${durationDays} days
      Correct: ${isCorrect}
      Decay Constant (λ): ${this.DECAY_CONSTANT}
      Decay Multiplier: ${decayMultiplier.toFixed(6)}
      Abs % Change: ${absPercentageChange.toFixed(6)}
      MFS Delta: ${mfsDelta.toFixed(6)}`);

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
   * Format MFS delta for display
   */
  formatMFSDelta(mfsDelta: number): string {
    return mfsDelta.toFixed(6);
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
    // Find when e^(-0.088×(days-1)) = 0.01
    // -0.088×(days-1) = ln(0.01)
    // days-1 = -ln(0.01) / 0.088
    // days = 1 + (-ln(0.01) / 0.088)
    const effectiveDays = Math.ceil(1 + -Math.log(0.01) / this.DECAY_CONSTANT);
    return effectiveDays;
  }
}

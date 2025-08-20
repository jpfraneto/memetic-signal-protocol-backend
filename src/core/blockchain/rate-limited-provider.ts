import { JsonRpcProvider, JsonRpcApiProviderOptions } from 'ethers';

interface RateLimitOptions {
  minDelay: number; // Minimum delay between requests in ms
  maxConcurrent: number; // Maximum concurrent requests
  maxRetries: number; // Maximum retry attempts
}

export class RateLimitedProvider extends JsonRpcProvider {
  private requestQueue: Array<{
    method: string;
    params: any[];
    resolve: (value: any) => void;
    reject: (error: any) => void;
    retries: number;
  }> = [];

  private activeRequests = 0;
  private lastRequestTime = 0;
  private options: RateLimitOptions;

  constructor(
    url: string,
    network: any,
    providerOptions: JsonRpcApiProviderOptions & RateLimitOptions,
  ) {
    super(url, network, providerOptions);
    this.options = {
      minDelay: providerOptions.minDelay || 150,
      maxConcurrent: providerOptions.maxConcurrent || 2,
      maxRetries: providerOptions.maxRetries || 3,
    };
  }

  async request(method: string, params: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        method,
        params,
        resolve,
        reject,
        retries: 0,
      });

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (
      this.activeRequests >= this.options.maxConcurrent ||
      this.requestQueue.length === 0
    ) {
      return;
    }

    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.options.minDelay) {
      setTimeout(
        () => this.processQueue(),
        this.options.minDelay - timeSinceLastRequest,
      );
      return;
    }

    const request = this.requestQueue.shift();
    if (!request) return;

    this.activeRequests++;
    this.lastRequestTime = now;

    try {
      const result = await super.send(request.method, request.params);
      request.resolve(result);
    } catch (error: any) {
      if (
        this.isRetryableError(error) &&
        request.retries < this.options.maxRetries
      ) {
        // Re-queue with incremented retry count
        request.retries++;
        this.requestQueue.unshift(request);

        // Exponential backoff with jitter
        const delay =
          Math.min(1000 * Math.pow(2, request.retries), 10000) +
          Math.random() * 1000;
        setTimeout(() => this.processQueue(), delay);
      } else {
        request.reject(error);
      }
    } finally {
      this.activeRequests--;
      // Process next request after delay
      setTimeout(() => this.processQueue(), this.options.minDelay);
    }
  }

  private isRetryableError(error: any): boolean {
    const retryableMessages = [
      'rate limit',
      'too many requests',
      'exceeded its compute units per second capacity',
      'compute units per second capacity',
      'rate limited',
      'throttled',
      '429',
    ];

    const errorMessage = error?.message?.toLowerCase() || '';
    const errorCode = error?.code?.toString() || '';
    const errorBody = error?.body?.toLowerCase() || '';

    return (
      retryableMessages.some(
        (msg) => errorMessage.includes(msg) || errorBody.includes(msg),
      ) ||
      errorCode === '429' ||
      error?.error?.code === 429 ||
      error?.status === 429
    );
  }
}

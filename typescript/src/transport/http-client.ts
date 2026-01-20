/**
 * HTTP Client with retry logic and error handling
 */

import { SdkError } from '../client';

export interface HttpConfig {
  /** Base URL for API */
  baseUrl: string;
  /** Request timeout in ms */
  timeout: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Retry delay base (ms) - uses exponential backoff */
  retryDelayMs: number;
  /** Custom headers */
  headers?: Record<string, string>;
}

export const DEFAULT_HTTP_CONFIG: HttpConfig = {
  baseUrl: 'https://api.bitsage.network',
  timeout: 30000,
  maxRetries: 3,
  retryDelayMs: 1000,
};

/** Error codes that should trigger retry */
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/** HTTP error response */
export interface HttpErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * HTTP Client with automatic retry and error handling
 */
export class HttpClient {
  private config: HttpConfig;

  constructor(config: Partial<HttpConfig> = {}) {
    this.config = { ...DEFAULT_HTTP_CONFIG, ...config };
  }

  /**
   * GET request
   */
  async get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const url = this.buildUrl(path, params);
    return this.request<T>(url, { method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>(url, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * PUT request
   */
  async put<T>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>(url, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete<T>(path: string): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>(url, { method: 'DELETE' });
  }

  /**
   * Build URL with query parameters
   */
  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(path, this.config.baseUrl);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      });
    }

    return url.toString();
  }

  /**
   * Execute request with retry logic
   */
  private async request<T>(url: string, options: RequestInit): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.executeRequest(url, options);
        return response as T;
      } catch (error) {
        lastError = error as Error;

        // Don't retry non-retryable errors
        if (error instanceof SdkError && !this.isRetryable(error)) {
          throw error;
        }

        // Don't retry if we've exhausted attempts
        if (attempt === this.config.maxRetries) {
          break;
        }

        // Exponential backoff
        const delay = this.config.retryDelayMs * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Execute single request
   */
  private async executeRequest(url: string, options: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...this.config.headers,
          ...options.headers,
        },
        signal: controller.signal,
      });

      // Parse response
      const contentType = response.headers.get('content-type');
      let data: unknown;

      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      // Handle errors
      if (!response.ok) {
        const errorResponse = data as HttpErrorResponse;
        throw new SdkError(
          errorResponse.message || `HTTP ${response.status}`,
          errorResponse.code || 'API_ERROR',
          response.status
        );
      }

      return data;
    } catch (error) {
      if (error instanceof SdkError) {
        throw error;
      }

      if ((error as Error).name === 'AbortError') {
        throw new SdkError('Request timeout', 'TIMEOUT');
      }

      throw new SdkError(
        (error as Error).message || 'Network error',
        'NETWORK_ERROR'
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(error: SdkError): boolean {
    if (error.statusCode && RETRYABLE_STATUS_CODES.includes(error.statusCode)) {
      return true;
    }
    if (error.code === 'TIMEOUT' || error.code === 'NETWORK_ERROR') {
      return true;
    }
    return false;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HttpConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): HttpConfig {
    return { ...this.config };
  }
}

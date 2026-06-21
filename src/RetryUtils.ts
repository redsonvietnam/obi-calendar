/**
 * RetryUtils.ts
 * 
 * Utility for implementing exponential backoff and retries for API requests.
 */

export interface RetryOptions {
    maxRetries: number;
    initialDelay: number; // ms
    backoffFactor: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
    maxRetries: 3,
    initialDelay: 1000,
    backoffFactor: 2
};

export class RetryUtils {
    /**
     * Executes a function with exponential backoff retry logic.
     */
    static async withRetry<T>(
        fn: () => Promise<T>,
        options: RetryOptions = DEFAULT_RETRY_OPTIONS,
        onRetry?: (attempt: number, error: any) => void
    ): Promise<T> {
        let attempt = 0;
        let delay = options.initialDelay;

        while (true) {
            try {
                return await fn();
            } catch (error: any) {
                attempt++;
                
                // Don't retry if it's a non-transient error (e.g. 400, 401, 403, 404)
                if (error.apiError && ![429, 500, 502, 503, 504].includes(error.apiError.code)) {
                    throw error;
                }

                if (attempt >= options.maxRetries) {
                    throw error;
                }

                if (onRetry) {
                    onRetry(attempt, error);
                }

                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= options.backoffFactor;
            }
        }
    }
}

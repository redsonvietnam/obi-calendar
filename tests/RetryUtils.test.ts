import { RetryUtils, RetryOptions } from "../src/RetryUtils";

describe("RetryUtils", () => {
    describe("withRetry", () => {
        test("should return result on first success", async () => {
            const fn = jest.fn().mockResolvedValue("success");
            const result = await RetryUtils.withRetry(fn);
            expect(result).toBe("success");
            expect(fn).toHaveBeenCalledTimes(1);
        });

        test("should retry on transient error (500) and succeed", async () => {
            const fn = jest.fn()
                .mockRejectedValueOnce({ apiError: { code: 500 } })
                .mockResolvedValue("recovered");

            const onRetry = jest.fn();
            const result = await RetryUtils.withRetry(
                fn,
                { maxRetries: 3, initialDelay: 10, backoffFactor: 2 },
                onRetry
            );

            expect(result).toBe("recovered");
            expect(fn).toHaveBeenCalledTimes(2);
            expect(onRetry).toHaveBeenCalledWith(1, { apiError: { code: 500 } });
        });

        test("should retry on rate limit (429) and succeed", async () => {
            const fn = jest.fn()
                .mockRejectedValueOnce({ apiError: { code: 429 } })
                .mockResolvedValue("recovered");

            const result = await RetryUtils.withRetry(
                fn,
                { maxRetries: 3, initialDelay: 10, backoffFactor: 2 }
            );

            expect(result).toBe("recovered");
            expect(fn).toHaveBeenCalledTimes(2);
        });

        test("should NOT retry on non-transient error (400)", async () => {
            const fn = jest.fn().mockRejectedValue({ apiError: { code: 400 } });

            await expect(
                RetryUtils.withRetry(
                    fn,
                    { maxRetries: 3, initialDelay: 10, backoffFactor: 2 }
                )
            ).rejects.toEqual({ apiError: { code: 400 } });

            expect(fn).toHaveBeenCalledTimes(1);
        });

        test("should NOT retry on 401 error", async () => {
            const fn = jest.fn().mockRejectedValue({ apiError: { code: 401 } });

            await expect(
                RetryUtils.withRetry(fn, { maxRetries: 3, initialDelay: 10, backoffFactor: 2 })
            ).rejects.toEqual({ apiError: { code: 401 } });

            expect(fn).toHaveBeenCalledTimes(1);
        });

        test("should NOT retry on 404 error", async () => {
            const fn = jest.fn().mockRejectedValue({ apiError: { code: 404 } });

            await expect(
                RetryUtils.withRetry(fn, { maxRetries: 3, initialDelay: 10, backoffFactor: 2 })
            ).rejects.toEqual({ apiError: { code: 404 } });

            expect(fn).toHaveBeenCalledTimes(1);
        });

        test("should exhaust retries and throw", async () => {
            const fn = jest.fn().mockRejectedValue({ apiError: { code: 500 } });

            await expect(
                RetryUtils.withRetry(
                    fn,
                    { maxRetries: 2, initialDelay: 10, backoffFactor: 2 }
                )
            ).rejects.toEqual({ apiError: { code: 500 } });

            expect(fn).toHaveBeenCalledTimes(2);
        });

        test("should retry on 502 and 503 errors", async () => {
            const fn502 = jest.fn()
                .mockRejectedValueOnce({ apiError: { code: 502 } })
                .mockResolvedValue("ok");
            const result502 = await RetryUtils.withRetry(fn502, { maxRetries: 3, initialDelay: 10, backoffFactor: 2 });
            expect(result502).toBe("ok");

            const fn503 = jest.fn()
                .mockRejectedValueOnce({ apiError: { code: 503 } })
                .mockResolvedValue("ok");
            const result503 = await RetryUtils.withRetry(fn503, { maxRetries: 3, initialDelay: 10, backoffFactor: 2 });
            expect(result503).toBe("ok");
        });

        test("should retry on error without apiError property", async () => {
            const fn = jest.fn()
                .mockRejectedValueOnce(new Error("network timeout"))
                .mockResolvedValue("recovered");

            const result = await RetryUtils.withRetry(
                fn,
                { maxRetries: 3, initialDelay: 10, backoffFactor: 2 }
            );

            expect(result).toBe("recovered");
            expect(fn).toHaveBeenCalledTimes(2);
        });

        test("should use default options when none provided", async () => {
            const fn = jest.fn().mockResolvedValue("ok");
            const result = await RetryUtils.withRetry(fn);
            expect(result).toBe("ok");
        });
    });
});

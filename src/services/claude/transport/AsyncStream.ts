/**
 * AsyncStream - Single-use async iterator for producer/consumer patterns (ISSUE-006)
 *
 * IMPORTANT: This stream can only be iterated ONCE.
 * Once consumed, the values are gone - this is by design for streaming data.
 *
 * Use cases:
 * 1. Extension receives messages from WebView
 * 2. Extension sends user messages to SDK
 * 3. WebView receives messages from Extension
 *
 * Features:
 * - Async iteration support (for await...of)
 * - Automatic backpressure via queue buffering
 * - Manual stream completion
 * - Error propagation
 *
 * If you need to:
 * - Re-read values: Collect into array during first iteration
 * - Share with multiple consumers: Use a tee/broadcast pattern
 *
 * @example Single iteration (correct)
 * ```typescript
 * const stream = new AsyncStream<string>();
 * stream.enqueue('value1');
 * stream.enqueue('value2');
 * stream.done();
 *
 * // Iterate once
 * for await (const value of stream) {
 *   console.log(value);
 * }
 * ```
 *
 * @example Collecting for reuse (correct)
 * ```typescript
 * const values: string[] = [];
 * for await (const value of stream) {
 *   values.push(value);
 *   process(value);
 * }
 * // Now `values` can be iterated multiple times
 * ```
 *
 * @example Multiple iterations (WRONG - throws error)
 * ```typescript
 * for await (const value of stream) { }
 * for await (const value of stream) { } // Error!
 * ```
 */

export class AsyncStream<T> implements AsyncIterable<T>, AsyncIterator<T> {
    private queue: T[] = [];
    private readResolve?: (value: IteratorResult<T>) => void;
    private readReject?: (error: any) => void;
    private isDone = false;
    private hasError?: any;
    private started = false;
    private returned?: () => void;

    constructor(returned?: () => void) {
        this.returned = returned;
    }

    /**
     * Returns true if the stream has been fully consumed (ISSUE-006)
     * Useful for checking state before attempting iteration.
     */
    get isExhausted(): boolean {
        return this.started && this.isDone && this.queue.length === 0;
    }

    /**
     * Returns true if iteration has started (ISSUE-006)
     */
    get hasStarted(): boolean {
        return this.started;
    }

    /**
     * Implement async iterable protocol (ISSUE-006)
     *
     * @throws {Error} If stream has already been iterated
     */
    [Symbol.asyncIterator](): AsyncIterator<T> {
        if (this.started) {
            throw new Error(
                'AsyncStream can only be iterated once. ' +
                'If you need to re-read values, collect them into an array during the first iteration: ' +
                '`const values = []; for await (const v of stream) { values.push(v); }`'
            );
        }
        this.started = true;
        return this;
    }

    /**
     * 获取下一个值（消费者 API）
     */
    async next(): Promise<IteratorResult<T>> {
        // 1. 如果队列有数据，立即返回
        if (this.queue.length > 0) {
            return { done: false, value: this.queue.shift()! };
        }

        // 2. 如果流已结束，返回完成标志
        if (this.isDone) {
            return { done: true, value: undefined as any };
        }

        // 3. 如果有错误，拒绝 Promise
        if (this.hasError) {
            throw this.hasError;
        }

        // 4. 等待新数据到来
        return new Promise<IteratorResult<T>>((resolve, reject) => {
            this.readResolve = resolve;
            this.readReject = reject;
        });
    }

    /**
     * 生产数据（生产者 API）
     */
    enqueue(value: T): void {
        // 如果有消费者在等待，直接满足
        if (this.readResolve) {
            const resolve = this.readResolve;
            this.readResolve = undefined;
            this.readReject = undefined;
            resolve({ done: false, value });
        } else {
            // 否则加入队列
            this.queue.push(value);
        }
    }

    /**
     * 标记流为完成状态
     */
    done(): void {
        this.isDone = true;

        // 如果有消费者在等待，通知完成
        if (this.readResolve) {
            const resolve = this.readResolve;
            this.readResolve = undefined;
            this.readReject = undefined;
            resolve({ done: true, value: undefined as any });
        }
    }

    /**
     * 设置错误状态
     */
    error(error: any): void {
        this.hasError = error;

        // 如果有消费者在等待，拒绝 Promise
        if (this.readReject) {
            const reject = this.readReject;
            this.readResolve = undefined;
            this.readReject = undefined;
            reject(error);
        }
    }

    /**
     * 清理资源
     */
    async return(): Promise<IteratorResult<T>> {
        this.isDone = true;
        if (this.returned) {
            this.returned();
        }
        return { done: true, value: undefined as any };
    }

    /**
     * 静态工厂方法：从数组创建流
     */
    static from<T>(items: T[]): AsyncStream<T> {
        const stream = new AsyncStream<T>();
        for (const item of items) {
            stream.enqueue(item);
        }
        stream.done();
        return stream;
    }
}

/**
 * 使用示例：
 *
 * // 生产者
 * const stream = new AsyncStream<string>();
 * setTimeout(() => stream.enqueue("msg1"), 100);
 * setTimeout(() => stream.enqueue("msg2"), 200);
 * setTimeout(() => stream.done(), 300);
 *
 * // 消费者
 * for await (const msg of stream) {
 *     console.log(msg);  // "msg1", "msg2"
 * }
 */

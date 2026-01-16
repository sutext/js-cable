import { CoderError } from './coder';
import * as packet from './packet';

// Default options
const defaultOpts = {
    pingInterval: 30 * 1000, // 30 seconds
    pingTimeout: 5 * 1000, // 5 seconds
    requestTimeout: 10 * 1000, // 10 seconds
    messageTimeout: 10 * 1000, // 10 seconds
    messageMaxRetry: 5,
};
/**
 * Connection status enum
 */
export enum Status {
    /**
     * Connection status is unknown
     */
    Unknown = 0,
    /**
     * Connection is being established
     */
    Opening = 1,
    /**
     * Connection is established and ready
     */
    Opened = 2,
    /**
     * Connection is closing
     */
    Closing = 3,
    /**
     * Connection is closed
     */
    Closed = 4,
}

/**
 * Handler interface for client events
 */
export interface Handler {
    /**
     * Called when connection status changes
     * @param status New connection status
     */
    onStatus(status: Status): void;
    /**
     * Called when a message is received
     * @param message Received message
     */
    onMessage(message: packet.Message): void;
    /**
     * Called when a request is received
     * @param request Received request
     * @returns Response to send back
     */
    onRequest(request: packet.Request): packet.Response;
}

/**
 * Client options interface
 */
export interface Options {
    /**
     * Ping interval in milliseconds
     */
    pingInterval?: number;
    /**
     * Ping timeout in milliseconds
     */
    pingTimeout?: number;
    /**
     * Request timeout in milliseconds
     */
    requestTimeout?: number;
    /**
     * Message timeout in milliseconds
     */
    messageTimeout?: number;
    /**
     * Maximum number of message retries
     */
    messageMaxRetry?: number;
    /**
     * Event handler for client events
     */
    handler?: Handler;
}

// Default handler implementation
class DefaultHandler implements Handler {
    onStatus(_status: Status): void {}
    onMessage(_message: packet.Message): void {}
    onRequest(_request: packet.Request): packet.Response {
        throw new Error('not implemented');
    }
}

/**
 * CableError represents an error that occurs during cable operations
 */
export class CableError extends Error {
    /**
     * Creates a new CableError instance
     * @param message Error message
     */
    constructor(message: string) {
        super(message);
        this.name = 'CableError';
    }
    /**
     * Connection is not ready
     */
    static NotReady = new CableError('connection not ready');
    /**
     * Request timed out
     */
    static RequestTimeout = new CableError('request timeout');
    /**
     * Message timed out
     */
    static MessageTimeout = new CableError('message timeout');
}

/**
 * Client class for cable connection management
 */
export class Client {
    private _url: string;
    private _identity: packet.Identity | null = null;
    private _conn: WebSocket | null = null;
    private _status: Status = Status.Unknown;
    private _handler: Handler;
    private _pingInterval: number;
    private _pingTimeout: number;
    private _requestTimeout: number;
    private _messageTimeout: number;
    private _pingTimer: any | null = null;
    private _pingTimeoutTimer: any | null = null;
    private _pongReceived: boolean = true;
    private _requestTasks: Map<number, (respOrError: packet.Response | Error) => void> = new Map();
    private _messageTasks: Map<number, (ackOrError: packet.Messack | Error) => void> = new Map();
    private _messageMaxRetry: number;
    private _messageId: number = 0;
    private _requestId: number = 0;
    private _retrying: boolean = false;
    private _retrier: Retrier | null = null;
    /**
     * Creates a new Client instance
     * @param url WebSocket server URL
     * @param options Client options
     */
    constructor(url: string, options: Options = {}) {
        const opts = { ...defaultOpts, ...options };
        this._url = url;
        this._handler = options.handler || new DefaultHandler();
        this._pingInterval = opts.pingInterval!;
        this._pingTimeout = opts.pingTimeout!;
        this._requestTimeout = opts.requestTimeout!;
        this._messageTimeout = opts.messageTimeout!;
        this._messageMaxRetry = opts.messageMaxRetry!;
    }

    /**
     * Gets the client identity
     */
    get id(): packet.Identity | null {
        return this._identity;
    }

    /**
     * Gets the current connection status
     */
    get status(): Status {
        return this._status;
    }

    /**
     * Checks if the connection is ready
     */
    get isReady(): boolean {
        return this._status === Status.Opened;
    }

    /**
     * Connects to the cable server
     * @param identity Client identity information
     */
    public connect(identity: packet.Identity) {
        if (this._status === Status.Opened || this._status === Status.Opening) {
            return;
        }
        this._identity = identity;
        this.setStatus(Status.Opening);
        this.reconnect();
    }

    /**
     * Closes the connection
     * @param code Optional close code
     */
    public close(code?: packet.CloseCode) {
        if (this._status === Status.Closed || this._status === Status.Closing) {
            return;
        }
        this.setStatus(Status.Closing);
        if (code) {
            try {
                this.sendPacket(new packet.Close(code));
            } catch (error) {
                console.error(error);
            }
        }
        this.setStatus(Status.Closed);
    }
    /**
     * Configures automatic reconnection
     * @param opts Retry options
     */
    public autoRetry(opts: { limit?: number; backoff?: Backoff; filter?: RetryFilter }): void {
        this._retrier = new Retrier(opts.limit, opts.backoff, opts.filter);
    }
    /**
     * Sends a message to the server
     * @param msg Message to send
     * @returns Promise that resolves when the message is sent (or acknowledged for QoS 1)
     */
    public send(msg: {
        qos?: packet.MessageQos;
        kind?: packet.MessageKind;
        props?: Map<packet.Property, string>;
        payload?: Uint8Array;
    }): Promise<void> {
        const qos = msg.qos || 0;
        if (qos == 0) {
            const message = new packet.Message(0, qos, msg.kind, msg.payload, msg.props);
            return this._sendMessage(message);
        }
        const id = this._messageId++ / (2 ** 16 - 1);
        const message = new packet.Message(id, msg.qos, msg.kind, msg.payload, msg.props);
        return this._sendMessage1(message, 0);
    }
    private _sendMessage1(p: packet.Message, retries: number): Promise<void> {
        if (retries > this._messageMaxRetry) {
            throw new Error('max retries exceeded');
        }
        return this._sendMessage(p).catch((error) => {
            if (error === CableError.MessageTimeout) {
                p.dup = true;
                return this._sendMessage1(p, retries + 1);
            }
            throw error;
        });
    }
    private _sendMessage(p: packet.Message): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.isReady) {
                reject(CableError.NotReady);
                return;
            }
            if (p.qos === 1) {
                const timeout = setTimeout(() => {
                    this._requestTasks.delete(p.id);
                    reject(CableError.MessageTimeout);
                }, this._messageTimeout);
                this._messageTasks.set(p.id, (ack) => {
                    clearTimeout(timeout);
                    if (ack instanceof Error) {
                        reject(ack);
                    } else {
                        resolve();
                    }
                });
                this.sendPacket(p);
            } else {
                this.sendPacket(p);
                resolve();
            }
        });
    }
    /**
     * Sends a request to the server and waits for a response
     * @param method Request method
     * @param body Request body
     * @param props Request properties
     * @returns Promise that resolves with the response
     */
    public request(method: string, body: Uint8Array, props: Map<packet.Property, string> | null = null): Promise<packet.Response> {
        const id = this._requestId++ / (2 ** 16 - 1);
        const p = new packet.Request(id, method, body, props);
        return new Promise((resolve, reject) => {
            if (!this.isReady) {
                reject(CableError.NotReady);
                return;
            }
            const timeout = setTimeout(() => {
                this._requestTasks.delete(p.id);
                reject(CableError.RequestTimeout);
            }, this._requestTimeout);
            this._requestTasks.set(p.id, (response) => {
                clearTimeout(timeout);
                if (response instanceof Error) {
                    reject(response);
                    return;
                }
                if (response.code === packet.StatusCode.OK) {
                    resolve(response);
                } else {
                    reject(new Error(packet.StatusCode[response.code]));
                }
            });
            this.sendPacket(p);
        });
    }

    private reconnect(): void {
        if (this._status != Status.Opening) {
            return;
        }
        try {
            if (this._conn) {
                this._conn.close();
            }
            this._conn = new WebSocket(this._url, 'cable');
            this._conn.binaryType = 'arraybuffer';
            this._conn.onopen = () => {
                this.onWebSocketOpen();
            };
            this._conn.onmessage = (event) => {
                this.onWebSocketData(event);
            };
            this._conn.onclose = (event) => {
                this.retryWhen(new NetworkError(event));
            };
            this._conn.onerror = (event) => {
                this.retryWhen(new NetworkError(event));
            };
        } catch (error: any) {
            this.retryWhen(new NetworkError(undefined, error));
        }
    }

    private onWebSocketOpen(): void {
        if (!this._identity) {
            return;
        }
        try {
            const connectPacket = new packet.Connect(this._identity);
            const bytes = packet.encode(connectPacket);
            this._conn?.send(bytes);
        } catch (error: any) {
            this.retryWhen(error);
        }
    }

    private onWebSocketData(event: MessageEvent<ArrayBuffer>): void {
        const bytes = new Uint8Array(event.data);
        try {
            const p = packet.decode(bytes);
            this.handlePacket(p);
        } catch (error) {
            if (error instanceof packet.PacketError) {
                this.retryWhen(new NetworkError(undefined, error));
            } else if (error instanceof CoderError) {
                this.retryWhen(new NetworkError(undefined, error));
            }
            console.error(error);
        }
    }
    private retryWhen(reason: Reason): void {
        if (this._retrying) {
            return;
        }
        this.clearAllTasks(reason);
        if (this.status === Status.Closed || this.status === Status.Closing) {
            return;
        }
        if (!this._retrier) {
            this.setStatus(Status.Closed);
            return;
        }
        const [delay, shouldRetry] = this._retrier.shouldRetry(reason);
        if (!shouldRetry) {
            this.setStatus(Status.Closed);
            return;
        }
        this._retrying = true;
        this.setStatus(Status.Opening);
        console.debug(`cable client will retry aftter ${delay}ms...`);
        setTimeout(() => {
            this.reconnect();
            this._retrying = false;
        }, delay);
    }

    private handlePacket(p: packet.Packet): void {
        switch (p.type) {
            case packet.PacketType.CONNECT:
                break;
            case packet.PacketType.CONNACK:
                this.handleConnack(p as packet.Connack);
                break;
            case packet.PacketType.MESSAGE:
                this.handleMessage(p as packet.Message);
                break;
            case packet.PacketType.MESSACK:
                this.handleMessack(p as packet.Messack);
                break;
            case packet.PacketType.REQUEST:
                this.handleRequest(p as packet.Request);
                break;
            case packet.PacketType.RESPONSE:
                this.handleResponse(p as packet.Response);
                break;
            case packet.PacketType.PING:
                this.sendPacket(new packet.Pong());
                break;
            case packet.PacketType.PONG:
                this.handlePong(p as packet.Pong);
                break;
            case packet.PacketType.CLOSE:
                this.retryWhen(new ServerClosed((p as packet.Close).code));
                break;
            default:
                throw packet.PacketError.UnknownPacketType;
        }
    }

    private handleConnack(connack: packet.Connack): void {
        if (connack.code !== packet.ConnackCode.Accepted) {
            this.retryWhen(new ConnectFailed(connack.code));
            return;
        }
        this.setStatus(Status.Opened);
        this.startPingTimer();
    }

    private handleMessage(message: packet.Message): void {
        this._handler.onMessage(message);
        if (message.qos === 1) {
            this.sendPacket(message.ack());
        }
    }

    private handleMessack(messack: packet.Messack): void {
        const callback = this._messageTasks.get(messack.id);
        if (callback) {
            this._messageTasks.delete(messack.id);
            callback(messack);
        }
    }

    private handleRequest(request: packet.Request): void {
        const response = this._handler.onRequest(request);
        this.sendPacket(response);
    }

    private handleResponse(response: packet.Response): void {
        const callback = this._requestTasks.get(response.id);
        if (callback) {
            this._requestTasks.delete(response.id);
            callback(response);
        }
    }

    private handlePong(_pong: packet.Pong): void {
        this._pongReceived = true;
        if (this._pingTimeoutTimer) {
            clearTimeout(this._pingTimeoutTimer);
        }
    }

    private sendPacket(p: packet.Packet): void {
        if (!this.isReady) {
            throw CableError.NotReady;
        }
        if (this._conn) {
            this._conn.send(packet.encode(p));
        }
    }
    private clearAllTasks(error: Error) {
        this._requestTasks.forEach((callback) => {
            callback(error);
        });
        this._messageTasks.forEach((callback) => {
            callback(error);
        });
        this._requestTasks.clear();
        this._messageTasks.clear();
    }
    private setStatus(status: Status): void {
        if (this._status === status) {
            return;
        }
        console.debug(`client status change: ${Status[this._status]} -> ${Status[status]}`);
        this._status = status;
        switch (status) {
            case Status.Opening:
                break;
            case Status.Opened:
                if (this._retrier) {
                    this._retrier.reset();
                }
                this.startPingTimer();
                break;
            case Status.Closing:
                break;
            case Status.Closed:
                this.closePingTimer();
                if (this._conn) {
                    this._conn.close();
                    this._conn = null;
                }
                this._requestTasks.clear();
                this._messageTasks.clear();
                break;
        }
        this._handler.onStatus(status);
    }

    private startPingTimer(): void {
        if (this._pingTimer) {
            clearInterval(this._pingTimer);
        }
        this._pingTimer = setInterval(() => {
            if (!this.isReady) {
                return;
            }
            this._pongReceived = false;
            this.sendPacket(new packet.Ping());
            this._pingTimeoutTimer = setTimeout(() => {
                if (!this._pongReceived) {
                    this.retryWhen(new PingTimeout());
                }
            }, this._pingTimeout);
        }, this._pingInterval);
    }

    private closePingTimer(): void {
        if (this._pingTimer) {
            clearInterval(this._pingTimer);
            this._pingTimer = null;
        }
        if (this._pingTimeoutTimer) {
            clearTimeout(this._pingTimeoutTimer);
            this._pingTimeoutTimer = null;
        }
    }
}
/**
 * Backoff interface for defining retry delay strategies
 */
export interface Backoff {
    /**
     * Calculates the next delay for retries
     * @param count Current retry count
     * @returns Delay in seconds
     */
    next(count: number): number;
}

/**
 * RetryFilter is a function that determines if a retry should be attempted
 * @param r Reason for the retry attempt
 * @returns True if retry should be attempted, false otherwise
 */
export type RetryFilter = (r: Reason) => boolean;

/**
 * Retrier manages retry logic with configurable backoff strategies
 */
export class Retrier {
    private limit: number;
    private count: number = 0;
    private filter: RetryFilter | null = null;
    private backoff: Backoff;
    /**
     * Creates a new Retrier instance
     * @param limit Maximum number of retry attempts
     * @param backoff Backoff strategy to use
     * @param filter Filter function to determine if retry should be attempted
     */
    constructor(limit: number = Number.MAX_SAFE_INTEGER, backoff: Backoff = ExponentialBackoff.default, filter: RetryFilter | null = null) {
        this.limit = limit;
        this.backoff = backoff;
        this.filter = filter;
    }
    /**
     * Resets the retry count
     */
    public reset(): void {
        this.count = 0;
    }
    /**
     * Determines if a retry should be attempted and calculates the delay
     * @param e Reason for the retry attempt
     * @returns Tuple of [delay in milliseconds, shouldRetry boolean]
     */
    public shouldRetry(e: Reason): [number, boolean] {
        if (this.filter && this.filter(e)) {
            return [0, false];
        }
        if (this.count >= this.limit) {
            return [0, false];
        }
        this.count++;
        return [this.backoff.next(this.count) * 1000, true];
    }
}
/**
 * ExponentialBackoff implements an exponential backoff strategy
 */
export class ExponentialBackoff implements Backoff {
    private factor: number;
    private jitter: number;
    /**
     * Creates a new ExponentialBackoff instance
     * @param factor Exponential factor
     * @param jitter Jitter factor (0-1)
     */
    constructor(factor: number, jitter: number) {
        this.factor = factor;
        this.jitter = jitter;
    }
    /**
     * Calculates the next delay using exponential backoff
     * @param count Current retry count
     * @returns Delay in seconds
     */
    public next(count: number): number {
        const delay = Math.pow(this.factor, count - 1);
        return delay + (Math.random() * 2 - 1) * this.jitter * delay;
    }
    /**
     * Default exponential backoff configuration (factor=2, jitter=0.1)
     */
    static default = new ExponentialBackoff(2, 0.1);
}
/**
 * LinearBackoff implements a linear backoff strategy
 */
export class LinearBackoff implements Backoff {
    private factor: number;
    private jitter: number;
    /**
     * Creates a new LinearBackoff instance
     * @param factor Linear factor
     * @param jitter Jitter factor (0-1)
     */
    constructor(factor: number, jitter: number) {
        this.factor = factor;
        this.jitter = jitter;
    }
    /**
     * Calculates the next delay using linear backoff
     * @param count Current retry count
     * @returns Delay in seconds
     */
    public next(count: number): number {
        const delay = this.factor * count;
        return delay + (Math.random() * 2 - 1) * this.jitter * delay;
    }
    /**
     * Default linear backoff configuration (factor=2, jitter=0.1)
     */
    static default = new LinearBackoff(2, 0.1);
}
/**
 * RandomBackoff implements a random backoff strategy
 */
export class RandomBackoff implements Backoff {
    private min: number;
    private max: number;
    private jitter: number;
    /**
     * Creates a new RandomBackoff instance
     * @param min Minimum delay in seconds
     * @param max Maximum delay in seconds
     * @param jitter Jitter factor (0-1)
     */
    constructor(min: number, max: number, jitter: number) {
        this.min = min;
        this.max = max;
        this.jitter = jitter;
    }
    /**
     * Calculates the next delay using random backoff
     * @param count Current retry count
     * @returns Delay in seconds
     */
    public next(count: number): number {
        const delay = this.min + Math.random() * (this.max - this.min);
        return delay + (Math.random() * 2 - 1) * this.jitter * delay;
    }
    /**
     * Default random backoff configuration (min=2, max=5, jitter=0.1)
     */
    static default = new RandomBackoff(2, 5, 0.1);
}
/**
 * ConstBackoff implements a constant backoff strategy
 */
export class ConstBackoff implements Backoff {
    private delay: number;
    /**
     * Creates a new ConstBackoff instance
     * @param delay Constant delay in seconds
     */
    constructor(delay: number) {
        this.delay = delay;
    }
    /**
     * Returns the constant delay
     * @param _count Current retry count (ignored for constant backoff)
     * @returns Constant delay in seconds
     */
    public next(_count: number): number {
        return this.delay;
    }
    /**
     * Default constant backoff configuration (delay=5 seconds)
     */
    static default = new ConstBackoff(5);
}
/**
 * ReasonType enumerates the possible reasons for connection failures
 */
export enum ReasonType {
    /**
     * Connection failed during handshake
     */
    connectFailed = 0,
    /**
     * Server closed the connection
     */
    serverClosed = 1,
    /**
     * Network error occurred
     */
    networkError = 2,
    /**
     * Ping timeout occurred
     */
    pingTimeout = 3,
}

/**
 * Reason is the base class for connection failure reasons
 */
export class Reason extends Error {
    /**
     * Gets the reason type
     */
    get type(): ReasonType {
        throw new Error('not implemented');
    }
}

/**
 * ConnectFailed reason for failed connection attempts
 */
export class ConnectFailed extends Reason {
    readonly ackcode: packet.ConnackCode;
    /**
     * Gets the reason type
     */
    get type(): ReasonType {
        return ReasonType.connectFailed;
    }
    /**
     * Creates a new ConnectFailed instance
     * @param ackcode Connection acknowledgment code
     */
    constructor(ackcode: packet.ConnackCode) {
        super(`connect failed: ${packet.ConnackCode[ackcode]}`);
        this.name = 'ConnectFailed';
        this.ackcode = ackcode;
    }
}

/**
 * ServerClosed reason when server closes the connection
 */
export class ServerClosed extends Reason {
    readonly code: packet.CloseCode;
    /**
     * Gets the reason type
     */
    get type(): ReasonType {
        return ReasonType.serverClosed;
    }
    /**
     * Creates a new ServerClosed instance
     * @param code Close code from server
     */
    constructor(code: packet.CloseCode) {
        super(`server closed: ${packet.CloseCode[code]}`);
        this.name = 'ServerClosed';
        this.code = code;
    }
}

/**
 * NetworkError reason for network-related failures
 */
export class NetworkError extends Reason {
    readonly error?: Error;
    readonly event?: Event;
    /**
     * Gets the reason type
     */
    get type(): ReasonType {
        return ReasonType.networkError;
    }
    /**
     * Creates a new NetworkError instance
     * @param event Optional network event
     * @param error Optional error object
     */
    constructor(event?: Event, error?: Error) {
        super(`network error: ${error?.message},event: ${event?.type}`);
        this.name = 'NetworkReason';
        this.event = event;
        this.error = error;
    }
    /**
     * Gets the close code if available
     */
    get closeCode(): number | undefined {
        if (this.event && this.event instanceof CloseEvent) {
            return this.event.code;
        }
        return undefined;
    }
}

/**
 * PingTimeout reason when ping response is not received in time
 */
export class PingTimeout extends Reason {
    /**
     * Gets the reason type
     */
    get type(): ReasonType {
        return ReasonType.pingTimeout;
    }
    /**
     * Creates a new PingTimeout instance
     */
    constructor() {
        super('ping timeout');
        this.name = 'PingTimeout';
    }
}

import { CoderError } from './coder';
import * as packet from './packet';

// Default options
const defaultOpts = {
    pingInterval: 30 * 1000, // 30 seconds
    pingTimeout: 5 * 1000, // 5 seconds
    requestTimeout: 10 * 1000, // 10 seconds
    messageTimeout: 10 * 1000, // 10 seconds
};
// Connection status
export enum Status {
    Unknown = 0,
    Opening = 1,
    Opened = 2,
    Closing = 3,
    Closed = 4,
}
// Handler interface
export interface Handler {
    onStatus(status: Status): void;
    onMessage(message: packet.Message): void;
    onRequest(request: packet.Request): packet.Response;
}

// Options interface
export interface Options {
    pingInterval?: number;
    pingTimeout?: number;
    requestTimeout?: number;
    messageTimeout?: number;
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

// Client implementation
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
    private _pingTimer: number | null = null;
    private _pingTimeoutTimer: number | null = null;
    private _pongReceived: boolean = true;
    private _requestTasks: Map<bigint, (response: packet.Response) => void> = new Map();
    private _messageTasks: Map<bigint, (msgack: packet.Messack) => void> = new Map();
    private _retrying: boolean = false;
    private _retrier: Retrier | null = null;
    constructor(url: string, options: Options = {}) {
        const opts = { ...defaultOpts, ...options };
        this._url = url;
        this._handler = options.handler || new DefaultHandler();
        this._pingInterval = opts.pingInterval!;
        this._pingTimeout = opts.pingTimeout!;
        this._requestTimeout = opts.requestTimeout!;
        this._messageTimeout = opts.messageTimeout!;
    }

    get id(): packet.Identity | null {
        return this._identity;
    }

    get status(): Status {
        return this._status;
    }

    get isReady(): boolean {
        return this._status === Status.Opened;
    }

    public connect(identity: packet.Identity) {
        if (this._status === Status.Opened || this._status === Status.Opening) {
            return;
        }
        this._identity = identity;
        this.setStatus(Status.Opening);
        this.reconnect();
    }

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
    public autoRetry(opts: { limit?: number; backoff?: Backoff; filter?: RetryFilter }): void {
        this._retrier = new Retrier(opts.limit, opts.backoff, opts.filter);
    }
    public sendMessage(p: packet.Message): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.isReady) {
                reject(new Error('connection not ready'));
                return;
            }
            if (p.qos === 1) {
                const timeout = setTimeout(() => {
                    this._requestTasks.delete(p.id);
                    reject(new Error('msg timeout'));
                }, this._messageTimeout);
                this._messageTasks.set(p.id, (ack) => {
                    clearTimeout(timeout);
                    resolve();
                });
                this.sendPacket(p);
            } else {
                this.sendPacket(p);
                resolve();
            }
        });
    }

    public sendRequest(p: packet.Request): Promise<packet.Response> {
        return new Promise((resolve, reject) => {
            if (!this.isReady) {
                reject(new Error('connection not ready'));
                return;
            }
            const timeout = setTimeout(() => {
                this._requestTasks.delete(p.id);
                reject(new Error('request timeout'));
            }, this._requestTimeout);

            this._requestTasks.set(p.id, (response) => {
                clearTimeout(timeout);
                resolve(response);
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
                this.retryWhen(new NetworkReason(event));
            };
            this._conn.onerror = (event) => {
                this.retryWhen(new NetworkReason(event));
            };
        } catch (error: any) {
            this.retryWhen(new NetworkReason(undefined, error));
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
                this.retryWhen(new NetworkReason(undefined, error));
            } else if (error instanceof CoderError) {
                this.retryWhen(new NetworkReason(undefined, error));
            }
            console.error(error);
        }
    }
    private retryWhen(reason: Reason): void {
        if (this._retrying) {
            return;
        }
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
            throw new Error('connection not ready');
        }
        if (this._conn) {
            this._conn.send(packet.encode(p));
        }
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
export interface Backoff {
    next(count: number): number;
}
export type RetryFilter = (r: Reason) => boolean;
export class Retrier {
    private limit: number;
    private count: number = 0;
    private filter: RetryFilter | null = null;
    private backoff: Backoff;
    constructor(limit: number = Number.MAX_SAFE_INTEGER, backoff: Backoff = ExponentialBackoff.default, filter: RetryFilter | null = null) {
        this.limit = limit;
        this.backoff = backoff;
        this.filter = filter;
    }
    public reset(): void {
        this.count = 0;
    }
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
export class ExponentialBackoff implements Backoff {
    private factor: number;
    private jitter: number;
    constructor(factor: number, jitter: number) {
        this.factor = factor;
        this.jitter = jitter;
    }
    public next(count: number): number {
        const delay = Math.pow(this.factor, count - 1);
        return delay + (Math.random() * 2 - 1) * this.jitter * delay;
    }
    static default = new ExponentialBackoff(2, 0.1);
}
export class LinearBackoff implements Backoff {
    private factor: number;
    private jitter: number;
    constructor(factor: number, jitter: number) {
        this.factor = factor;
        this.jitter = jitter;
    }
    public next(count: number): number {
        const delay = this.factor * count;
        return delay + (Math.random() * 2 - 1) * this.jitter * delay;
    }
    static default = new LinearBackoff(2, 0.1);
}
export class RandomBackoff implements Backoff {
    private min: number;
    private max: number;
    private jitter: number;
    constructor(min: number, max: number, jitter: number) {
        this.min = min;
        this.max = max;
        this.jitter = jitter;
    }
    public next(count: number): number {
        const delay = this.min + Math.random() * (this.max - this.min);
        return delay + (Math.random() * 2 - 1) * this.jitter * delay;
    }
    static default = new RandomBackoff(2, 5, 0.1);
}
export class ConstBackoff implements Backoff {
    private delay: number;
    constructor(delay: number) {
        this.delay = delay;
    }
    public next(_count: number): number {
        return this.delay;
    }
    static default = new ConstBackoff(5);
}
export enum ReasonType {
    connectFailed = 0,
    serverClosed = 1,
    networkError = 2,
    pingTimeout = 3,
}
export interface Reason {
    get type(): ReasonType;
}
export class ConnectFailed implements Reason {
    readonly ackcode: packet.ConnackCode;
    get type(): ReasonType {
        return ReasonType.connectFailed;
    }
    constructor(ackcode: packet.ConnackCode) {
        this.ackcode = ackcode;
    }
}
export class ServerClosed implements Reason {
    readonly code: packet.CloseCode;
    get type(): ReasonType {
        return ReasonType.serverClosed;
    }
    constructor(code: packet.CloseCode) {
        this.code = code;
    }
}
export class NetworkReason implements Reason {
    readonly error?: Error;
    readonly event?: Event;
    get type(): ReasonType {
        return ReasonType.networkError;
    }
    constructor(event?: Event, error?: Error) {
        this.event = event;
        this.error = error;
    }
    get closeCode(): number | undefined {
        if (this.event && this.event instanceof CloseEvent) {
            return this.event.code;
        }
        return undefined;
    }
}
export class PingTimeout implements Reason {
    get type(): ReasonType {
        return ReasonType.pingTimeout;
    }
}

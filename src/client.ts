import * as packet from './packet';

// Default options
const DEFAULT_OPTIONS = {
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
    onRequest(request: packet.Request): packet.Response | null;
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
    onStatus(_status: Status): void {
        // Default no-op
    }

    onMessage(_message: packet.Message): void {
        // Default no-op
    }

    onRequest(_request: packet.Request): packet.Response | null {
        // Default no-op
        return null;
    }
}

// Client implementation
export class Client {
    private _url: string;
    private _identity: packet.Identity | null = null;
    private _conn: WebSocket | null = null;
    private _closed: boolean = false;
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
    constructor(url: string, options: Options = {}) {
        const opts = { ...DEFAULT_OPTIONS, ...options };
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
        if (this._closed) {
            return;
        }
        this._identity = identity;
        if (this._status === Status.Opened || this._status === Status.Opening) {
            return;
        }
        this.setStatus(Status.Opening);
        this.connectWebSocket();
    }

    public close() {
        if (this._closed) {
            return;
        }
        this._closed = true;
        this.setStatus(Status.Closing);
        this.closePingTimer();
        if (this._conn) {
            this._conn.close();
            this._conn = null;
        }
        this.setStatus(Status.Closed);
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

    private connectWebSocket(): void {
        try {
            this._conn = new WebSocket(this._url, 'cable');
            this._conn.binaryType = 'arraybuffer';
            this._conn.onopen = () => {
                this.onWebSocketOpen();
            };
            this._conn.onmessage = (event) => {
                this.onWebSocketMessage(event);
            };
            this._conn.onclose = () => {
                this.onWebSocketClose();
            };
            this._conn.onerror = (error) => {
                this.onWebSocketError(error);
            };
        } catch (error) {
            this.handleConnectionError(error as Error);
        }
    }

    private onWebSocketOpen(): void {
        if (!this._identity) {
            this.handleConnectionError(new Error('identity is null'));
            return;
        }
        try {
            const connectPacket = new packet.Connect(this._identity);
            const bytes = packet.encode(connectPacket);
            this._conn?.send(bytes);
        } catch (error: any) {
            this.handleConnectionError(error);
        }
    }

    private onWebSocketMessage(event: MessageEvent): void {
        const arrayBuffer = event.data as ArrayBuffer;
        const bytes = new Uint8Array(arrayBuffer);
        try {
            this.handlePacket(packet.decode(bytes));
        } catch (error) {
            console.error(error);
        }
    }

    private onWebSocketClose(): void {
        this._conn = null;
        this.setStatus(Status.Closed);
        this.closePingTimer();
        for (const [id, _] of this._requestTasks) {
            this._requestTasks.delete(id);
        }
        for (const [id, _] of this._messageTasks) {
            this._messageTasks.delete(id);
        }
    }

    private onWebSocketError(error: Event): void {
        this.handleConnectionError(new Error('websocket error'));
    }

    private handleConnectionError(err: Error): void {
        console.error('connection error:', err);
        this.setStatus(Status.Closed);
        if (this._conn) {
            this._conn.close();
            this._conn = null;
        }
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
                this.handlePing(p as packet.Ping);
                break;
            case packet.PacketType.PONG:
                this.handlePong(p as packet.Pong);
                break;
            case packet.PacketType.CLOSE:
                this.handleClose(p as packet.Close);
                break;
            default:
                console.error('unknown packet type:', p.type);
        }
    }

    private handleConnack(connack: packet.Connack): void {
        if (connack.code !== packet.ConnackCode.Accepted) {
            this.handleConnectionError(new Error(`connect rejected: ${connack.code}`));
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
        if (response) {
            this.sendPacket(response);
        }
    }

    private handleResponse(response: packet.Response): void {
        const callback = this._requestTasks.get(response.id);
        if (callback) {
            this._requestTasks.delete(response.id);
            callback(response);
        }
    }

    private handlePing(ping: packet.Ping): void {
        this.sendPacket(new packet.Pong());
    }

    private handlePong(_pong: packet.Pong): void {
        console.log('received pong');
        this._pongReceived = true;
        if (this._pingTimeoutTimer) {
            clearTimeout(this._pingTimeoutTimer);
        }
    }

    private handleClose(close: packet.Close): void {
        console.error('received close packet:', close.code);
        this.close();
    }

    private sendPacket(p: packet.Packet): void {
        if (!this.isReady) {
            throw new Error('connection not ready');
        }
        try {
            const bytes = packet.encode(p);
            this._conn?.send(bytes);
        } catch (error) {
            console.error(error);
        }
    }

    private setStatus(status: Status): void {
        if (this._status === status) {
            return;
        }
        console.debug(`client status change: ${Status[this._status]} -> ${Status[status]}`);
        this._status = status;
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
            console.log('sending ping');
            this._pingTimeoutTimer = setTimeout(() => {
                if (!this._pongReceived) {
                    console.error('ping timeout, closing connection');
                    this.close();
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

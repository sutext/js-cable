import * as coder from './coder';

// Packet size constants
export const MIN_LEN = 0;
export const MID_LEN = 0x3ff;
export const MAX_LEN = 0x3fffffff;
// Error types
export enum ErrorCode {
    InvalidPacket = 0,
    RequestTimeout = 1,
    ConnectionFailed = 2,
    ConnectionClosed = 3,
    ConnectionNotReady = 4,
}

// Packet types
export enum PacketType {
    CONNECT = 0,
    CONNACK = 1,
    MESSAGE = 2,
    MESSACK = 3,
    REQUEST = 4,
    RESPONSE = 5,
    PING = 6,
    PONG = 7,
    CLOSE = 15,
}

// Properties
export enum Property {
    ConnID = 1,
    UserID = 2,
    Channel = 3,
    ClientID = 4,
    Password = 5,
}

// Message QoS
export enum MessageQos {
    Qos0 = 0,
    Qos1 = 1,
}

// Connection error codes
export enum ConnackCode {
    Accepted = 0,
    Rejected = 1,
    Duplicate = 2,
}
export enum CloseCode {
    Normal = 0,
    Kickout = 1,
    NoHeartbeat = 2,
    PingTimeout = 3,
    AuthFailure = 4,
    AuthTimeout = 5,
    InvalidPacket = 6,
    InternalError = 7,
    DuplicateLogin = 8,
    SerrverShutdown = 9,
    SerrverExpeled = 10,
}
export enum StatusCode {
    OK = 0,
    NotFound = 100,
    Unauthorized = 101,
    InternalError = 102,
    InvalidParams = 103,
    Forbidden = 201,
    BadRequest = 255,
}
// Packet errors
export class PacketError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PacketError';
    }
    static InvalidReadLen = new PacketError('invalid length when read');
    static UnknownPacketType = new PacketError('unknown packet type');
    static PacketSizeTooLarge = new PacketError('packet size too large');
    static MessageKindTooLarge = new PacketError('message kind too large');
}

export type MessageKind = number;
// Identity interface
export class Identity {
    readonly userID: string;
    readonly clientID: string;
    readonly password: string;
    constructor(userID: string = '', clientID: string = '', password: string = '') {
        this.userID = userID;
        this.clientID = clientID;
        this.password = password;
    }
}

// Packet interface
export class Packet implements coder.Codable {
    private props: Map<Property, string> = new Map();
    get type(): PacketType {
        throw 'Not implemented';
    }
    get(key: Property): string | undefined {
        return this.props.get(key);
    }
    set(key: Property, value: string): void {
        this.props.set(key, value);
    }
    writeTo(encoder: coder.Encoder): void {
        encoder.writeUInt8Map(this.props);
    }
    readFrom(decoder: coder.Decoder): void {
        this.props = decoder.readUInt8Map();
    }
}

// Connect packet
export class Connect extends Packet {
    private _identity: Identity;
    private _version: number = 1;
    constructor(identity: Identity = new Identity()) {
        super();
        this._identity = identity;
    }
    get type(): PacketType {
        return PacketType.CONNECT;
    }
    get identity(): Identity {
        return this._identity;
    }
    writeTo(encoder: coder.Encoder) {
        encoder.writeUInt8(this._version);
        encoder.writeString(this._identity.userID);
        encoder.writeString(this._identity.clientID);
        encoder.writeString(this._identity.password || '');
        super.writeTo(encoder);
    }
    readFrom(decoder: coder.Decoder) {
        this._version = decoder.readUInt8();
        const userId = decoder.readString();
        const clientId = decoder.readString();
        const password = decoder.readString();
        this._identity = new Identity(userId, clientId, password);
        super.readFrom(decoder);
    }
}

// Connack packet
export class Connack extends Packet {
    private _code: ConnackCode = 0;
    constructor(code: ConnackCode = 0) {
        super();
        this._code = code;
    }
    get type(): PacketType {
        return PacketType.CONNACK;
    }
    get code(): ConnackCode {
        return this._code;
    }
    writeTo(encoder: coder.Encoder) {
        encoder.writeUInt8(this._code);
        super.writeTo(encoder);
    }
    readFrom(decoder: coder.Decoder) {
        this._code = decoder.readUInt8();
        super.readFrom(decoder);
    }
}
const qosMask = 0x80;
const dupMask = 0x40;
const kindMask = 0x3f;
export class Message extends Packet {
    public dup: boolean = false;
    private _id: number; // uint16
    private _qos: MessageQos = MessageQos.Qos0;
    private _kind: MessageKind = 0;
    private _payload: Uint8Array = new Uint8Array();
    constructor(
        id: number = 0,
        qos: MessageQos = MessageQos.Qos0,
        kind: MessageKind = 0,
        payload?: Uint8Array,
        props: Map<Property, string> | null = null,
    ) {
        super();
        this._id = id;
        this._qos = qos;
        this._kind = kind;
        if (payload) {
            this._payload = payload;
        }
        if (props) {
            this['props'] = props;
        }
    }
    get id(): number {
        return this._id;
    }
    get qos(): MessageQos {
        return this._qos;
    }
    get kind(): MessageKind {
        return this._kind;
    }
    get type(): PacketType {
        return PacketType.MESSAGE;
    }
    get payload(): Uint8Array {
        return this._payload;
    }

    ack(): Messack {
        return new Messack(this._id);
    }
    writeTo(encoder: coder.Encoder) {
        let flags = 0;
        if (this.qos > 0) {
            flags |= qosMask;
        }
        if (this.dup) {
            flags |= dupMask;
        }
        if (this.kind > kindMask) {
            throw PacketError.MessageKindTooLarge;
        }
        flags |= this.kind;
        encoder.writeUInt8(flags);
        encoder.writeUInt16(this._id);
        super.writeTo(encoder);
        encoder.writeBytes(this._payload);
    }
    readFrom(decoder: coder.Decoder) {
        const flags = decoder.readUInt8();
        const id = decoder.readUInt16();
        super.readFrom(decoder);
        const payload = decoder.readAll();
        this._id = id;
        this.dup = (flags & dupMask) !== 0;
        this._qos = (flags & qosMask) >> 7;
        this._kind = flags & kindMask;
        this._payload = payload;
    }
}

// Messack packet
export class Messack extends Packet {
    private _id: number; //int64
    constructor(id: number = 0) {
        super();
        this._id = id;
    }
    get type(): PacketType {
        return PacketType.MESSACK;
    }
    get id(): number {
        return this._id;
    }
    writeTo(encoder: coder.Encoder) {
        encoder.writeUInt16(this._id);
        super.writeTo(encoder);
    }
    readFrom(decoder: coder.Decoder) {
        this._id = decoder.readUInt16();
        super.readFrom(decoder);
    }
}

// Request packet
export class Request extends Packet {
    private _id: number; //uint16
    private _method: string;
    private _body: Uint8Array = new Uint8Array();
    constructor(id: number = 0, method: string = '', body: Uint8Array = new Uint8Array(), props: Map<Property, string> | null = null) {
        super();
        this._id = id;
        this._method = method;
        this._body = body;
        if (props) {
            this['props'] = props;
        }
    }
    get type(): PacketType {
        return PacketType.REQUEST;
    }
    get id(): number {
        return this._id;
    }
    get method(): string {
        return this._method;
    }
    get body(): Uint8Array {
        return this._body;
    }
    writeTo(encoder: coder.Encoder) {
        encoder.writeUInt16(this._id);
        encoder.writeString(this._method);
        super.writeTo(encoder);
        encoder.writeBytes(this._body);
    }
    readFrom(decoder: coder.Decoder) {
        this._id = decoder.readUInt16();
        this._method = decoder.readString();
        super.readFrom(decoder);
        this._body = decoder.readAll();
    }
    response(code: number, data?: Uint8Array): Response {
        return new Response(this._id, code, data || new Uint8Array());
    }
}

// Response packet
export class Response extends Packet {
    private _id: number; //uint16
    private _code: StatusCode; //uint8
    private _body: Uint8Array;
    constructor(id: number = 0, code: StatusCode = 0, data: Uint8Array = new Uint8Array()) {
        super();
        this._id = id;
        this._code = code;
        this._body = data;
    }
    get type(): PacketType {
        return PacketType.RESPONSE;
    }
    get id(): number {
        return this._id;
    }
    get code(): StatusCode {
        return this._code;
    }
    get body(): Uint8Array {
        return this._body;
    }
    writeTo(encoder: coder.Encoder) {
        encoder.writeUInt16(this._id);
        encoder.writeUInt8(this._code);
        super.writeTo(encoder);
        encoder.writeBytes(this._body);
    }
    readFrom(decoder: coder.Decoder) {
        this._id = decoder.readUInt16();
        this._code = decoder.readUInt8();
        super.readFrom(decoder);
        this._body = decoder.readAll();
    }
}

// Ping packet
export class Ping extends Packet {
    get type(): PacketType {
        return PacketType.PING;
    }
}

// Pong packet
export class Pong extends Packet {
    get type(): PacketType {
        return PacketType.PONG;
    }
}

// Close packet
export class Close extends Packet {
    private _code: CloseCode = 0;
    constructor(code: CloseCode = 0) {
        super();
        this._code = code;
    }
    get code(): CloseCode {
        return this._code;
    }
    get type(): PacketType {
        return PacketType.CLOSE;
    }
    writeTo(encoder: coder.Encoder) {
        encoder.writeUInt8(this._code);
    }
    readFrom(decoder: coder.Decoder) {
        this._code = decoder.readUInt8();
    }
}

// Encode packet to bytes
export function encode(p: Packet): Uint8Array {
    const [header, data] = pack(p);
    const result = new Uint8Array(header.length + data.length);
    result.set(header);
    result.set(data, header.length);
    return result;
}

// Decode bytes to packet
export function decode(bytes: Uint8Array): Packet {
    if (bytes.length < 2) {
        throw PacketError.InvalidReadLen;
    }
    const byteCount = (bytes[0] >> 2) & 0x03;
    let length = ((bytes[0] & 0x03) << 8) | bytes[1];
    let dataStart = 2;
    if (byteCount > 0) {
        if (bytes.length < 2 + byteCount) {
            throw PacketError.InvalidReadLen;
        }
        for (let i = 0; i < byteCount; i++) {
            length = (length << 8) | bytes[2 + i];
        }
        dataStart = 2 + byteCount;
    }
    if (bytes.length < dataStart + length) {
        throw PacketError.InvalidReadLen;
    }
    const data = bytes.slice(dataStart, dataStart + length);
    return unpack(bytes.slice(0, dataStart), data);
}

// Pack packet into header and data
function pack(p: Packet): [Uint8Array, Uint8Array] {
    const data = coder.encode(p);
    const length = data.length;
    if (length > MAX_LEN) {
        throw PacketError.PacketSizeTooLarge;
    }
    let header: Uint8Array;
    if (length > MID_LEN) {
        let bs: number[] = [];
        let len = length;
        while (len > 0) {
            bs.push(len & 0xff);
            len >>= 8;
        }
        bs.reverse();
        if (bs[0] > 3) {
            header = new Uint8Array(bs.length + 1);
            for (let i = 0; i < bs.length; i++) {
                header[i + 1] = bs[i];
            }
        } else {
            header = new Uint8Array(bs.length);
            header.set(bs);
        }

        header[0] = (p.type << 4) | ((header.length - 2) << 2) | header[0];
    } else {
        header = new Uint8Array(2);
        header[0] = (p.type << 4) | (length >> 8);
        header[1] = length & 0xff;
    }
    return [header, data];
}

// Unpack header and data into packet
function unpack(header: Uint8Array, data: Uint8Array): Packet {
    const packetType = (header[0] >> 4) as PacketType;
    switch (packetType) {
        case PacketType.CONNECT:
            const conn = new Connect();
            coder.decode(data, conn);
            return conn;
        case PacketType.CONNACK:
            const connack = new Connack();
            coder.decode(data, connack);
            return connack;
        case PacketType.MESSAGE:
            const msg = new Message();
            coder.decode(data, msg);
            return msg;
        case PacketType.MESSACK:
            const messack = new Messack();
            coder.decode(data, messack);
            return messack;
        case PacketType.REQUEST:
            const req = new Request();
            coder.decode(data, req);
            return req;
        case PacketType.RESPONSE:
            const res = new Response();
            coder.decode(data, res);
            return res;
        case PacketType.PING:
            const ping = new Ping();
            coder.decode(data, ping);
            return ping;
        case PacketType.PONG:
            const pong = new Pong();
            coder.decode(data, pong);
            return pong;
        case PacketType.CLOSE:
            const close = new Close(0);
            coder.decode(data, close);
            return close;
        default:
            throw PacketError.UnknownPacketType;
    }
}

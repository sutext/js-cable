import * as coder from './coder';

/**
 * Packet size constants
 */
export const MIN_LEN = 0;
export const MID_LEN = 0x3ff;
export const MAX_LEN = 0x3fffffff;

/**
 * Error codes for packet operations
 */
export enum ErrorCode {
    /**
     * Invalid packet format
     */
    InvalidPacket = 0,
    /**
     * Request timed out
     */
    RequestTimeout = 1,
    /**
     * Connection failed
     */
    ConnectionFailed = 2,
    /**
     * Connection closed
     */
    ConnectionClosed = 3,
    /**
     * Connection not ready
     */
    ConnectionNotReady = 4,
}

/**
 * Packet types
 */
export enum PacketType {
    /**
     * Connect packet type
     */
    CONNECT = 0,
    /**
     * Connect acknowledgment packet type
     */
    CONNACK = 1,
    /**
     * Message packet type
     */
    MESSAGE = 2,
    /**
     * Message acknowledgment packet type
     */
    MESSACK = 3,
    /**
     * Request packet type
     */
    REQUEST = 4,
    /**
     * Response packet type
     */
    RESPONSE = 5,
    /**
     * Ping packet type
     */
    PING = 6,
    /**
     * Pong packet type
     */
    PONG = 7,
    /**
     * Close packet type
     */
    CLOSE = 15,
}

/**
 * Packet properties
 */
export enum Property {
    /**
     * Connection ID property
     */
    ConnID = 1,
    /**
     * User ID property
     */
    UserID = 2,
    /**
     * Channel property
     */
    Channel = 3,
    /**
     * Client ID property
     */
    ClientID = 4,
    /**
     * Password property
     */
    Password = 5,
}

/**
 * Message Quality of Service levels
 */
export enum MessageQos {
    /**
     * At most once delivery
     */
    Qos0 = 0,
    /**
     * At least once delivery
     */
    Qos1 = 1,
}

/**
 * Connection acknowledgment codes
 */
export enum ConnackCode {
    /**
     * Connection accepted
     */
    Accepted = 0,
    /**
     * Connection rejected
     */
    Rejected = 1,
    /**
     * Duplicate connection attempt
     */
    Duplicate = 2,
}

/**
 * Close codes
 */
export enum CloseCode {
    /**
     * Normal close
     */
    Normal = 0,
    /**
     * Kickout by server
     */
    Kickout = 1,
    /**
     * No heartbeat received
     */
    NoHeartbeat = 2,
    /**
     * Ping timeout
     */
    PingTimeout = 3,
    /**
     * Authentication failure
     */
    AuthFailure = 4,
    /**
     * Authentication timeout
     */
    AuthTimeout = 5,
    /**
     * Invalid packet received
     */
    InvalidPacket = 6,
    /**
     * Server internal error
     */
    InternalError = 7,
    /**
     * Duplicate login detected
     */
    DuplicateLogin = 8,
    /**
     * Server shutdown
     */
    SerrverShutdown = 9,
    /**
     * Server expelled client
     */
    SerrverExpeled = 10,
}

/**
 * Status codes for responses
 */
export enum StatusCode {
    /**
     * Success
     */
    OK = 0,
    /**
     * Resource not found
     */
    NotFound = 100,
    /**
     * Unauthorized access
     */
    Unauthorized = 101,
    /**
     * Internal server error
     */
    InternalError = 102,
    /**
     * Invalid parameters
     */
    InvalidParams = 103,
    /**
     * Forbidden operation
     */
    Forbidden = 201,
    /**
     * Bad request
     */
    BadRequest = 255,
}

/**
 * PacketError represents an error that occurs during packet operations
 */
export class PacketError extends Error {
    /**
     * Creates a new PacketError instance
     * @param message Error message
     */
    constructor(message: string) {
        super(message);
        this.name = 'PacketError';
    }
    /**
     * Invalid length when reading packet
     */
    static InvalidReadLen = new PacketError('invalid length when read');
    /**
     * Unknown packet type encountered
     */
    static UnknownPacketType = new PacketError('unknown packet type');
    /**
     * Packet size exceeds maximum allowed
     */
    static PacketSizeTooLarge = new PacketError('packet size too large');
    /**
     * Message kind exceeds maximum allowed value
     */
    static MessageKindTooLarge = new PacketError('message kind too large');
}

/**
 * Message kind type
 */
export type MessageKind = number;

/**
 * Identity represents client identification information
 */
export class Identity {
    /**
     * User ID
     */
    readonly userID: string;
    /**
     * Client ID
     */
    readonly clientID: string;
    /**
     * Password
     */
    readonly password: string;

    /**
     * Creates a new Identity instance
     * @param userID User ID
     * @param clientID Client ID
     * @param password Password
     */
    constructor(userID: string = '', clientID: string = '', password: string = '') {
        this.userID = userID;
        this.clientID = clientID;
        this.password = password;
    }
}

/**
 * Packet is the base class for all cable packets
 */
export class Packet implements coder.Codable {
    private props: Map<Property, string> = new Map();

    /**
     * Gets the packet type
     */
    get type(): PacketType {
        throw 'Not implemented';
    }

    /**
     * Gets a property value
     * @param key Property key
     * @returns Property value or undefined if not found
     */
    get(key: Property): string | undefined {
        return this.props.get(key);
    }

    /**
     * Sets a property value
     * @param key Property key
     * @param value Property value
     */
    set(key: Property, value: string): void {
        this.props.set(key, value);
    }

    /**
     * Writes the packet to an encoder
     * @param encoder Encoder to write to
     */
    writeTo(encoder: coder.Encoder): void {
        encoder.writeUInt8Map(this.props);
    }

    /**
     * Reads the packet from a decoder
     * @param decoder Decoder to read from
     */
    readFrom(decoder: coder.Decoder): void {
        this.props = decoder.readUInt8Map();
    }
}

/**
 * Connect packet for establishing a connection
 */
export class Connect extends Packet {
    private _identity: Identity;
    private _version: number = 1;

    /**
     * Creates a new Connect packet
     * @param identity Client identity information
     */
    constructor(identity: Identity = new Identity()) {
        super();
        this._identity = identity;
    }

    /**
     * Gets the packet type
     */
    get type(): PacketType {
        return PacketType.CONNECT;
    }

    /**
     * Gets the client identity
     */
    get identity(): Identity {
        return this._identity;
    }

    /**
     * Writes the packet to an encoder
     * @param encoder Encoder to write to
     */
    writeTo(encoder: coder.Encoder) {
        encoder.writeUInt8(this._version);
        encoder.writeString(this._identity.userID);
        encoder.writeString(this._identity.clientID);
        encoder.writeString(this._identity.password || '');
        super.writeTo(encoder);
    }

    /**
     * Reads the packet from a decoder
     * @param decoder Decoder to read from
     */
    readFrom(decoder: coder.Decoder) {
        this._version = decoder.readUInt8();
        const userId = decoder.readString();
        const clientId = decoder.readString();
        const password = decoder.readString();
        this._identity = new Identity(userId, clientId, password);
        super.readFrom(decoder);
    }
}

/**
 * Connack packet for connection acknowledgment
 */
export class Connack extends Packet {
    private _code: ConnackCode = 0;

    /**
     * Creates a new Connack packet
     * @param code Connection acknowledgment code
     */
    constructor(code: ConnackCode = 0) {
        super();
        this._code = code;
    }

    /**
     * Gets the packet type
     */
    get type(): PacketType {
        return PacketType.CONNACK;
    }

    /**
     * Gets the connection acknowledgment code
     */
    get code(): ConnackCode {
        return this._code;
    }

    /**
     * Writes the packet to an encoder
     * @param encoder Encoder to write to
     */
    writeTo(encoder: coder.Encoder) {
        encoder.writeUInt8(this._code);
        super.writeTo(encoder);
    }

    /**
     * Reads the packet from a decoder
     * @param decoder Decoder to read from
     */
    readFrom(decoder: coder.Decoder) {
        this._code = decoder.readUInt8();
        super.readFrom(decoder);
    }
}
/**
 * Bit masks for message flags
 */
const qosMask = 0x80;
const dupMask = 0x40;
const kindMask = 0x3f;

/**
 * Message packet for data transmission
 */
export class Message extends Packet {
    /**
     * Duplicate flag
     */
    public dup: boolean = false;
    private _id: number; // uint16
    private _qos: MessageQos = MessageQos.Qos0;
    private _kind: MessageKind = 0;
    private _payload: Uint8Array = new Uint8Array();

    /**
     * Creates a new Message packet
     * @param id Message ID
     * @param qos Quality of Service level
     * @param kind Message kind
     * @param payload Message payload
     * @param props Message properties
     */
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

    /**
     * Gets the message ID
     */
    get id(): number {
        return this._id;
    }

    /**
     * Gets the Quality of Service level
     */
    get qos(): MessageQos {
        return this._qos;
    }

    /**
     * Gets the message kind
     */
    get kind(): MessageKind {
        return this._kind;
    }

    /**
     * Gets the packet type
     */
    get type(): PacketType {
        return PacketType.MESSAGE;
    }

    /**
     * Gets the message payload
     */
    get payload(): Uint8Array {
        return this._payload;
    }

    /**
     * Creates an acknowledgment packet for this message
     * @returns A Messack packet
     */
    ack(): Messack {
        return new Messack(this._id);
    }

    /**
     * Writes the packet to an encoder
     * @param encoder Encoder to write to
     */
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

    /**
     * Reads the packet from a decoder
     * @param decoder Decoder to read from
     */
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

/**
 * Messack packet for message acknowledgment
 */
export class Messack extends Packet {
    private _id: number; //int64

    /**
     * Creates a new Messack packet
     * @param id Message ID to acknowledge
     */
    constructor(id: number = 0) {
        super();
        this._id = id;
    }

    /**
     * Gets the packet type
     */
    get type(): PacketType {
        return PacketType.MESSACK;
    }

    /**
     * Gets the acknowledged message ID
     */
    get id(): number {
        return this._id;
    }

    /**
     * Writes the packet to an encoder
     * @param encoder Encoder to write to
     */
    writeTo(encoder: coder.Encoder) {
        encoder.writeUInt16(this._id);
        super.writeTo(encoder);
    }

    /**
     * Reads the packet from a decoder
     * @param decoder Decoder to read from
     */
    readFrom(decoder: coder.Decoder) {
        this._id = decoder.readUInt16();
        super.readFrom(decoder);
    }
}

/**
 * Request packet for request-response communication
 */
export class Request extends Packet {
    private _id: number; //uint16
    private _method: string;
    private _body: Uint8Array = new Uint8Array();

    /**
     * Creates a new Request packet
     * @param id Request ID
     * @param method Request method
     * @param body Request body
     * @param props Request properties
     */
    constructor(id: number = 0, method: string = '', body: Uint8Array = new Uint8Array(), props: Map<Property, string> | null = null) {
        super();
        this._id = id;
        this._method = method;
        this._body = body;
        if (props) {
            this['props'] = props;
        }
    }

    /**
     * Gets the packet type
     */
    get type(): PacketType {
        return PacketType.REQUEST;
    }

    /**
     * Gets the request ID
     */
    get id(): number {
        return this._id;
    }

    /**
     * Gets the request method
     */
    get method(): string {
        return this._method;
    }

    /**
     * Gets the request body
     */
    get body(): Uint8Array {
        return this._body;
    }

    /**
     * Writes the packet to an encoder
     * @param encoder Encoder to write to
     */
    writeTo(encoder: coder.Encoder) {
        encoder.writeUInt16(this._id);
        encoder.writeString(this._method);
        super.writeTo(encoder);
        encoder.writeBytes(this._body);
    }

    /**
     * Reads the packet from a decoder
     * @param decoder Decoder to read from
     */
    readFrom(decoder: coder.Decoder) {
        this._id = decoder.readUInt16();
        this._method = decoder.readString();
        super.readFrom(decoder);
        this._body = decoder.readAll();
    }

    /**
     * Creates a response packet for this request
     * @param code Response status code
     * @param data Response data
     * @returns A Response packet
     */
    response(code: number, data?: Uint8Array): Response {
        return new Response(this._id, code, data || new Uint8Array());
    }
}

/**
 * Response packet for request-response communication
 */
export class Response extends Packet {
    private _id: number; //uint16
    private _code: StatusCode; //uint8
    private _body: Uint8Array;

    /**
     * Creates a new Response packet
     * @param id Request ID to respond to
     * @param code Response status code
     * @param data Response data
     */
    constructor(id: number = 0, code: StatusCode = 0, data: Uint8Array = new Uint8Array()) {
        super();
        this._id = id;
        this._code = code;
        this._body = data;
    }

    /**
     * Gets the packet type
     */
    get type(): PacketType {
        return PacketType.RESPONSE;
    }

    /**
     * Gets the response ID
     */
    get id(): number {
        return this._id;
    }

    /**
     * Gets the response status code
     */
    get code(): StatusCode {
        return this._code;
    }

    /**
     * Gets the response body
     */
    get body(): Uint8Array {
        return this._body;
    }

    /**
     * Writes the packet to an encoder
     * @param encoder Encoder to write to
     */
    writeTo(encoder: coder.Encoder) {
        encoder.writeUInt16(this._id);
        encoder.writeUInt8(this._code);
        super.writeTo(encoder);
        encoder.writeBytes(this._body);
    }

    /**
     * Reads the packet from a decoder
     * @param decoder Decoder to read from
     */
    readFrom(decoder: coder.Decoder) {
        this._id = decoder.readUInt16();
        this._code = decoder.readUInt8();
        super.readFrom(decoder);
        this._body = decoder.readAll();
    }
}

/**
 * Ping packet for keep-alive
 */
export class Ping extends Packet {
    /**
     * Gets the packet type
     */
    get type(): PacketType {
        return PacketType.PING;
    }
}

/**
 * Pong packet for keep-alive response
 */
export class Pong extends Packet {
    /**
     * Gets the packet type
     */
    get type(): PacketType {
        return PacketType.PONG;
    }
}

/**
 * Close packet for closing connection
 */
export class Close extends Packet {
    private _code: CloseCode = 0;

    /**
     * Creates a new Close packet
     * @param code Close code
     */
    constructor(code: CloseCode = 0) {
        super();
        this._code = code;
    }

    /**
     * Gets the close code
     */
    get code(): CloseCode {
        return this._code;
    }

    /**
     * Gets the packet type
     */
    get type(): PacketType {
        return PacketType.CLOSE;
    }

    /**
     * Writes the packet to an encoder
     * @param encoder Encoder to write to
     */
    writeTo(encoder: coder.Encoder) {
        encoder.writeUInt8(this._code);
    }

    /**
     * Reads the packet from a decoder
     * @param decoder Decoder to read from
     */
    readFrom(decoder: coder.Decoder) {
        this._code = decoder.readUInt8();
    }
}

/**
 * Encodes a packet to bytes
 * @param p Packet to encode
 * @returns Encoded byte array
 */
export function encode(p: Packet): Uint8Array {
    const [header, data] = pack(p);
    const result = new Uint8Array(header.length + data.length);
    result.set(header);
    result.set(data, header.length);
    return result;
}

/**
 * Decodes bytes to a packet
 * @param bytes Byte array to decode
 * @returns Decoded packet
 */
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

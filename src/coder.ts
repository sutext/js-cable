/**
 * CoderError represents an error that occurs during encoding or decoding
 */
export class CoderError extends Error {
    /**
     * Creates a new CoderError instance
     * @param message Error message
     */
    constructor(message: string) {
        super(message);
        this.name = 'CoderError';
    }
    /**
     * Buffer is too short to complete the operation
     */
    static BufferTooShort = new CoderError('buffer too short');
    /**
     * Varint overflow during encoding/decoding
     */
    static VarintOverflow = new CoderError('varint overflow');
    /**
     * BigInt value is out of range
     */
    static BigIntOverflow = new CoderError('bigint overflow');
}
/**
 * Encoder interface defines methods for encoding data
 */
export interface Encoder {
    /**
     * Gets the encoded byte array
     * @returns The encoded byte array
     */
    bytes(): Uint8Array;
    /**
     * Writes a byte array
     * @param p The byte array to write
     */
    writeBytes(p: Uint8Array): void;
    /**
     * Writes an unsigned 8-bit integer
     * @param i The unsigned 8-bit integer to write
     */
    writeUInt8(i: number): void;
    /**
     * Writes an unsigned 16-bit integer
     * @param i The unsigned 16-bit integer to write
     */
    writeUInt16(i: number): void;
    /**
     * Writes an unsigned 32-bit integer
     * @param i The unsigned 32-bit integer to write
     */
    writeUInt32(i: number): void;
    /**
     * Writes an unsigned 64-bit integer
     * @param i The unsigned 64-bit integer to write
     */
    writeUInt64(i: bigint): void;
    /**
     * Writes a boolean value
     * @param b The boolean value to write
     */
    writeBool(b: boolean): void;
    /**
     * Writes a signed 8-bit integer
     * @param i The signed 8-bit integer to write
     */
    writeInt8(i: number): void;
    /**
     * Writes a signed 16-bit integer
     * @param i The signed 16-bit integer to write
     */
    writeInt16(i: number): void;
    /**
     * Writes a signed 32-bit integer
     * @param i The signed 32-bit integer to write
     */
    writeInt32(i: number): void;
    /**
     * Writes a signed 64-bit integer
     * @param i The signed 64-bit integer to write
     */
    writeInt64(i: bigint): void;
    /**
     * Writes a Varint-encoded integer
     * @param i The integer to write
     */
    writeVarint(i: number): void;
    /**
     * Writes length-prefixed data
     * @param data The data to write
     */
    writeData(data: Uint8Array): void;
    /**
     * Writes a string
     * @param s The string to write
     */
    writeString(s: string): void;
    /**
     * Writes a string map
     * @param m The string map to write
     */
    writeStrMap(m: Map<string, string>): void;
    /**
     * Writes a string array
     * @param ss The string array to write
     */
    writeStrings(ss: string[]): void;
    /**
     * Writes a map from unsigned 8-bit integers to strings
     * @param m The map to write
     */
    writeUInt8Map(m: Map<number, string>): void;
}

/**
 * Decoder interface defines methods for decoding data
 */
export interface Decoder {
    /**
     * Reads a byte array of specified length
     * @param l Number of bytes to read
     * @returns The read byte array
     */
    readBytes(l: number): Uint8Array;
    /**
     * Reads an unsigned 8-bit integer
     * @returns The read unsigned 8-bit integer
     */
    readUInt8(): number;
    /**
     * Reads an unsigned 16-bit integer
     * @returns The read unsigned 16-bit integer
     */
    readUInt16(): number;
    /**
     * Reads an unsigned 32-bit integer
     * @returns The read unsigned 32-bit integer
     */
    readUInt32(): number;
    /**
     * Reads an unsigned 64-bit integer
     * @returns The read unsigned 64-bit integer
     */
    readUInt64(): bigint;
    /**
     * Reads a boolean value
     * @returns The read boolean value
     */
    readBool(): boolean;
    /**
     * Reads a signed 8-bit integer
     * @returns The read signed 8-bit integer
     */
    readInt8(): number;
    /**
     * Reads a signed 16-bit integer
     * @returns The read signed 16-bit integer
     */
    readInt16(): number;
    /**
     * Reads a signed 32-bit integer
     * @returns The read signed 32-bit integer
     */
    readInt32(): number;
    /**
     * Reads a signed 64-bit integer
     * @returns The read signed 64-bit integer
     */
    readInt64(): bigint;
    /**
     * Reads a Varint-encoded integer
     * @returns The read integer
     */
    readVarint(): number;
    /**
     * Reads length-prefixed data
     * @returns The read data
     */
    readData(): Uint8Array;
    /**
     * Reads a string
     * @returns The read string
     */
    readString(): string;
    /**
     * Reads a string map
     * @returns The read string map
     */
    readStrMap(): Map<string, string>;
    /**
     * Reads a string array
     * @returns The read string array
     */
    readStrings(): string[];
    /**
     * Reads a map from unsigned 8-bit integers to strings
     * @returns The read map
     */
    readUInt8Map(): Map<number, string>;
    /**
     * Reads all remaining bytes
     * @returns The read byte array
     */
    readAll(): Uint8Array;
}

class Coder implements Encoder, Decoder {
    private pos: number = 0;
    private buf: Uint8Array;

    constructor(capOrBytes?: number | Uint8Array) {
        if (capOrBytes instanceof Uint8Array) {
            this.buf = capOrBytes;
        } else {
            const capacity = capOrBytes && capOrBytes > 0 ? capOrBytes : 256;
            this.buf = new Uint8Array(capacity);
        }
    }
    bytes(): Uint8Array {
        return this.buf.slice(0, this.pos);
    }

    private ensureCapacity(additional: number): void {
        const newSize = this.pos + additional;
        if (newSize > this.buf.length) {
            let newCapacity = this.buf.length * 2;
            while (newCapacity < newSize) {
                newCapacity *= 2;
            }
            const newBuf = new Uint8Array(newCapacity);
            newBuf.set(this.buf);
            this.buf = newBuf;
        }
    }

    writeBytes(p: Uint8Array): void {
        this.ensureCapacity(p.length);
        this.buf.set(p, this.pos);
        this.pos += p.length;
    }

    writeUInt8(i: number): void {
        this.ensureCapacity(1);
        this.buf[this.pos++] = i & 0xff;
    }

    writeUInt16(i: number): void {
        this.ensureCapacity(2);
        this.buf[this.pos++] = (i >> 8) & 0xff;
        this.buf[this.pos++] = i & 0xff;
    }

    writeUInt32(i: number): void {
        this.ensureCapacity(4);
        this.buf[this.pos++] = (i >> 24) & 0xff;
        this.buf[this.pos++] = (i >> 16) & 0xff;
        this.buf[this.pos++] = (i >> 8) & 0xff;
        this.buf[this.pos++] = i & 0xff;
    }

    writeUInt64(i: bigint): void {
        if (i < 0 || i > 0xffffffffffffffffn) {
            throw CoderError.BigIntOverflow;
        }
        this.ensureCapacity(8);
        this.buf[this.pos++] = Number((i >> 56n) & 0xffn);
        this.buf[this.pos++] = Number((i >> 48n) & 0xffn);
        this.buf[this.pos++] = Number((i >> 40n) & 0xffn);
        this.buf[this.pos++] = Number((i >> 32n) & 0xffn);
        this.buf[this.pos++] = Number((i >> 24n) & 0xffn);
        this.buf[this.pos++] = Number((i >> 16n) & 0xffn);
        this.buf[this.pos++] = Number((i >> 8n) & 0xffn);
        this.buf[this.pos++] = Number(i & 0xffn);
    }

    writeBool(b: boolean): void {
        this.writeUInt8(b ? 1 : 0);
    }

    writeInt8(i: number): void {
        this.writeUInt8(i & 0xff);
    }

    writeInt16(i: number): void {
        this.writeUInt16(i & 0xffff);
    }

    writeInt32(i: number): void {
        this.writeUInt32(i & 0xffffffff);
    }

    writeInt64(i: bigint): void {
        if (i < -0x8000_0000_0000_0000n || i > 0x7fff_ffff_ffff_ffffn) {
            throw CoderError.BigIntOverflow;
        }
        this.writeUInt64(i & 0xffffffffffffffffn);
    }

    writeVarint(i: number): void {
        if (i > Number.MAX_SAFE_INTEGER || i < 0) {
            throw CoderError.VarintOverflow;
        }
        this.ensureCapacity(10);
        while (i >= 0x80) {
            this.buf[this.pos++] = (i & 0x7f) | 0x80;
            i >>= 7;
        }
        this.buf[this.pos++] = i & 0x7f;
    }

    writeData(data: Uint8Array): void {
        this.writeVarint(data.length);
        this.writeBytes(data);
    }

    writeString(s: string): void {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(s);
        this.writeData(bytes);
    }

    writeStrMap(m: Map<string, string>): void {
        this.writeVarint(m.size);
        for (const [k, v] of m) {
            this.writeString(k);
            this.writeString(v);
        }
    }

    writeStrings(ss: string[]): void {
        this.writeVarint(ss.length);
        for (const s of ss) {
            this.writeString(s);
        }
    }

    writeUInt8Map(m: Map<number, string>): void {
        this.writeUInt8(m.size);
        for (const [k, v] of m) {
            this.writeUInt8(k);
            this.writeString(v);
        }
    }

    readBytes(l: number): Uint8Array {
        if (l === 0) {
            return new Uint8Array(0);
        }
        if (this.pos + l > this.buf.length) {
            throw CoderError.BufferTooShort;
        }
        const p = this.buf.slice(this.pos, this.pos + l);
        this.pos += l;
        return p;
    }

    readUInt8(): number {
        if (this.pos + 1 > this.buf.length) {
            throw CoderError.BufferTooShort;
        }
        const i = this.buf[this.pos++];
        return i;
    }

    readUInt16(): number {
        const bytes = this.readBytes(2);
        return (bytes[0] << 8) | bytes[1];
    }

    readUInt32(): number {
        const bytes = this.readBytes(4);
        return (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
    }

    readUInt64(): bigint {
        const bytes = this.readBytes(8);
        return (
            (BigInt(bytes[0]) << 56n) |
            (BigInt(bytes[1]) << 48n) |
            (BigInt(bytes[2]) << 40n) |
            (BigInt(bytes[3]) << 32n) |
            (BigInt(bytes[4]) << 24n) |
            (BigInt(bytes[5]) << 16n) |
            (BigInt(bytes[6]) << 8n) |
            BigInt(bytes[7])
        );
    }

    readBool(): boolean {
        const i = this.readUInt8();
        return i === 1;
    }

    readInt8(): number {
        const u = this.readUInt8();
        return (u << 24) >> 24;
    }

    readInt16(): number {
        const u = this.readUInt16();
        return (u << 16) >> 16;
    }

    readInt32(): number {
        const u = this.readUInt32();
        return u | 0;
    }
    readInt64(): bigint {
        const u = this.readUInt64();
        return u >= 0x8000_0000_0000_0000n ? u - 0x1_0000_0000_0000_0000n : u;
    }

    readVarint(): number {
        let result = 0;
        let shift = 0;
        let i = 0;
        while (i < 10) {
            if (this.pos + i >= this.buf.length) {
                throw CoderError.BufferTooShort;
            }
            const byte = this.buf[this.pos + i];
            result |= (byte & 0x7f) << shift;
            shift += 7;
            i++;
            if ((byte & 0x80) === 0) {
                this.pos += i;
                return result;
            }
        }
        throw CoderError.VarintOverflow;
    }

    readString(): string {
        const bytes = this.readData();
        const decoder = new TextDecoder();
        return decoder.decode(bytes);
    }

    readData(): Uint8Array {
        const l = this.readVarint();
        return this.readBytes(l);
    }

    readStrMap(): Map<string, string> {
        const l = this.readVarint();
        const m = new Map<string, string>();
        for (let i = 0; i < l; i++) {
            const k = this.readString();
            const v = this.readString();
            m.set(k, v);
        }
        return m;
    }

    readStrings(): string[] {
        const l = this.readVarint();
        const ss: string[] = [];
        for (let i = 0; i < l; i++) {
            ss.push(this.readString());
        }
        return ss;
    }

    readUInt8Map(): Map<number, string> {
        const l = this.readUInt8();
        const m = new Map<number, string>();
        for (let i = 0; i < l; i++) {
            const k = this.readUInt8();
            const v = this.readString();
            m.set(k, v);
        }
        return m;
    }

    readAll(): Uint8Array {
        const l = this.buf.length;
        if (this.pos >= l) {
            return new Uint8Array(0);
        }
        const p = this.buf.slice(this.pos);
        this.pos = l;
        return p;
    }
}

/**
 * Creates a new Encoder instance
 * @param cap Optional initial capacity for the encoder buffer
 * @returns A new Encoder instance
 */
export function NewEncoder(cap?: number): Encoder {
    return new Coder(cap);
}

/**
 * Creates a new Decoder instance
 * @param bytes The byte array to decode
 * @returns A new Decoder instance
 */
export function NewDecoder(bytes: Uint8Array): Decoder {
    return new Coder(bytes);
}

/**
 * Encodable interface defines objects that can be encoded to bytes
 */
export interface Encodable {
    /**
     * Writes the object to an encoder
     * @param encoder The encoder to write to
     */
    writeTo(encoder: Encoder): void;
}

/**
 * Decodable interface defines objects that can be decoded from bytes
 */
export interface Decodable {
    /**
     * Reads the object from a decoder
     * @param decoder The decoder to read from
     */
    readFrom(decoder: Decoder): void;
}

/**
 * Codable is a type that combines Encodable and Decodable interfaces
 */
export type Codable = Encodable & Decodable;

/**
 * Encodes an encodable object to bytes
 * @param ec The encodable object to encode
 * @returns The encoded byte array
 */
export function encode(ec: Encodable): Uint8Array {
    const encoder = NewEncoder();
    ec.writeTo(encoder);
    return encoder.bytes();
}

/**
 * Decodes bytes into a decodable object
 * @param bytes The byte array to decode
 * @param dc The decodable object to decode into
 */
export function decode(bytes: Uint8Array, dc: Decodable) {
    dc.readFrom(NewDecoder(bytes));
}

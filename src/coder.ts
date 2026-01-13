export class CoderError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CoderError';
    }
    static BufferTooShort = new CoderError('buffer too short');
    static VarintOverflow = new CoderError('varint overflow');
}
export interface Encoder {
    bytes(): Uint8Array;
    writeBytes(p: Uint8Array): void;
    writeUInt8(i: number): void;
    writeUInt16(i: number): void;
    writeUInt32(i: number): void;
    writeUInt64(i: bigint): void;
    writeBool(b: boolean): void;
    writeInt8(i: number): void;
    writeInt16(i: number): void;
    writeInt32(i: number): void;
    writeInt64(i: bigint): void;
    writeVarint(i: number): void;
    writeData(data: Uint8Array): void;
    writeString(s: string): void;
    writeStrMap(m: Map<string, string>): void;
    writeStrings(ss: string[]): void;
    writeUInt8Map(m: Map<number, string>): void;
}

export interface Decoder {
    readBytes(l: number): Uint8Array;
    readUInt8(): number;
    readUInt16(): number;
    readUInt32(): number;
    readUInt64(): bigint;
    readBool(): boolean;
    readInt8(): number;
    readInt16(): number;
    readInt32(): number;
    readInt64(): bigint;
    readVarint(): number;
    readData(): Uint8Array;
    readString(): string;
    readStrMap(): Map<string, string>;
    readStrings(): string[];
    readUInt8Map(): Map<number, string>;
    readAll(): Uint8Array;
}

class Coder implements Encoder, Decoder {
    private pos: number = 0;
    private buf: Uint8Array;

    constructor(cap?: number) {
        const capacity = cap && cap > 0 ? cap : 256;
        this.buf = new Uint8Array(capacity);
    }

    bytes(): Uint8Array {
        return this.buf;
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
        this.ensureCapacity(8);
        this.buf[this.pos++] = Number(i >> 56n) & 0xff;
        this.buf[this.pos++] = Number(i >> 48n) & 0xff;
        this.buf[this.pos++] = Number(i >> 40n) & 0xff;
        this.buf[this.pos++] = Number(i >> 32n) & 0xff;
        this.buf[this.pos++] = Number(i >> 24n) & 0xff;
        this.buf[this.pos++] = Number(i >> 16n) & 0xff;
        this.buf[this.pos++] = Number(i >> 8n) & 0xff;
        this.buf[this.pos++] = Number(i) & 0xff;
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
        this.writeUInt64(i & 0xffffffffffffffffn);
    }

    writeVarint(i: number): void {
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
        return u;
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
            throw CoderError.BufferTooShort;
        }
        const p = this.buf.slice(this.pos);
        this.pos = l;
        return p;
    }
}

export function NewEncoder(cap?: number): Encoder {
    return new Coder(cap);
}

export function NewDecoder(bytes: Uint8Array): Decoder {
    const coder = new Coder();
    coder.writeBytes(bytes);
    coder['pos'] = 0; // Reset position for reading
    return coder;
}
export interface Encodable {
    writeTo(encoder: Encoder): void;
}
export interface Decodable {
    readFrom(decoder: Decoder): void;
}
export type Codable = Encodable & Decodable;

export function encode(ec: Encodable): Uint8Array {
    const encoder = NewEncoder();
    ec.writeTo(encoder);
    return encoder.bytes();
}
export function decode(bytes: Uint8Array, dc: Decodable) {
    dc.readFrom(NewDecoder(bytes));
}

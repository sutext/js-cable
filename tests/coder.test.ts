import { NewEncoder, NewDecoder } from '../src/coder';

describe('Coder Encoding and Decoding', () => {
    const testTypeConsistency = <T>(
        value: T,
        encodeFn: (encoder: ReturnType<typeof NewEncoder>, value: T) => void,
        decodeFn: (decoder: ReturnType<typeof NewDecoder>) => T,
    ): T => {
        const encoder = NewEncoder();
        encodeFn(encoder, value);
        const bytes = encoder.bytes();
        const decoder = NewDecoder(bytes);
        return decodeFn(decoder);
    };

    const uint8ArraysEqual = (a: Uint8Array, b: Uint8Array): boolean => {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    };

    const mapsEqual = <K, V>(a: Map<K, V>, b: Map<K, V>): boolean => {
        if (a.size !== b.size) return false;
        for (const [key, value] of a) {
            if (!b.has(key) || b.get(key) !== value) return false;
        }
        return true;
    };

    describe('Basic Data Types', () => {
        it('should encode and decode UInt8 correctly', () => {
            const testValues = [0, 1, 127, 255];
            for (const value of testValues) {
                const decoded = testTypeConsistency(
                    value,
                    (encoder, val) => encoder.writeUInt8(val),
                    (decoder) => decoder.readUInt8(),
                );
                expect(decoded).toBe(value);
            }
        });

        it('should encode and decode UInt16 correctly', () => {
            const testValues = [0, 1, 255, 256, 65535];
            for (const value of testValues) {
                const decoded = testTypeConsistency(
                    value,
                    (encoder, val) => encoder.writeUInt16(val),
                    (decoder) => decoder.readUInt16(),
                );
                expect(decoded).toBe(value);
            }
        });

        it('should encode and decode UInt32 correctly', () => {
            const testValues = [0, 1, 65535, 65536, 2147483647];
            for (const value of testValues) {
                const decoded = testTypeConsistency(
                    value,
                    (encoder, val) => encoder.writeUInt32(val),
                    (decoder) => decoder.readUInt32(),
                );
                expect(decoded).toBe(value);
            }
        });

        it('should encode and decode UInt64 correctly', () => {
            const testValues = [0n, 1n, 65535n, 65536n, 4294967295n, 1000000000000000n, BigInt(2 ** 63), 9223372036854775807n];
            for (const value of testValues) {
                const decoded = testTypeConsistency(
                    value,
                    (encoder, val) => encoder.writeUInt64(val),
                    (decoder) => decoder.readUInt64(),
                );
                expect(decoded).toBe(value);
            }
        });

        it('should encode and decode Bool correctly', () => {
            const testValues = [true, false];
            for (const value of testValues) {
                const decoded = testTypeConsistency(
                    value,
                    (encoder, val) => encoder.writeBool(val),
                    (decoder) => decoder.readBool(),
                );
                expect(decoded).toBe(value);
            }
        });

        it('should encode and decode Int8 correctly', () => {
            const testValues = [-128, -1, 0, 1, 127];
            for (const value of testValues) {
                const decoded = testTypeConsistency(
                    value,
                    (encoder, val) => encoder.writeInt8(val),
                    (decoder) => decoder.readInt8(),
                );
                expect(decoded).toBe(value);
            }
        });

        it('should encode and decode Int16 correctly', () => {
            const testValues = [-32768, -1, 0, 1, 32767];
            for (const value of testValues) {
                const decoded = testTypeConsistency(
                    value,
                    (encoder, val) => encoder.writeInt16(val),
                    (decoder) => decoder.readInt16(),
                );
                expect(decoded).toBe(value);
            }
        });

        it('should encode and decode Int32 correctly', () => {
            const testValues = [-2147483648, -1, 0, 1, 2147483647];
            for (const value of testValues) {
                const decoded = testTypeConsistency(
                    value,
                    (encoder, val) => encoder.writeInt32(val),
                    (decoder) => decoder.readInt32(),
                );
                expect(decoded).toBe(value);
            }
        });

        it('should encode and decode Int64 correctly', () => {
            const testValues = [-9223372036854775808n, -3213123123213n, -1n, 0n, 1n, 123456789n, 9223372036854775807n];
            for (const value of testValues) {
                const decoded = testTypeConsistency(
                    value,
                    (encoder, val) => encoder.writeInt64(val),
                    (decoder) => decoder.readInt64(),
                );
                expect(decoded).toBe(value);
            }
        });

        it('should encode and decode Varint correctly', () => {
            const testValues = [0, 1, 127, 128, 255, 256, 1023, 1024, 4095, 4096];
            for (const value of testValues) {
                const decoded = testTypeConsistency(
                    value,
                    (encoder, val) => encoder.writeVarint(val),
                    (decoder) => decoder.readVarint(),
                );
                expect(decoded).toBe(value);
            }
        });
    });

    describe('String and Bytes Types', () => {
        it('should encode and decode String correctly', () => {
            const testValues = ['', 'a', 'hello', 'hello world', '中文测试', 'a'.repeat(1000)];
            for (const value of testValues) {
                const encoder = NewEncoder();
                encoder.writeString(value);
                const bytes = encoder.bytes();
                const decoder = NewDecoder(bytes);
                const decoded = decoder.readString();
                expect(decoded).toBe(value);
            }
        });

        it('should encode and decode Data correctly', () => {
            const testValues = [
                new Uint8Array([]),
                new Uint8Array([1]),
                new Uint8Array([1, 2, 3, 4, 5]),
                new Uint8Array([255, 254, 253, 252, 251]),
                new Uint8Array(Array.from({ length: 1000 }, (_, i) => i % 256)),
            ];
            for (const value of testValues) {
                const encoder = NewEncoder();
                encoder.writeData(value);
                const bytes = encoder.bytes();
                const decoder = NewDecoder(bytes);
                const decoded = decoder.readData();
                expect(uint8ArraysEqual(decoded, value)).toBe(true);
            }
        });

        it('should encode and decode Bytes correctly', () => {
            const testValues = [new Uint8Array([]), new Uint8Array([1]), new Uint8Array([1, 2, 3, 4, 5])];
            for (const value of testValues) {
                const encoder = NewEncoder();
                encoder.writeBytes(value);
                const bytes = encoder.bytes();
                const decoder = NewDecoder(bytes);
                const decoded = decoder.readBytes(value.length);
                expect(uint8ArraysEqual(decoded, value)).toBe(true);
            }
        });
    });

    describe('Collection Types', () => {
        it('should encode and decode Strings array correctly', () => {
            const testValues = [[], ['a'], ['hello', 'world'], ['中文', '测试', 'array'], Array.from({ length: 100 }, (_, i) => `str${i}`)];
            for (const value of testValues) {
                const encoder = NewEncoder();
                encoder.writeStrings(value);
                const bytes = encoder.bytes();
                const decoder = NewDecoder(bytes);
                const decoded = decoder.readStrings();
                expect(decoded).toEqual(value);
            }
        });

        it('should encode and decode StrMap correctly', () => {
            const testValues = [
                new Map(),
                new Map([['key', 'value']]),
                new Map([
                    ['key1', 'value1'],
                    ['key2', 'value2'],
                ]),
                new Map([
                    ['中文键', '中文值'],
                    ['key', 'value'],
                ]),
            ];
            for (const value of testValues) {
                const encoder = NewEncoder();
                encoder.writeStrMap(value);
                const bytes = encoder.bytes();
                const decoder = NewDecoder(bytes);
                const decoded = decoder.readStrMap();
                expect(mapsEqual(decoded, value)).toBe(true);
            }
        });

        it('should encode and decode UInt8Map correctly', () => {
            const testValues = [
                new Map(),
                new Map([[1, 'value']]),
                new Map([
                    [1, 'value1'],
                    [2, 'value2'],
                ]),
                new Map([
                    [255, 'max'],
                    [0, 'min'],
                ]),
            ];
            for (const value of testValues) {
                const encoder = NewEncoder();
                encoder.writeUInt8Map(value);
                const bytes = encoder.bytes();
                const decoder = NewDecoder(bytes);
                const decoded = decoder.readUInt8Map();
                expect(mapsEqual(decoded, value)).toBe(true);
            }
        });
    });

    describe('Complex Encoding Scenarios', () => {
        it('should encode and decode multiple different types sequentially', () => {
            const encoder = NewEncoder();

            encoder.writeUInt8(42);
            encoder.writeString('hello');
            encoder.writeBool(true);
            encoder.writeInt32(-12345);
            encoder.writeVarint(128);
            encoder.writeUInt64(123456789n);

            const bytes = encoder.bytes();
            const decoder = NewDecoder(bytes);

            expect(decoder.readUInt8()).toBe(42);
            expect(decoder.readString()).toBe('hello');
            expect(decoder.readBool()).toBe(true);
            expect(decoder.readInt32()).toBe(-12345);
            expect(decoder.readVarint()).toBe(128);
            expect(decoder.readUInt64()).toBe(123456789n);
        });

        it('should handle large data encoding correctly', () => {
            const largeString = 'a'.repeat(10000);
            const largeBytes = new Uint8Array(10000);
            for (let i = 0; i < 10000; i++) {
                largeBytes[i] = i % 256;
            }

            const encoder = NewEncoder();
            encoder.writeString(largeString);
            encoder.writeData(largeBytes);

            const bytes = encoder.bytes();
            const decoder = NewDecoder(bytes);

            expect(decoder.readString()).toBe(largeString);
            expect(uint8ArraysEqual(decoder.readData(), largeBytes)).toBe(true);
        });
    });
});

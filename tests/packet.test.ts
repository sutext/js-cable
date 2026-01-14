import {
    Connect,
    Connack,
    Message,
    Messack,
    Request,
    Response,
    Ping,
    Pong,
    Close,
    Identity,
    ConnackCode,
    MessageQos,
    StatusCode,
    CloseCode,
    Property,
    encode,
    decode,
    Packet,
    PacketType,
} from '../src/packet';

describe('Packet Encoding and Decoding', () => {
    // 测试辅助函数：验证编码解码后是否一致
    const testPacketConsistency = <T extends Packet>(packet: T) => {
        const encoded = encode(packet);
        const decoded = decode(encoded);
        expect(decoded.type).toBe(packet.type);
        return decoded as T;
    };

    // 测试辅助函数：比较两个Uint8Array是否相等
    const uint8ArraysEqual = (a: Uint8Array, b: Uint8Array): boolean => {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    };

    describe('Connect Packet', () => {
        it('should encode and decode correctly with identity', () => {
            const identity = new Identity('test-user', 'test-client', 'test-password');
            const connect = new Connect(identity);
            // 添加属性
            connect.set(Property.ConnID, 'conn-123');
            const decoded = testPacketConsistency(connect);
            expect(decoded.type).toBe(PacketType.CONNECT);
            expect(decoded.identity.userID).toBe('test-user');
            expect(decoded.identity.clientID).toBe('test-client');
            expect(decoded.identity.password).toBe('test-password');
            expect(decoded.get(Property.ConnID)).toBe('conn-123');
        });

        it('should encode and decode correctly with empty identity', () => {
            const connect = new Connect();
            const decoded = testPacketConsistency(connect);
            expect(decoded.type).toBe(PacketType.CONNECT);
            expect(decoded.identity.userID).toBe('');
            expect(decoded.identity.clientID).toBe('');
            expect(decoded.identity.password).toBe('');
        });
    });

    describe('Connack Packet', () => {
        it('should encode and decode correctly with Accepted code', () => {
            const connack = new Connack(ConnackCode.Accepted);
            connack.set(Property.UserID, 'test-user');
            const decoded = testPacketConsistency(connack);
            expect(decoded.type).toBe(PacketType.CONNACK);
            expect(decoded.code).toBe(ConnackCode.Accepted);
            expect(decoded.get(Property.UserID)).toBe('test-user');
        });

        it('should encode and decode correctly with Rejected code', () => {
            const connack = new Connack(ConnackCode.Rejected);
            const decoded = testPacketConsistency(connack);
            expect(decoded.type).toBe(PacketType.CONNACK);
            expect(decoded.code).toBe(ConnackCode.Rejected);
        });
    });

    describe('Message Packet', () => {
        it('should encode and decode correctly with QoS 0', () => {
            const payload = new TextEncoder().encode('Hello, Cable!');
            const message = new Message(123n, payload);
            message.qos = MessageQos.Qos0;
            message.dup = false;
            message.kind = 42;
            message.set(Property.Channel, 'test-channel');

            const decoded = testPacketConsistency(message);
            expect(decoded.type).toBe(PacketType.MESSAGE);
            expect(decoded.id).toBe(123n);
            expect(uint8ArraysEqual(decoded.payload, payload)).toBe(true);
            expect(decoded.qos).toBe(MessageQos.Qos0);
            expect(decoded.dup).toBe(false);
            expect(decoded.kind).toBe(42);
            expect(decoded.get(Property.Channel)).toBe('test-channel');
        });

        it('should encode and decode correctly with QoS 1 and dup true', () => {
            const payload = new TextEncoder().encode('QoS 1 message');
            const message = new Message(456n, payload);
            message.qos = MessageQos.Qos1;
            message.dup = true;
            message.kind = 60; // 小于kindMask(63)

            const decoded = testPacketConsistency(message);
            expect(decoded.type).toBe(PacketType.MESSAGE);
            expect(decoded.id).toBe(456n);
            expect(uint8ArraysEqual(decoded.payload, payload)).toBe(true);
            expect(decoded.qos).toBe(MessageQos.Qos1);
            expect(decoded.dup).toBe(true);
            expect(decoded.kind).toBe(60);
        });

        it('should encode and decode correctly with large ID', () => {
            const payload = new TextEncoder().encode('Large ID message');
            const largeId = BigInt(2 ** 63) - 1n; // 大数值ID
            const message = new Message(largeId, payload);

            const decoded = testPacketConsistency(message);
            expect(decoded.type).toBe(PacketType.MESSAGE);
            expect(decoded.id).toBe(largeId);
            expect(uint8ArraysEqual(decoded.payload, payload)).toBe(true);
        });
        it('should encode and decode correctly with large body', () => {
            const payload = new TextEncoder().encode('Large body message'.repeat(1000));
            const largeId = BigInt(2 ** 63) - 1n; // 大数值ID
            const message = new Message(largeId, payload);

            const decoded = testPacketConsistency(message);
            expect(decoded.type).toBe(PacketType.MESSAGE);
            expect(decoded.id).toBe(largeId);
            expect(uint8ArraysEqual(decoded.payload, payload)).toBe(true);
        });
    });

    describe('Messack Packet', () => {
        it('should encode and decode correctly with small ID', () => {
            const messack = new Messack(789n);
            messack.set(Property.ClientID, 'client-456');

            const decoded = testPacketConsistency(messack);
            expect(decoded.type).toBe(PacketType.MESSACK);
            expect(decoded.id).toBe(789n);
            expect(decoded.get(Property.ClientID)).toBe('client-456');
        });

        it('should encode and decode correctly with large ID', () => {
            const largeId = BigInt('1000000000000000000');
            const messack = new Messack(largeId);

            const decoded = testPacketConsistency(messack);
            expect(decoded.type).toBe(PacketType.MESSACK);
            expect(decoded.id).toBe(largeId);
        });
    });

    describe('Request Packet', () => {
        it('should encode and decode correctly with method and body', () => {
            const body = new TextEncoder().encode('Request body data');
            const request = new Request('get-resources', body);
            request.set(Property.UserID, 'user-789');
            const decoded = testPacketConsistency(request);
            expect(decoded.type).toBe(PacketType.REQUEST);
            expect(decoded.id).toBe(request.id);
            expect(decoded.method).toBe('get-resources');
            expect(uint8ArraysEqual(decoded.body, body)).toBe(true);
            expect(decoded.get(Property.UserID)).toBe('user-789');
        });

        it('should encode and decode correctly with empty body', () => {
            const request = new Request('empty-request', new Uint8Array());
            const decoded = testPacketConsistency(request);
            expect(decoded.type).toBe(PacketType.REQUEST);
            expect(decoded.id).toBe(request.id);
            expect(decoded.method).toBe('empty-request');
            expect(decoded.body.length).toBe(0);
        });
    });

    describe('Response Packet', () => {
        it('should encode and decode correctly with OK status', () => {
            const body = new TextEncoder().encode('Success response');
            const response = new Response(9012n, StatusCode.OK, body);
            response.set(Property.ConnID, 'conn-456');

            const decoded = testPacketConsistency(response);
            expect(decoded.type).toBe(PacketType.RESPONSE);
            expect(decoded.code).toBe(StatusCode.OK);
            expect(uint8ArraysEqual(decoded.body, body)).toBe(true);
            expect(decoded.get(Property.ConnID)).toBe('conn-456');
        });

        it('should encode and decode correctly with NotFound status', () => {
            const response = new Response(3456n, StatusCode.NotFound, new Uint8Array());
            const decoded = testPacketConsistency(response);
            expect(decoded.type).toBe(PacketType.RESPONSE);
            expect(decoded.id).toBe(3456n);
            expect(decoded.code).toBe(StatusCode.NotFound);
            expect(decoded.body.length).toBe(0);
        });
    });

    describe('Ping Packet', () => {
        it('should encode and decode correctly', () => {
            const ping = new Ping();
            ping.set(Property.UserID, 'ping-user');
            const decoded = testPacketConsistency(ping);
            expect(decoded.type).toBe(PacketType.PING);
            expect(decoded.get(Property.UserID)).toBe('ping-user');
        });
    });

    describe('Pong Packet', () => {
        it('should encode and decode correctly', () => {
            const pong = new Pong();
            pong.set(Property.ClientID, 'pong-client');

            const decoded = testPacketConsistency(pong);
            expect(decoded.type).toBe(PacketType.PONG);
            expect(decoded.get(Property.ClientID)).toBe('pong-client');
        });
    });

    describe('Close Packet', () => {
        it('should encode and decode correctly with Normal code', () => {
            const close = new Close(CloseCode.Normal);
            const decoded = testPacketConsistency(close);
            expect(decoded.type).toBe(PacketType.CLOSE);
            expect(decoded.code).toBe(CloseCode.Normal);
        });

        it('should encode and decode correctly with AuthFailure code', () => {
            const close = new Close(CloseCode.AuthFailure);
            const decoded = testPacketConsistency(close);
            expect(decoded.type).toBe(PacketType.CLOSE);
            expect(decoded.code).toBe(CloseCode.AuthFailure);
        });
    });
});

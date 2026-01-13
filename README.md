# js-cable

A JavaScript client implementation for the Cable protocol, built with TypeScript.

## Features

-   WebSocket-based communication
-   Message sending with QoS support
-   Request/Response pattern
-   Built-in ping/pong heartbeat mechanism
-   Connection status management
-   Type-safe API with TypeScript

## Installation

```bash
npm install @sutext/cable
```

## Basic Usage

```typescript
import { Client, Status, Handler, Identity } from '@sutext/cable';
import * as packet from '@sutext/cable';

// Create a handler to process events
const handler: Handler = {
    onStatus(status: Status) {
        console.log('Connection status changed:', Status[status]);
    },

    onMessage(message: packet.Message) {
        console.log('Received message:', message);
    },

    onRequest(request: packet.Request): packet.Response | null {
        console.log('Received request:', request);
        // Process request and return response if needed
        return null;
    },
};

// Create client instance
const client = new Client('ws://localhost:8080/cable', {
    handler,
    pingInterval: 30000, // 30 seconds
    pingTimeout: 5000, // 5 seconds
    requestTimeout: 10000, // 10 seconds
    messageTimeout: 10000, // 10 seconds
});

// Connect to server with identity
client.connect(new Identity('test-user', 'test-client', 'test-password'));

// Send a message
const message: packet.Message = new packet.Message(Bigint(Date.now()), new TextEncoder().encode('Hello, world!'));

client
    .sendMessage(message)
    .then(() => console.log('Message sent successfully'))
    .catch((err) => console.error('Failed to send message:', err));

// Send a request
const request: packet.Request = new packet.Request(Bigint(Date.now()), 'test-request', new TextEncoder().encode('Request params'));

client
    .sendRequest(request)
    .then((response) => console.log('Received response:', response))
    .catch((err) => console.error('Request failed:', err));

// Close connection when done
setTimeout(() => {
    client.close();
}, 60000);
```

## API Reference

### Client

#### Constructor

```typescript
new Client(url: string, options?: Options)
```

-   `url`: WebSocket server URL
-   `options`: Configuration options

#### Options

```typescript
interface Options {
    pingInterval?: number; // Ping interval in milliseconds (default: 30000)
    pingTimeout?: number; // Ping timeout in milliseconds (default: 5000)
    requestTimeout?: number; // Request timeout in milliseconds (default: 10000)
    messageTimeout?: number; // Message timeout in milliseconds (default: 10000)
    handler?: Handler; // Event handler
}
```

#### Methods

##### connect(identity: Identity)

Connect to the Cable server with the given identity.

##### close()

Close the connection.

##### sendMessage(message: Message): Promise<void>

Send a message to the server. Returns a promise that resolves when the message is acknowledged (if QoS=1).

##### sendRequest(request: Request): Promise<Response>

Send a request to the server and wait for a response. Returns a promise that resolves with the response.

#### Properties

##### id: Identity | null

The identity used for the connection.

##### status: Status

Current connection status.

##### isReady: boolean

Whether the connection is ready to send messages.

### Status

```typescript
enum Status {
    Unknown = 0,
    Opening = 1,
    Opened = 2,
    Closing = 3,
    Closed = 4,
}
```

### Handler

```typescript
interface Handler {
    onStatus(status: Status): void;
    onMessage(message: packet.Message): void;
    onRequest(request: packet.Request): packet.Response | null;
}
```

## Packet Types

The Cable protocol defines several packet types for communication:

-   `CONNECT`: Establish connection with identity
-   `CONNACK`: Connection acknowledgment
-   `MESSAGE`: Data message with QoS support
-   `MESSACK`: Message acknowledgment
-   `REQUEST`: Request packet
-   `RESPONSE`: Response packet
-   `PING`: Ping keep-alive
-   `PONG`: Pong response
-   `CLOSE`: Close connection

## License

Apache-2.0

# @sutext/cable

A lightweight JavaScript client library for Cable protocol, providing a simple and reliable way to communicate with Cable servers over WebSocket.

## Features

-   Easy-to-use API for WebSocket communication
-   Support for different Quality of Service (QoS) levels
-   Automatic reconnection with configurable backoff strategies
-   Request-response communication pattern
-   Built-in ping/pong keep-alive mechanism
-   TypeScript support with full type definitions
-   Lightweight with no external dependencies

## Installation

```bash
npm install @sutext/cable
```

## Basic Usage

### Creating a Client

```typescript
import { Client, Identity, Status, Handler } from '@sutext/cable';

// Create a new client instance
const client = new Client('ws://localhost:1881', {
    handler: {
        onStatus: (status) => {
            console.log('Connection status:', Status[status]);
            if (status === Status.Opened) {
                console.log('Connected to server!');
            }
        },
        onMessage: (message) => {
            console.log('Received message:', message);
        },
        onRequest: (request) => {
            // Handle incoming requests
            return request.response(0, new Uint8Array());
        },
    },
});

// Connect to the server
const identity = new Identity('user123', 'client456', 'password789');
client.connect(identity);
```

### Sending Messages

```typescript
// Send a simple message (QoS 0 - at most once)
client.send({
    kind: 1,
    payload: new TextEncoder().encode('Hello, server!'),
});

// Send a message with QoS 1 (at least once)
client.send({
    qos: 1,
    kind: 2,
    payload: new TextEncoder().encode('Important message'),
});
```

### Request-Response Pattern

```typescript
// Send a request and wait for response
client
    .request('get_status', new Uint8Array())
    .then((response) => {
        console.log('Response received:', new TextDecoder().decode(response.body));
    })
    .catch((error) => {
        console.error('Request failed:', error);
    });
```

### Configuring Automatic Reconnection

```typescript
import { Client, ExponentialBackoff } from 'js-cable';

const client = new Client('ws://localhost:8080');

// Configure automatic reconnection with exponential backoff
client.autoRetry({
    limit: 5, // Maximum 5 retry attempts
    backoff: new ExponentialBackoff(2, 0.1), // Exponential backoff with jitter
});
```

## API Reference

### Client

The `Client` class is the main entry point for communicating with the Cable server.

#### Constructor

```typescript
constructor(url: string, options?: Options)
```

-   `url`: WebSocket server URL
-   `options`: Optional configuration options
    -   `pingInterval`: Ping interval in milliseconds (default: 30000)
    -   `pingTimeout`: Ping timeout in milliseconds (default: 5000)
    -   `requestTimeout`: Request timeout in milliseconds (default: 10000)
    -   `messageTimeout`: Message timeout in milliseconds (default: 10000)
    -   `messageMaxRetry`: Maximum number of message retries (default: 5)
    -   `handler`: Custom event handler

#### Methods

-   `connect(identity: Identity)`: Connect to the server
-   `close(code?: CloseCode)`: Close the connection
-   `autoRetry(opts: { limit?: number; backoff?: Backoff; filter?: RetryFilter })`: Configure automatic reconnection
-   `send(msg: Message)`: Send a message to the server
-   `request(method: string, body: Uint8Array, props?: Map<Property, string>)`: Send a request and wait for response

#### Properties

-   `id`: Client identity information
-   `status`: Current connection status
-   `isReady`: Whether the connection is ready

### Identity

Represents client identification information.

```typescript
constructor(userID?: string, clientID?: string, password?: string)
```

### Message

Interface for sending messages.

```typescript
interface Message {
    qos?: MessageQos;
    kind?: MessageKind;
    props?: Map<Property, string>;
    payload?: Uint8Array;
}
```

### Backoff Strategies

The library provides several backoff strategies for automatic reconnection:

-   `ExponentialBackoff`: Exponential delay with jitter
-   `LinearBackoff`: Linear delay with jitter
-   `RandomBackoff`: Random delay within a range
-   `ConstBackoff`: Constant delay

## Status Codes

### Connection Status

-   `Unknown`: Connection status is unknown
-   `Opening`: Connection is being established
-   `Opened`: Connection is established and ready
-   `Closing`: Connection is closing
-   `Closed`: Connection is closed

### Error Codes

-   `NotReady`: Connection is not ready
-   `RequestTimeout`: Request timed out
-   `MessageTimeout`: Message timed out

## Protocol

The Cable protocol is a lightweight binary protocol designed for efficient communication over WebSocket. It supports:

-   Connection establishment and authentication
-   Message publishing with different QoS levels
-   Request-response communication
-   Ping/pong keep-alive
-   Graceful connection closure

## License

Apache 2.0

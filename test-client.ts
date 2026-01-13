import * as cable from './src';

class TestClient implements cable.Handler {
    identity: cable.Identity = new cable.Identity('test-user', 'test-client', 'test-password');
    cli: cable.Client;
    constructor() {
        this.cli = new cable.Client('ws://localhost:1688/', {
            handler: this,
        });
        this.cli.autoRetry({
            filter: (reason) => {
                if (reason.type === cable.ReasonType.serverClosed) {
                    const sreason = reason as cable.ServerClosed;
                    switch (sreason.code) {
                        case cable.CloseCode.Normal:
                        case cable.CloseCode.Kickout:
                        case cable.CloseCode.AuthFailure:
                            return true;
                        default:
                            return false;
                    }
                }
                return false;
            },
        });
    }
    onStatus(status: cable.Status): void {
        if (status === cable.Status.Opened) {
            const testMessage = new cable.Message(1n << 63n, new TextEncoder().encode('Hello, Cable!'));
            testMessage.qos = cable.MessageQos.Qos1;
            this.cli
                .sendMessage(testMessage)
                .then(() => console.log('Message sent successfully'))
                .catch((err) => console.error('Failed to send message:', err));
            const testRequest = new cable.Request(1n, 'test-request', new TextEncoder().encode('Request params'));
            this.cli
                .sendRequest(testRequest)
                .then((response) => {
                    const data = new TextDecoder().decode(response.body);
                    console.log(`Request response: ${data}`);
                })
                .catch((err) => console.error('Failed to send request:', err));
        }
    }
    onMessage(message: cable.Message) {
        const data = new TextDecoder().decode(message.payload);
        console.log(`Received message: ${message.kind} - ${data}`);
    }
    onRequest(request: cable.Request): cable.Response {
        console.log(`Received request: ${request.method}`);
        return request.response(cable.StatusCode.OK, new TextEncoder().encode('Response data'));
    }
    connect() {
        this.cli.connect(this.identity);
    }
}
const client = new TestClient();
client.connect();

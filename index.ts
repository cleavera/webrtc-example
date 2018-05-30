import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as ws from 'ws';

const options = {
    key: fs.readFileSync('config/keys/msl1901.key'),
    cert: fs.readFileSync('config/keys/msl1901.cert')
};

let server: https.Server = https.createServer(options, (req: http.IncomingMessage, res: http.ServerResponse) => {
    let url: string | void = req.url;

    if (url === '/') {
        url = 'index.html';
    }

    try {
        res.write(fs.readFileSync(`./static/${url}`));
    } catch (e) {
        res.statusCode = 404;
    }

    res.end();
});

server.listen({port: 1337, host: '0.0.0.0'}, () => {
    console.info((new Date()) + ' Server is listening on port 1337');
});

const wss = new ws.Server({ server });

function broadcast(data: any) {
    wss.clients.forEach((client: ws) => {
        client.send(data);
    });
}

wss.on('connection', function(socket: ws) {
    console.log(`New connection ${socket}`);

    const base64Array: Array<string> = [];

    socket.on('message', function(message: string) {
        const data: any = JSON.parse(message);

        if (data.stream) {
            console.log(`Stream, chunk: ${data.stream.chunk}, mimetype: ${data.stream.mimeType}`);
            base64Array[data.stream.chunk] = data.stream.data;
        } else {
            console.log('received: %s', message);
            broadcast(message);
        }
    });

    socket.on('close', () => {
        const buffers: Array<Buffer> = [];

        base64Array.forEach((base64Value) => {
            buffers.push(Buffer.from(base64Value, 'base64'));
        });

        const buffer: Buffer = Buffer.concat(buffers);

        fs.appendFileSync('./fileupload.webm', buffer);
    });

    socket.on('error', (e) => console.error(e));
});

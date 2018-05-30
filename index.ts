import * as http from 'http';
import * as fs from 'fs';
import * as ws from 'ws';

let server: http.Server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
    let url: string | void = req.url;

    if (url === '/') {
        url = 'index.html';
    }

    if (url === '/api') {
        console.log('hello');
    } else {
        try {
            res.write(fs.readFileSync(`./static/${url}`));
        } catch (e) {
            res.statusCode = 404;
        }
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
    socket.on('message', function(message: string) {
        console.log('received: %s', message);
        broadcast(message);
    });

    socket.on('error', (e) => console.error(e));
});

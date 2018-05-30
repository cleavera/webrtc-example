import { WriteStream } from "fs";
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as ws from 'ws';

const options = {
    key: fs.readFileSync('config/keys/msl1901.key'),
    cert: fs.readFileSync('config/keys/msl1901.cert')
};

let stream = 0;

const clients: Array<ws> = [];

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
    clients.forEach((client: ws) => {
        if (client) {
            try {
                client.send(data);
            } catch (e) {
                console.error(e);
            }
        }
    });
}

wss.on('connection', function(socket: ws) {
    const thisStream = stream++;
    console.log(`New connection ${thisStream}`);

    const wstream: WriteStream = fs.createWriteStream(`./fileupload-${thisStream}.webm`);
    const newId: number = clients.push(socket) - 1;

    socket.send(JSON.stringify({ init: { id: newId, clients: Object.keys(clients) } }));
    broadcast(JSON.stringify({ joined: { id: newId }}));

    socket.on('message', function(message: string | Buffer) {
        if (typeof message === 'string') {
            const data: any = JSON.parse(message);
            console.log(`${data.id} is doing a ${Object.keys(data)}`);
            broadcast(message);
        } else {
            wstream.write(message);
        }
    });

    socket.on('close', () => {
        wstream.end();
        clients.splice(newId, 1);
    });

    socket.on('error', (e) => console.error(e));
});

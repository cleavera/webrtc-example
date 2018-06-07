var peerConnectionConfig = { 'iceServers': [{'urls': 'stun:stun.services.mozilla.com'}, {'urls': 'stun:stun.l.google.com:19302'}] };
var peerConnections = [];
var recorder;
var videoChunks;
var id;

window.RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;

document.querySelector('[data-questions-answer]').style.display = 'none';

const serverConnection = new WebSocket(`wss://${location.host}`);
serverConnection.onmessage = (message) => {
    gotMessageFromServer(message);
};

serverConnection.onclose = () => {
    stop();
};

document.querySelector('[data-call]').addEventListener('click', () => {
    console.log('Start');
    start();
});

document.querySelector('[data-stop]').addEventListener('click', stop);

function stop () {
    console.log('End');
    serverConnection.close();

    recorder.stop();

    document.querySelector('[data-video-local]').style.display = 'none';
}

showLocalStream();

function start() {
    window.navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then((stream) => {
        peerConnections.forEach((peerConnection, id) => {
            peerConnection.addStream(stream);

            peerConnection.createOffer(function(description) {
                gotDescription(description, id)
            }, function(error) {
                console.error(error);
            });
        });
    });
}

function showLocalStream() {
    window.navigator.mediaDevices.getUserMedia({ audio: false, video: true }).then((stream) => {
        videoStream(stream, 'local');

        recorder = new MediaRecorder(stream);

        videoChunks = [];

        recorder.onerror = function(e) {
            console.error(e);
        };

        recorder.ondataavailable = function(e) {
            videoChunks.push(e.data);

            serverConnection.send(e.data);
        };

        recorder.start(1000);
    }, (e) => {
        console.error(e);
    });
}

function videoStream(stream, clientId) {
    let video = createVideo(clientId);

    video.srcObject = stream;

    return video;
}

function createVideo(videoId) {
    let video = document.createElement('video');

    video.autoplay = true;
    video.setAttribute(`data-video-${videoId}`, true);

    document.querySelector('[data-videos]').appendChild(video);

    return video;
}

function gotIceCandidate(event) {
    if(event.candidate != null) {
        serverConnection.send(JSON.stringify({
            handshake: {
                ice: event.candidate
            },
            id: id
        }));
    }
}

function gotRemoteStream(stream, clientId) {
    console.log('got remote stream', stream);
    videoStream(stream, clientId);
}

function gotDescription(description, otherId) {
    console.log(`${otherId} got description`);
    peerConnections[otherId].setLocalDescription(description, function () {
        serverConnection.send(JSON.stringify({
            for: otherId,
            handshake: {
                sdp: description
            },
            id: id
        }));
    }, function(error) {
        console.error(error);
    });
}

function gotMessageFromServer(message) {
    var signal = JSON.parse(message.data);
    console.log(`Message: ${JSON.stringify(signal)}`);

    if (signal.stream) {
        return;
    }

    if (signal.for && signal.for !== id) {
        return;
    }

    if (signal.handshake) {
        gotHandshake(signal.handshake, signal.id)
    }

    if (signal.init) {
        gotInit(signal.init);
    }

    if (signal.joined) {
        gotJoined(signal.joined);
    }

    if (signal.left) {
        gotLeft(signal.left);
    }
}

function gotLeft(left) {
    var video = document.querySelector(`[data-video-${left.id}]`);
    if (video) {
        video.parentElement.removeChild(video);
    }

    if (peerConnections[left.id]) {
        peerConnections[left.id].close();
    }

    document.querySelector('[data-chat-out]').innerText += `\nClient ${left.id} left the conversation`;
}

function gotHandshake(handshake, id) {
    if (!peerConnections[id]) {
        return;
    }

    if(handshake.sdp) {
        peerConnections[id].setRemoteDescription(new RTCSessionDescription(handshake.sdp), function() {
            if(handshake.sdp.type === 'offer') {
                peerConnections[id].createAnswer(function(description) {
                    gotDescription(description, id)
                }, function(error) {
                    console.error(error);
                });
            }
        }, function(error) {
            console.error(error);
        });
    } else if(handshake.ice) {
        peerConnections[id].addIceCandidate(new RTCIceCandidate(handshake.ice));
    }
}

function gotInit(init) {
    id = init.id;

    document.querySelector('[data-name]').value = `client-${id}`;

    addClients(init.clients);
}

function gotJoined(joined) {
    addClients([joined.id])
}

function addClients(clients) {
    console.log(`Adding clients ${clients}`);
    clients.forEach((clientId) => {
        if (Number(clientId) === Number(id)) {
            return;
        }

        peerConnections[clientId] = new RTCPeerConnection(peerConnectionConfig);

        peerConnections[clientId].onicecandidate = gotIceCandidate;
        peerConnections[clientId].onaddstream = (event) => {
            gotRemoteStream(event.stream, clientId);
        };
    });
}

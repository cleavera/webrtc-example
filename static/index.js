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

var questions = [
    {
        text: 'What is love?',
        options: [
            'Baby dont hurt me',
            'Dont hurt me',
            'No more'
        ]
    },
    {
        text: 'How are you?',
        options: [
            'Great',
            'Not great',
            'Bad'
        ]
    }
];

document.querySelector('[data-call]').addEventListener('click', () => {
    console.log('Start');
    start();
});

document.querySelector('[data-stop]').addEventListener('click', () => {
    console.log('End');
    serverConnection.close();

    recorder.stop();

    var blob = new Blob(videoChunks, { 'type' : recorder.mimeType });

    download(blob, `stream-${recorder.mimeType}.webm`);
    var video = createVideo();

    var url = window.URL.createObjectURL(blob);

    video.src = url;

    document.querySelector('[data-local-stream]').style.display = 'none';
});

document.querySelector('[data-chat-in]').addEventListener('submit', (e) => {
    e.preventDefault();

    var name = document.querySelector('[data-chat-name]');
    var text = document.querySelector('[data-chat-text]');

    sendChat(text.value, name.value);

    text.value = '';
});

document.querySelector('[data-questions-ask]').addEventListener('submit', (e) => {
    e.preventDefault();

    var question = document.querySelector('[data-questions-ask-select]');

    sendQuestion(question.value);
});

document.querySelector('[data-questions-answer]').addEventListener('submit', (e) => {
    e.preventDefault();

    var formData = new FormData(e.target);

    sendAnswer(formData.get('questionId'), formData.get('answerId'));

    document.querySelector('[data-questions-answer]').style.display = 'none';
});

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
        var video = videoStream(stream);

        video.setAttribute('data-local-stream', true);

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
    });
}

function videoStream(stream) {
    let video = createVideo();

    video.srcObject = stream;

    return video;
}

function createVideo() {
    let video = document.createElement('video');

    video.autoplay = true;

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

function sendChat(text, name) {
    serverConnection.send(JSON.stringify({
        message: {
            text: text,
            name: name
        },
        id: id
    }));
}

function sendQuestion(questionId) {
    serverConnection.send(JSON.stringify({
        question: {
            id: questionId
        },
        id: id
    }));
}

function sendAnswer(questionId, answerId) {
    serverConnection.send(JSON.stringify({
        answer: {
            question: questionId,
            answer: answerId
        },
        id: id
    }));
}

function gotRemoteStream(event) {
    console.log('got remote stream', event);
    videoStream(event.stream);
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

    if (signal.message) {
        gotMessage(signal.message, signal.id);
    }

    if (signal.question) {
        gotQuestion(signal.question, signal.id);
    }

    if (signal.answer) {
        gotAnswer(signal.answer, signal.id);
    }

    if (signal.init) {
        gotInit(signal.init);
    }

    if (signal.joined) {
        gotJoined(signal.joined);
    }
}

function gotMessage(message) {
    document.querySelector('[data-chat-out]').innerText += `\n${message.name}: ${message.text}`;
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

function createButton(label, value) {
    let button = document.createElement('button');

    button.innerText = label;
    button.name = 'answer';
    button.addEventListener('click', () => {
        var fieldset = document.querySelector('[data-questions-answer-fieldset]');

        fieldset.appendChild(createHiddenInput(value, 'answerId'));
    });

    return button;
}

function createLegend(label) {
    let legend = document.createElement('legend');

    legend.innerText = label;

    return legend;
}

function createHiddenInput(questionId, name) {
    let input = document.createElement('input');

    input.type = 'hidden';
    input.value = questionId;
    input.name = name;

    return input;
}

function gotQuestion(question) {
    var q = questions[question.id];

    var fieldset = document.querySelector('[data-questions-answer-fieldset]');

    fieldset.innerHTML = '';

    fieldset.appendChild(createLegend(q.text));
    fieldset.appendChild(createHiddenInput(question.id, 'questionId'));

    q.options.forEach((option, index) => {
        fieldset.appendChild(createButton(option, index));
    });

    document.querySelector('[data-questions-answer]').style.display = 'block';
}

function gotAnswer(answer) {
    var q = questions[answer.question];

    document.querySelector('[data-chat-out]').innerText += `\n${q.text}: ${q.options[answer.answer]}`;
}

function gotInit(init) {
    id = init.id;
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
        peerConnections[clientId].onaddstream = gotRemoteStream;
    });
}

var download = (function () {
    var a = document.createElement('a');

    document.body.appendChild(a);
    a.style.display = 'none';
    return function (blob, fileName) {
        var url = window.URL.createObjectURL(blob);
        a.href = url;
        a.download = fileName;
        a.click();
        window.URL.revokeObjectURL(url);
    };
}());

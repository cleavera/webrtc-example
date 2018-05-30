var peerConnectionConfig = { 'iceServers': [{'urls': 'stun:stun.services.mozilla.com'}, {'urls': 'stun:stun.l.google.com:19302'}] };
var peerConnection;
var recorder;
var videoChunks;
window.RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;

document.querySelector('[data-questions-answer]').style.display = 'none';

const serverConnection = new WebSocket('wss://localhost:1337');
serverConnection.onmessage = (message) => {
    gotMessageFromServer(message);
};

var questions = [
    {
        text: 'What is love?',
        options: [
            'Baby dont hurt me',
            'Baby dont hurt me',
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

document.querySelector('[data-show-local-stream]').addEventListener('click', () => {
    showLocalStream();
});

document.querySelector('[data-call]').addEventListener('click', () => {
    console.log('Start');
    start(true);
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

function start(isCaller) {
    peerConnection = new RTCPeerConnection(peerConnectionConfig);
    peerConnection.onicecandidate = gotIceCandidate;
    peerConnection.onaddstream = gotRemoteStream;

    if(isCaller) {
        window.navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then((stream) => {
            peerConnection.addStream(stream);

            peerConnection.createOffer(gotDescription, errorHandler);
        });
    }
}

function showLocalStream() {
    window.navigator.mediaDevices.getUserMedia({ audio: false, video: true }).then((stream) => {
        videoStream(stream);

        recorder = new MediaRecorder(stream);

        var chunk = 0;
        videoChunks = [];

        recorder.onerror = function(e) {
            console.error(e);
        };

        recorder.ondataavailable = function(e) {
            videoChunks.push(e.data);
            var thisChunk = chunk++;
            var reader = new FileReader();
            reader.readAsDataURL(e.data);
            reader.onloadend = function() {
                serverConnection.send(JSON.stringify({
                    stream: {
                        data: reader.result.replace(/data:[A-z\/]+;base64,/, ''),
                        chunk: thisChunk,
                        mimeType: recorder.mimeType
                    }
                }));
            };
        };

        recorder.start(1000);
    });
}

function videoStream(stream) {
    let video = createVideo();

    video.srcObject = stream;
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
            }
        }));
    }
}

function sendChat(text, name) {
    serverConnection.send(JSON.stringify({
        message: {
            text: text,
            name: name
        }
    }));
}

function sendQuestion(questionId) {
    serverConnection.send(JSON.stringify({
        question: {
            id: questionId
        }
    }));
}

function sendAnswer(questionId, answerId) {
    serverConnection.send(JSON.stringify({
        answer: {
            question: questionId,
            answer: answerId
        }
    }));
}

function gotRemoteStream(event) {
    console.log('got remote stream', event);
    videoStream(event.stream);
}

function errorHandler(error) {
    console.log(error);
}

function gotDescription(description) {
    console.log('got description');
    peerConnection.setLocalDescription(description, function () {
        serverConnection.send(JSON.stringify({
            handshake: {
                sdp: description
            }
        }));
    }, errorHandler);
}

function gotMessageFromServer(message) {
    if(!peerConnection) {
        start(false);
    }

    var signal = JSON.parse(message.data);

    if (signal.stream) {
        return;
    }

    if (signal.handshake) {
        gotHandshake(signal.handshake)
    }

    if (signal.message) {
        gotMessage(signal.message);
    }

    if (signal.question) {
        gotQuestion(signal.question);
    }

    if (signal.answer) {
        gotAnswer(signal.answer);
    }
}

function gotMessage(message) {
    document.querySelector('[data-chat-out]').innerText += `\n${message.name}: ${message.text}`;
}

function gotHandshake(handshake) {
    if(handshake.sdp) {
        console.log(handshake.sdp);
        peerConnection.setRemoteDescription(new RTCSessionDescription(handshake.sdp), function() {
            if(handshake.sdp.type === 'offer') {
                peerConnection.createAnswer(gotDescription, errorHandler);
            }
        }, errorHandler);
    } else if(handshake.ice) {
        peerConnection.addIceCandidate(new RTCIceCandidate(handshake.ice));
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

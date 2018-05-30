var peerConnectionConfig = { 'iceServers': [{'urls': 'stun:stun.services.mozilla.com'}, {'urls': 'stun:stun.l.google.com:19302'}] };
var peerConnection;
var blob = new Blob();
window.RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;

const serverConnection = new WebSocket('wss://localhost:1337');
serverConnection.onmessage = (message) => {
    gotMessageFromServer(message);
};

document.querySelector('[data-show-local-stream]').addEventListener('click', () => {
    showLocalStream();
});

document.querySelector('[data-call]').addEventListener('click', () => {
    console.log('Start');
    start(true);
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
    });
}

function videoStream(stream) {
    let video = createVideo();

    video.srcObject = stream;
}

function createVideo() {
    let video = document.createElement('video');

    video.autoplay = true;

    document.body.appendChild(video);

    return video;
}

function gotIceCandidate(event) {
    if(event.candidate != null) {
        serverConnection.send(JSON.stringify({'ice': event.candidate}));
    }
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
        serverConnection.send(JSON.stringify({'sdp': description}));
    }, errorHandler);
}

function gotMessageFromServer(message) {
    if(!peerConnection) {
        start(false);
    }

    var signal = JSON.parse(message.data);
    if(signal.sdp) {
        console.log(signal.sdp);
        peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp), function() {
            if(signal.sdp.type === 'offer') {
                peerConnection.createAnswer(gotDescription, errorHandler);
            }
        }, errorHandler);
    } else if(signal.ice) {
        peerConnection.addIceCandidate(new RTCIceCandidate(signal.ice));
    }
}

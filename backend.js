const WebSocket = require("ws");
const fs = require("fs");
const imageDataURI = require("image-data-uri");
const uuidv4 = require("uuid/v4");
const GoogleVision = require("@google-cloud/vision");

// Creates a client
const googleVisionClient = new GoogleVision.ImageAnnotatorClient({
    keyFilename: "vision-service-account.json"
});

const PORT = 4001;

const wss = new WebSocket.Server({
    port: PORT,
    perMessageDeflate: {
        zlibDeflateOptions: {
            // See zlib defaults.
            chunkSize: 1024,
            memLevel: 7,
            level: 3
        },
        zlibInflateOptions: {
            chunkSize: 10 * 1024
        },
        // Other options settable:
        clientNoContextTakeover: true, // Defaults to negotiated value.
        serverNoContextTakeover: true, // Defaults to negotiated value.
        clientMaxWindowBits: 10, // Defaults to negotiated value.
        serverMaxWindowBits: 10, // Defaults to negotiated value.
        // Below options specified as default values.
        concurrencyLimit: 10, // Limits zlib concurrency for perf.
        threshold: 1024 // Size (in bytes) below which messages
        // should not be compressed.
    }
});

function sendRecognitionResponse(socket, request) {
    detectFaces(request.image, (err, result) => {
        const packet = {
            type: "RecognitionResult",
            tag: request.tag,
            captureTime: request.captureTime,
            faces: result
        };

        socket.send(JSON.stringify(packet));
    });
}

function googleLikelihoodToNumber(likelyhood) {
    switch (likelyhood) {
        case "VERY_LIKELY":
            return 1;
        case "LIKELY":
            return 0.75;
        case "UNLIKELY":
            return 0.25;
        case "VERY_UNLIKELY":
            return 0;
        default:
            return 0.1;
    }
}

function detectFaces(image, callback) {
    // Make a call to the Vision API to detect the faces
    const request = { image: { content: image.dataBase64 } };
    googleVisionClient
        .faceDetection(request)
        .then(results => {
            const faces = results[0].faceAnnotations;
            var numFaces = faces.length;
            console.log("Found " + numFaces + (numFaces === 1 ? " face" : " faces"));

            if (numFaces > 0) {
                console.dir(faces[0]);
            }

            callback(
                null,
                faces.map(face => {
                    return {
                        emotion: {
                            Happy: googleLikelihoodToNumber(face.joyLikelihood),
                            Sad: googleLikelihoodToNumber(face.sorrowLikelihood),
                            Angry: googleLikelihoodToNumber(face.angerLikelihood),
                            Suprised: googleLikelihoodToNumber(face.surpriseLikelihood),
                            Content: 0.1 // Client will pick most likely, which will be this if the others have low detection value
                        },
                        boundingBox: face.boundingPoly,
                        headwear: googleLikelihoodToNumber(headwearLikelihood),
                        faceAttributes: face
                    };
                })
            );
        })
        .catch(err => {
            console.error("ERROR:", err);
            callback(err);
        });
}

wss.on("connection", function connection(socket) {
    socket.on("message", function incoming(message) {
        const packet = JSON.parse(message);

        switch (packet.type) {
            case "RecognizeImage":
                console.log(`RecognizeImage - ${packet.imageBase64.length} bytes`);
                const image = imageDataURI.decode(packet.imageBase64);

                // imageDataURI.outputFile(packet.imageBase64, "tmp-captures/faceimage-" + new Date().getTime() + ".jpg");
                sendRecognitionResponse(socket, {
                    image,
                    tag: packet.tag,
                    captureTime: packet.captureTime
                });
                break;

            default:
                console.error(`Unknown packet type: ${packet.type}`);
        }
    });

    socket.send(
        JSON.stringify({
            type: "Hello"
        })
    );
});

console.log(`Server listening on port ${PORT}`);

const test = require("node:test");
const assert = require("node:assert/strict");
const { mungeSdpBandwidth } = require("../js/webrtc/sdp.js");

const SAMPLE_SDP = [
  "v=0",
  "o=- 123456789 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111",
  "c=IN IP4 0.0.0.0",
  "a=rtpmap:111 opus/48000/2",
  "a=fmtp:111 minptime=10;useinbandfec=1",
  "m=video 9 UDP/TLS/RTP/SAVPF 96",
  "c=IN IP4 0.0.0.0",
  "a=rtpmap:96 VP8/90000",
  "a=fmtp:96",
].join("\r\n");

test("SDP Manager - Audio Opus Stereo Injection", () => {
  const munged = mungeSdpBandwidth(SAMPLE_SDP);
  assert.match(munged, /stereo=1/);
  assert.match(munged, /sprop-stereo=1/);
  assert.match(munged, /b=AS:256/);
  assert.match(munged, /b=TIAS:256000/);
});

test("SDP Manager - Video Bandwidth Insertion", () => {
  const munged = mungeSdpBandwidth(SAMPLE_SDP, {
    minVideoKbps: 3000,
    startVideoKbps: 6000,
    maxVideoKbps: 10000,
  });

  assert.match(munged, /b=AS:10000/);
  assert.match(munged, /b=TIAS:10000000/);
  assert.match(munged, /x-google-min-bitrate=3000/);
  assert.match(munged, /x-google-start-bitrate=6000/);
  assert.match(munged, /x-google-max-bitrate=10000/);
});

test("SDP Manager - Handles Null or Invalid Input Safely", () => {
  assert.equal(mungeSdpBandwidth(null), null);
  assert.equal(mungeSdpBandwidth(""), "");
  assert.equal(mungeSdpBandwidth(12345), 12345);
});

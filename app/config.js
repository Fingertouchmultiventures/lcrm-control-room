// LCRM Control Room - shared settings.
// Edit this file if your Firebase database or church name changes.
window.LCRM_CONFIG = {
  churchName: "LCRM Church",

  // Firebase Realtime Database used ONLY to introduce phones to the control room
  // (WebRTC "handshake"). No video goes through Firebase.
  databaseURL: "https://lcrm-live-default-rtdb.firebaseio.com",

  // STUN helps phones and the laptop find each other. On the same Wi-Fi this is
  // almost always enough. If a phone on mobile data cannot connect, add a TURN
  // server here, e.g. { urls: "turn:your.server:3478", username: "u", credential: "p" }
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ],

  // Where THIS app is hosted online (the https address phones can open), e.g.
  // "https://lcrm-control.pages.dev". Leave empty and type it in the app instead.
  publicUrl: "",

  // Facebook "Live Producer" page for LCRM Church (the stream key is copied from here).
  facebookProducerUrl: "https://www.facebook.com/live/producer/?entry_point=inline_profile_sprouts&source=CAMERA&target_id=61578066282083",

  // Address of the Facebook relay program running on the church laptop.
  relayUrl: "ws://localhost:8787",
  facebookServer: "rtmps://live-api-s.facebook.com:443/rtmp/"
};

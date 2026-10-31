# LCRM Control Room – Setup Guide

One screen on the church laptop that shows all your phone cameras, slides, hymns, scripture and videos.
Click anything to send it to **Facebook Live** and the **church TV** at the same time.

```
Phones (camera page) ──internet/Wi-Fi──►  Control room (Chrome on the laptop)
                                              │                     │
                                              │ HDMI (Windows+P)    │ relay program + FFmpeg
                                              ▼                     ▼
                                          Church TV            Facebook Live
```

## What is in this folder
| Folder | What it is |
|---|---|
| `app/` | The website: `control.html` (laptop), `cam.html` (phones), `tv.html` (TV window) |
| `relay/` | A small program that runs on the laptop and sends the picture to Facebook |

---

## Part 1 – One-time setup (about 30 minutes)

### Step 1. Put the `app` folder online (so phones can open it)
Phones need an **https** address. Easiest free way:
1. Go to Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Upload assets**.
2. Name it (e.g. `lcrm-control`), drag in the **contents of the `app` folder**, and deploy.
3. You get an address like `https://lcrm-control.pages.dev`. Write it down.

> Use a **new** project. Do not overwrite your existing `/control` site until you are happy with this one.

### Step 2. Install the two helpers on the church laptop
1. **Node.js** (LTS) from https://nodejs.org – install with the defaults.
2. **FFmpeg** for Windows: download the "essentials" build from https://www.gyan.dev/ffmpeg/builds/ , open the zip, and copy **`ffmpeg.exe`** (inside the `bin` folder) into the `relay` folder next to `start.bat`.

### Step 3. Firebase (this only introduces the phones to the laptop – no video goes through it)
Your database `lcrm-live-default-rtdb` is already in `app/config.js`.
In the Firebase console → **Realtime Database → Rules**, set:
```json
{ "rules": { "rooms": { ".read": true, ".write": true } } }
```
and Publish. (If you used "test mode" earlier, it expires after 30 days – this rule replaces it for the camera handshake.)

### Step 4. Allow your website in the relay
Open `relay/start.bat` in Notepad and change the `ALLOW_ORIGINS` line to your Step 1 address (no `/` at the end). Save.

---

## Part 2 – Every Sunday

1. **Start the relay:** double-click `relay/start.bat`. Leave the black window open.
2. **Open the control room:** in **Chrome or Edge** on the laptop, open `http://localhost:8787/control.html`
   (or your online address + `/control.html`).
3. **Connect phones:** click **Connect phones**. The first time, type your Step 1 address in the box. Send the link to each phone by WhatsApp. On each phone: open it, type a name (Pulpit, Choir…), tap **Start camera**, hold the phone **sideways**, put it on a charger. Each phone shows up as a numbered tile. A phone shows a **red border** when it is on air.
4. **Sound:** open **Sound** → pick the input your church mixer is plugged into → **Turn on**. Watch the green bar move when someone speaks.
5. **TV:** plug in the HDMI cable, press **Windows + P → Extend**. In the control room click **Open TV screen**. The window opens on the TV (if not, drag it there), then click once inside it for full screen.
   *TV shows* (top bar): "Words full-screen, otherwise the camera" is the usual choice – hymns and verses fill the TV while Facebook shows them over the camera.
6. **Facebook:** open the link under **Facebook Live → Stream key** (Live Producer → *Streaming software*), copy the **Stream key**, paste it in the control room, click **Start Facebook Live**. Wait for the preview to appear on Facebook, then click **Go Live** there.
   If you use a *persistent* stream key you only paste it once (tick "Remember the key").

### Running the service
- **Cameras:** click a tile, or press **1–9**. Numbers stay the same each week.
- **Hymns:** *Hymns & Lyrics* → **+ New** → paste the words, one blank line between slides (a first line like `[Chorus]` is just a label). Click a slide, then use **← →** to move on. Use **Backup** now and then – hymns are saved in this browser only.
- **Scripture:** type `John 3:16-18` → Find (needs internet; KJV/WEB/BBE/Portuguese). For other Bibles, paste verses into the **Words** tab.
- **Slides:** in PowerPoint use *File → Export → PDF* (or save as pictures), then *Slides → Add*. For animated slides or EasyWorship use *Cameras → Share a window* and pick that window.
- **Videos:** *Video → Add* an .mp4. Its sound goes to Facebook automatically.
- **Words:** *Full screen* or *Over the picture* (top right of the tabs).
- **Name bar:** type a name/title → **Show bar**.
- **Safe mode:** tick *Preview before air*; clicks go to the small "NEXT" screen and **TAKE** (Enter) sends them live.
- **Keys:** `1-9` cameras · `B` black · `W` welcome screen · `C` clear words · `← →` previous/next · `Enter` take.
- **Look:** *Look & logo* sets colours, font, background picture and logo.

---

## Tips and limits
- Keep the control-room window **visible** (not minimised) while streaming.
- Use the church **Wi-Fi 5 GHz** for the phones, and a **LAN cable** for the laptop if possible. Facebook needs about 5 Mbps upload at "Normal" quality.
- Delay to Facebook is normally 5–10 seconds. That is expected.
- The relay re-encodes video, so use a laptop made in the last ~8 years. If the control room says *"computer is too slow"*, choose a lower **Quality**.
- Phone sound is off by default – the mixer should supply the sound. Turn on **Send this phone's microphone** on the phone, then **Sound** on its tile, only if needed.
- The first time Chrome may ask for permission to *"connect to devices on your local network"* (the relay) – click **Allow**.

## What was tested, and what was not
Tested here with a headless Chrome and fake cameras: phone → control room video over WebRTC, switching, hymns, words, slides (pictures), video with sound, the TV window, stream start/stop, and the relay sending H.264 video + AAC sound to a local test receiver.

**Not tested (needs your real accounts/internet):** the live Firebase connection, sending to Facebook itself, PDF slides (reader loads from the internet), scripture lookup, and real phones. Please do a private test before Sunday: set the Facebook post audience to *Only me* in Live Producer, stream 5 minutes with two phones, and check the TV.

## If something goes wrong
| Problem | Fix |
|---|---|
| "Cannot reach the relay" | Run `relay/start.bat` and keep its window open |
| "FFmpeg not found" | Put `ffmpeg.exe` in the `relay` folder |
| Phone says "Waiting for control room" | Same room code? Firebase rules set? Control room open? |
| Phone cannot open camera | The link must start with `https://` |
| Phone on mobile data won't connect | Add a TURN server in `app/config.js` (`iceServers`) |
| Facebook preview never appears | Stream key expired (they are short-lived unless persistent) – copy a fresh one |

---

## Install it as an app (phones and laptop)
The first time you open the site, a pop-up offers **Install the LCRM app**. Tap **Install**.
- **Android / Chrome, laptop / Edge:** tap Install in the pop-up (or the install icon in the address bar).
- **iPhone:** open the site in **Safari**, tap **Share**, then **Add to Home Screen**.
The app opens full screen with its own icon and still opens if the internet is down briefly (streaming and phone cameras still need internet).

## Can a phone do this instead of a laptop?
- **Phone as a camera:** yes - this already works on any phone, no Node.js or FFmpeg needed.
- **Phone as the control screen** (switching, slides, hymns, TV): the control room opens on a phone or tablet, but sending to Facebook needs FFmpeg, which cannot run inside a phone browser. So Facebook streaming from the control room needs one of:
  1. a laptop running `relay/start.bat` (current setup);
  2. the relay on a small always-on cloud computer (needs a paid server, about 1 CPU core) - not set up yet;
  3. for a phone-only service: stream with **Prism Live Studio** on the phone, and use the overlay/control app in the older `church-live-stream` project for lyrics and name bars.

## If the phone never appears in the control room
- The top bar of the control room should say **Online - room xxxxxx**. If it says **Database blocked**, the Firebase rules in Step 3 are missing.
- The phone page now prints "The database refused the link" when that happens.
- The room code on the phone must match the one in **Connect phones**, and the control room must be open.

## Facebook stream key safety
Treat the stream key like a password. Anyone who has it can broadcast on your page. If it was shared in a chat or screenshot, open Live Producer and click **Reset** next to the key, then paste the new key.

## Hymns, lyrics, scripture and shortcuts
- **Hymns tab:** the CAC hymn book in **English** and **Yorùbá**, stored inside the app (no internet needed). Type a number (e.g. `46`) or some words. Each verse is a slide. "Show in Yorùbá/English" switches the same hymn.
- **Lyrics tab:** your own songs (praise and worship, choruses). **Upload songs** takes several `.txt` files at once (file name = song title; blank line between slides). Search is instant while the singer sings; press `/` to jump to the search box.
- **Scripture tab:** choose **English**, **Yorùbá** (works offline) or **English + Yorùbá** together. Type `John 3:16-18`, `Johanu 3:16` or `Saamu 23`.
- **Double-click** any item to put it straight on air even when *Preview before air* is on. **Zoom** the on-air camera with `+` `-` `0` (move with Shift+arrows). Press `?` for all keys.

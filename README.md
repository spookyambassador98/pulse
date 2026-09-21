# Pulse

Live: [pulse-beryl-one.vercel.app](https://pulse-beryl-one.vercel.app)

Pulse is a free Windows instrument: a live neuron map of real device traffic. The website is the download plate. The app is the map.

- Installer: [Pulse-Setup-0.1.0.exe](https://github.com/spookyambassador98/pulse/releases/latest/download/Pulse-Setup-0.1.0.exe)
- Packet capture: [Npcap](https://npcap.com/#download)
- Windows SmartScreen will warn on an unsigned build — More info → Run anyway

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Electron shell, Npcap (`cap`), systeminformation
- GSAP MotionPath on the desktop map

## Run

```bash
npm install
npm run electron
```

# Pulse

Live: [pulse-beryl-one.vercel.app](https://pulse-beryl-one.vercel.app)

Pulse turns the traffic between your device and this page into a readable heartbeat. TTFB, resource timing, connection type, and transfer size come from the browser’s Navigation Timing, Resource Timing, and Network Information APIs — not mock numbers. Nothing is sent off-device.

The page is a diagnostic monitor: device → neuron → site. A healthy session breathes. A stall looks like arrhythmia.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- GSAP (ScrollTrigger, SplitText) + Lenis
- OGL shader field for the stage

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

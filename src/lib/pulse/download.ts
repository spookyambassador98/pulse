export const PULSE_VERSION = "0.1.2";
export const PULSE_SETUP_NAME = `Pulse-Setup-${PULSE_VERSION}.exe`;
export const PULSE_SHA256 =
  "A7862737BE174F6BFD0A494904655D4757F967BE5B4C5FDD0FE2A4319FCAD8C5";
export const PULSE_GITHUB = "https://github.com/spookyambassador98/pulse";
export const PULSE_NPCAP = "https://npcap.com/#download";

export const PULSE_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_DOWNLOAD_URL ||
  `${PULSE_GITHUB}/releases/latest/download/${PULSE_SETUP_NAME}`;

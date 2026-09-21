export const PULSE_VERSION = "0.1.0";
export const PULSE_SETUP_NAME = `Pulse-Setup-${PULSE_VERSION}.exe`;
export const PULSE_SHA256 =
  "BABD0C163B13272B0554DD563AF73B9C3978988093AA19EBF0E70FBAEC7E65B2";
export const PULSE_GITHUB = "https://github.com/spookyambassador98/pulse";
export const PULSE_NPCAP = "https://npcap.com/#download";

export const PULSE_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_DOWNLOAD_URL ||
  `${PULSE_GITHUB}/releases/latest/download/${PULSE_SETUP_NAME}`;

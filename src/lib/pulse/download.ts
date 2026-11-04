export const PULSE_VERSION = "0.1.2";
export const PULSE_SETUP_NAME = `Pulse-Setup-${PULSE_VERSION}.exe`;
export const PULSE_SHA256 =
  "9566124D55B57D643C1F80C43B7DBF22D597B31B478C9C8D8B239EDECFE63C7F";
export const PULSE_GITHUB = "https://github.com/spookyambassador98/pulse";
export const PULSE_NPCAP = "https://npcap.com/#download";

export const PULSE_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_DOWNLOAD_URL ||
  `${PULSE_GITHUB}/releases/latest/download/${PULSE_SETUP_NAME}`;

import pngToIco from "png-to-ico";
import { writeFileSync } from "fs";
import path from "path";

const dir = path.join(import.meta.dirname, "..", "resources");
const buf = await pngToIco([
  path.join(dir, "icon-256.png"),
  path.join(dir, "icon-48.png"),
  path.join(dir, "icon-32.png"),
  path.join(dir, "icon-16.png"),
]);
const out = path.join(dir, "icon.ico");
writeFileSync(out, buf);
console.log("wrote", out, buf.length, "bytes");

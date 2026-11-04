// In-app updates for the installed Windows build. The website is a plate.
// This talks to GitHub Releases, pulls Pulse-Setup-*.exe, and runs it.

const { app } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");

const REPO = "spookyambassador98/pulse";
const UA = "Pulse-Desktop";

function currentVersion() {
  try {
    const pkg = require("../package.json");
    if (pkg && pkg.version) return String(pkg.version).replace(/^v/i, "");
  } catch {
    /* packaged fallback below */
  }
  return String(app.getVersion() || "0.0.0").replace(/^v/i, "");
}

function compareVersions(a, b) {
  const pa = String(a)
    .replace(/^v/i, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const pb = String(b)
    .replace(/^v/i, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

function githubJson(url) {
  return new Promise((resolve, reject) => {
    const go = (u, hops) => {
      if (hops > 6) {
        reject(new Error("GitHub redirected too many times"));
        return;
      }
      https
        .get(
          u,
          {
            headers: {
              Accept: "application/vnd.github+json",
              "User-Agent": UA,
              "X-GitHub-Api-Version": "2022-11-28",
            },
          },
          (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              res.resume();
              go(new URL(res.headers.location, u).toString(), hops + 1);
              return;
            }
            let body = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => {
              body += chunk;
            });
            res.on("end", () => {
              if (res.statusCode !== 200) {
                reject(new Error(`GitHub returned ${res.statusCode}`));
                return;
              }
              try {
                resolve(JSON.parse(body));
              } catch (err) {
                reject(err);
              }
            });
          }
        )
        .on("error", reject);
    };
    go(url, 0);
  });
}

async function checkLatest() {
  const release = await githubJson(`https://api.github.com/repos/${REPO}/releases/latest`);
  const latest = String(release.tag_name || release.name || "").replace(/^v/i, "");
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const asset =
    assets.find((item) => /\.exe$/i.test(item.name || "") && /setup/i.test(item.name || "")) ||
    assets.find((item) => /\.exe$/i.test(item.name || ""));
  const current = currentVersion();
  return {
    current,
    latest,
    upToDate: !latest || compareVersions(latest, current) <= 0,
    url: asset?.browser_download_url || null,
    name: asset?.name || (latest ? `Pulse-Setup-${latest}.exe` : "Pulse-Setup.exe"),
  };
}

function downloadToFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const go = (u, hops) => {
      if (hops > 8) {
        reject(new Error("Download redirected too many times"));
        return;
      }
      const lib = u.startsWith("http://") ? http : https;
      const req = lib.get(
        u,
        {
          headers: {
            "User-Agent": UA,
            Accept: "application/octet-stream",
          },
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            go(new URL(res.headers.location, u).toString(), hops + 1);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`Download failed (${res.statusCode})`));
            return;
          }
          const total = Number(res.headers["content-length"] || 0);
          let received = 0;
          const file = fs.createWriteStream(dest);
          res.on("data", (chunk) => {
            received += chunk.length;
            if (total && typeof onProgress === "function") onProgress(received / total);
          });
          res.pipe(file);
          file.on("finish", () => file.close(() => resolve(dest)));
          file.on("error", (err) => {
            try {
              fs.unlinkSync(dest);
            } catch {
              /* leftover temp file */
            }
            reject(err);
          });
        }
      );
      req.on("error", reject);
    };
    go(url, 0);
  });
}

async function downloadInstaller(info, onProgress) {
  if (!info?.url) throw new Error("No installer URL");
  const dest = path.join(app.getPath("temp"), path.basename(info.name || "Pulse-Setup.exe"));
  try {
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
  } catch {
    /* overwrite on the next write */
  }
  await downloadToFile(info.url, dest, onProgress);
  return dest;
}

function launchInstaller(filePath) {
  const safe = String(filePath).replace(/"/g, "");
  // Give this process a moment to quit so NSIS can replace the files.
  const child = spawn(
    "cmd.exe",
    ["/d", "/c", `ping 127.0.0.1 -n 3 >nul & start "" "${safe}" /S`],
    { detached: true, stdio: "ignore", windowsHide: true }
  );
  child.unref();
}

module.exports = {
  checkLatest,
  compareVersions,
  currentVersion,
  downloadInstaller,
  launchInstaller,
};

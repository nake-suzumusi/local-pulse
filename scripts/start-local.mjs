import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 13)) {
  console.error("Node.js 22.13.0以上をインストールしてください: https://nodejs.org/");
  process.exit(1);
}

const localUrl = "http://localhost:3000";
const vinextCli = fileURLToPath(new URL("../node_modules/vinext/dist/cli.js", import.meta.url));
const server = spawn(
  process.execPath,
  [vinextCli, "dev", "--host", "localhost", "--port", "3000", "--strictPort"],
  {
    cwd: process.cwd(),
    stdio: "inherit",
  },
);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) return false;
    try {
      const response = await fetch(localUrl, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return true;
    } catch {
      // The development server is still starting.
    }
    await delay(250);
  }
  return false;
}

function openBrowser() {
  const options = { detached: true, stdio: "ignore", windowsHide: true };
  let browserProcess;
  if (process.platform === "win32") {
    browserProcess = spawn("rundll32.exe", ["url.dll,FileProtocolHandler", localUrl], options);
  } else if (process.platform === "darwin") {
    browserProcess = spawn("open", [localUrl], options);
  } else {
    browserProcess = spawn("xdg-open", [localUrl], options);
  }
  browserProcess.on("error", () => {
    console.log(`ブラウザを開けませんでした。手動で ${localUrl} を開いてください。`);
  });
  browserProcess.unref();
}

if (await waitForServer()) {
  console.log(`Local Pulse: ${localUrl}`);
  if (process.env.LOCAL_PULSE_NO_OPEN !== "1") openBrowser();
} else if (server.exitCode === null) {
  console.log(`起動確認がタイムアウトしました。ブラウザで ${localUrl} を確認してください。`);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    if (!server.killed) server.kill(signal);
  });
}

server.once("exit", (code) => {
  process.exitCode = code ?? 0;
});

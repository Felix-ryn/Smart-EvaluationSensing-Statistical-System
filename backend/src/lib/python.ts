import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export interface PythonCommand {
  command: string;
  argsPrefix: string[];
}

export interface SpawnedPythonScript {
  child: ChildProcess;
  scriptPath: string;
  scriptsDir: string;
  python: PythonCommand;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => path.resolve(v))));
}

/**
 * Resolve lokasi folder scripts secara robust untuk dev/build desktop.
 */
export function resolveScriptsDir(): string {
  const candidates = unique([
    path.join(process.cwd(), "../scripts"),
    path.join(process.cwd(), "scripts"),
    path.join(__dirname, "../../../scripts"),
    path.join(__dirname, "../../../../scripts"),
  ]);

  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(
      `Scripts directory tidak ditemukan. Sudah dicek: ${candidates.join(", ")}`,
    );
  }
  return found;
}

function defaultPythonCandidates(): PythonCommand[] {
  const envBin = process.env.PYTHON_BIN?.trim();
  if (envBin) {
    return [{ command: envBin, argsPrefix: [] }];
  }

  if (process.platform === "win32") {
    return [
      { command: "py", argsPrefix: ["-3"] },
      { command: "python", argsPrefix: [] },
      { command: "py", argsPrefix: [] },
    ];
  }

  return [
    { command: "python3", argsPrefix: [] },
    { command: "python", argsPrefix: [] },
  ];
}

async function canRunPython(candidate: PythonCommand): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const child = spawn(candidate.command, [...candidate.argsPrefix, "--version"], {
      windowsHide: true,
      stdio: "ignore",
    });

    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      resolve(ok);
    };

    child.once("spawn", () => {
      setTimeout(() => {
        try {
          child.kill();
        } catch {
          // ignore
        }
        finish(true);
      }, 150);
    });

    child.once("error", () => finish(false));
    child.once("close", (code) => finish(code === 0));
  });
}

export async function detectPythonCommand(): Promise<PythonCommand> {
  const candidates = defaultPythonCandidates();

  for (const c of candidates) {
    if (await canRunPython(c)) return c;
  }

  const tried = candidates
    .map((c) => `${c.command}${c.argsPrefix.length ? ` ${c.argsPrefix.join(" ")}` : ""}`)
    .join(", ");
  throw new Error(
    `Python executable tidak ditemukan. Set PYTHON_BIN atau install Python. Tried: ${tried}`,
  );
}

async function waitForSpawn(child: ChildProcess, timeoutMs = 4000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timeout saat memulai proses Python"));
    }, timeoutMs);

    const onSpawn = () => {
      cleanup();
      resolve();
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      clearTimeout(timer);
      child.off("spawn", onSpawn);
      child.off("error", onError);
    };

    child.once("spawn", onSpawn);
    child.once("error", onError);
  });
}

/**
 * Spawn python script dengan validasi path + fallback command python.
 */
export async function spawnPythonScript(
  scriptName: string,
  options?: { stdio?: "pipe" | "inherit" | "ignore" },
): Promise<SpawnedPythonScript> {
  const scriptsDir = resolveScriptsDir();
  const scriptPath = path.join(scriptsDir, scriptName);

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Script tidak ditemukan: ${scriptName} (${scriptPath})`);
  }

  const python = await detectPythonCommand();
  const child = spawn(python.command, [...python.argsPrefix, scriptPath], {
    cwd: scriptsDir,
    stdio: options?.stdio ?? "pipe",
    windowsHide: true,
  });

  await waitForSpawn(child);

  return { child, scriptPath, scriptsDir, python };
}

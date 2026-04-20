import { spawn } from "node:child_process";
import type { Response } from "express";
import type { BuildEvent } from "../../shared/types.js";
import { scriptsDir } from "./paths.js";
import path from "node:path";

function writeEvent(res: Response, event: BuildEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export async function streamScript(res: Response, scriptName: string, args: string[] = []): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const scriptPath = path.join(scriptsDir, scriptName);
  const proc = spawn(process.execPath, [scriptPath, ...args], {
    cwd: path.dirname(scriptsDir),
    env: { ...process.env, FORCE_COLOR: "0" }
  });

  const pipe = (source: NodeJS.ReadableStream, kind: "stdout" | "stderr") => {
    let buffer = "";
    source.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        writeEvent(res, { kind, line });
      }
    });
    source.on("end", () => {
      if (buffer.length) writeEvent(res, { kind, line: buffer });
    });
  };

  pipe(proc.stdout, "stdout");
  pipe(proc.stderr, "stderr");

  await new Promise<void>((resolve) => {
    proc.on("exit", (code) => {
      writeEvent(res, { kind: "exit", code });
      resolve();
    });
    proc.on("error", (err) => {
      writeEvent(res, { kind: "error", message: err.message });
      resolve();
    });
  });

  res.end();
}

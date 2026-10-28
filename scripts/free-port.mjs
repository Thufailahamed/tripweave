#!/usr/bin/env node
import { execSync } from "node:child_process";

const port = process.argv[2] || "8787";
try {
  const pids = execSync(`lsof -ti :${port}`, { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  for (const pid of pids) {
    try {
      process.kill(Number(pid), "SIGKILL");
      console.log(`Freed port ${port} by terminating PID ${pid}`);
    } catch {}
  }
} catch {
  // Port is already free
}

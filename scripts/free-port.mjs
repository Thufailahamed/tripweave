#!/usr/bin/env node
import { execSync } from "node:child_process";

const port = process.argv[2] || "8787";

// Collect own ancestor PIDs so we don't kill the caller
const myAncestors = new Set([process.pid]);
let curr = process.ppid;
while (curr && curr > 1) {
  myAncestors.add(curr);
  try {
    const parent = execSync(`ps -o ppid= -p ${curr}`, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    curr = parent ? Number(parent) : 0;
  } catch {
    break;
  }
}

function getCmd(pid) {
  try {
    return execSync(`ps -o command= -p ${pid}`, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

function isSafeToKill(pid) {
  if (myAncestors.has(pid) || pid <= 1) return false;
  const cmd = getCmd(pid);
  if (!cmd) return false;
  // Only kill wrangler, workerd, miniflare, or node running tripweave API
  return /wrangler|workerd|miniflare|apps\/api/i.test(cmd);
}

function getPidsFromLsof(p) {
  try {
    return execSync(`lsof -ti :${p}`, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim()
      .split(/\s+/)
      .map(Number)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getParentPid(pid) {
  try {
    const p = execSync(`ps -o ppid= -p ${pid}`, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    return p ? Number(p) : null;
  } catch {
    return null;
  }
}

function getWranglerTripweavePids() {
  try {
    return execSync(`pgrep -f "tripweave.*(wrangler|workerd)"`, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim()
      .split(/\s+/)
      .map(Number)
      .filter(Boolean);
  } catch {
    return [];
  }
}

const targets = new Set();

// 1. Any process listening on port, plus its parent wrangler/workerd/node processes
for (const pid of getPidsFromLsof(port)) {
  if (isSafeToKill(pid)) targets.add(pid);
  let p = getParentPid(pid);
  while (p && p > 1) {
    if (isSafeToKill(p)) {
      targets.add(p);
      p = getParentPid(p);
    } else {
      break;
    }
  }
}

// 2. Any lingering tripweave wrangler/workerd processes
for (const pid of getWranglerTripweavePids()) {
  if (isSafeToKill(pid)) {
    targets.add(pid);
  }
}

for (const pid of targets) {
  try {
    process.kill(pid, "SIGKILL");
    console.log(`[free-port] Terminated stale process ${pid}`);
  } catch {}
}

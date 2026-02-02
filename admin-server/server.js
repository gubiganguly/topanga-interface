import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.ADMIN_PORT || 18888);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const REPO_PATH = process.env.REPO_PATH || "/Users/clawdbot/Projects/topanga-interface";
const ALLOWED_PREFIXES = (process.env.ALLOWED_PREFIXES || "frontend/,README.md,.gitignore").split(",").map(s => s.trim()).filter(Boolean);
const PROPOSALS_PATH = process.env.PROPOSALS_PATH || "/tmp/topanga-admin-proposals.json";
const MAX_PATCH_BYTES = Number(process.env.MAX_PATCH_BYTES || 200_000);

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 2_000_000) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function loadProposals() {
  try {
    const raw = fs.readFileSync(PROPOSALS_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveProposals(obj) {
  fs.writeFileSync(PROPOSALS_PATH, JSON.stringify(obj, null, 2));
}

function hashPatch(patch) {
  return crypto.createHash("sha256").update(patch).digest("hex");
}

function extractTouchedFiles(patch) {
  const files = [];
  const lines = patch.split("\n");
  for (const line of lines) {
    if (line.startsWith("+++ b/")) {
      const file = line.replace("+++ b/", "").trim();
      if (file !== "/dev/null") files.push(file);
    }
  }
  return files;
}

function isAllowedPath(file) {
  return ALLOWED_PREFIXES.some(prefix => file === prefix || file.startsWith(prefix));
}

async function ensureCleanRepo() {
  const { stdout } = await execFileAsync("git", ["-C", REPO_PATH, "status", "--porcelain"]);
  if (stdout.trim()) {
    throw new Error("Repo is not clean. Commit or stash changes first.");
  }
}

async function applyPatch(patch) {
  await execFileAsync("git", ["-C", REPO_PATH, "apply", "--whitespace=fix"], { input: patch });
}

async function checkPatch(patch) {
  await execFileAsync("git", ["-C", REPO_PATH, "apply", "--check"], { input: patch });
}

async function getDiff() {
  const { stdout } = await execFileAsync("git", ["-C", REPO_PATH, "diff"]);
  return stdout;
}

async function commitAll(message) {
  await execFileAsync("git", ["-C", REPO_PATH, "add", "-A"]);
  await execFileAsync("git", ["-C", REPO_PATH, "commit", "-m", message]);
}

async function push() {
  await execFileAsync("git", ["-C", REPO_PATH, "push"]);
}

function requireAuth(req, res) {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    json(res, 401, { error: "unauthorized" });
    return false;
  }
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;

    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && req.url === "/propose") {
      const raw = await readBody(req);
      const { patch } = JSON.parse(raw || "{}");
      if (!patch || typeof patch !== "string") return json(res, 400, { error: "patch required" });
      if (Buffer.byteLength(patch, "utf8") > MAX_PATCH_BYTES) return json(res, 413, { error: "patch too large" });

      const files = extractTouchedFiles(patch);
      if (!files.length) return json(res, 400, { error: "no files detected in patch" });
      const disallowed = files.filter(f => !isAllowedPath(f));
      if (disallowed.length) return json(res, 400, { error: "disallowed paths", files: disallowed });

      await ensureCleanRepo();
      await checkPatch(patch);

      const id = crypto.randomUUID();
      const hash = hashPatch(patch);
      const proposals = loadProposals();
      proposals[id] = { patch, hash, createdAt: Date.now(), files };
      saveProposals(proposals);

      return json(res, 200, { id, hash, files });
    }

    if (req.method === "POST" && req.url === "/apply") {
      const raw = await readBody(req);
      const { id, hash } = JSON.parse(raw || "{}");
      if (!id || !hash) return json(res, 400, { error: "id and hash required" });

      const proposals = loadProposals();
      const proposal = proposals[id];
      if (!proposal) return json(res, 404, { error: "proposal not found" });
      if (proposal.hash !== hash) return json(res, 400, { error: "hash mismatch" });

      await ensureCleanRepo();
      await applyPatch(proposal.patch);

      const diff = await getDiff();
      return json(res, 200, { ok: true, diff });
    }

    if (req.method === "POST" && req.url === "/commit") {
      const raw = await readBody(req);
      const { message } = JSON.parse(raw || "{}");
      if (!message || typeof message !== "string") return json(res, 400, { error: "message required" });
      await commitAll(message);
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && req.url === "/push") {
      await push();
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: "not found" });
  } catch (err) {
    return json(res, 500, { error: err?.message || "server error" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Admin server listening on 127.0.0.1:${PORT}`);
});

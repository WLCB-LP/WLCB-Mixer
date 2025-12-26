import fs from "node:fs";
import path from "node:path";

const src = path.resolve("../ui/dist");
const dst = path.resolve("./public");

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
copyDir(src, dst);
console.log("Copied UI dist -> server/public");

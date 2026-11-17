import { execSync } from "child_process";
import { rmSync } from "fs";
import path from "path";

// Tests use their own throwaway database file so they never touch real data.
export default function setup() {
  for (const suffix of ["", "-journal"]) {
    rmSync(path.resolve(__dirname, "..", "prisma", `test.db${suffix}`), { force: true });
  }
  execSync("npx prisma db push --skip-generate", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  });
}

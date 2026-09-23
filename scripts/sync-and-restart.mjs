import { execSync } from "node:child_process";

console.log("Syncing static and functions to boundless-studio-clean-v11...");
execSync("docker cp /root/bird-frost-brick-zenith/.vercel/output/static boundless-studio-clean-v11:/app/.vercel/output/", { stdio: "inherit" });
execSync("docker cp /root/bird-frost-brick-zenith/.vercel/output/functions boundless-studio-clean-v11:/app/.vercel/output/", { stdio: "inherit" });

console.log("Syncing to /opt/1panel/www/sites/bfbz-test/assets/...");
execSync("mkdir -p /opt/1panel/www/sites/bfbz-test/assets/", { stdio: "inherit" });
execSync("cp -r /root/bird-frost-brick-zenith/.vercel/output/static/assets/* /opt/1panel/www/sites/bfbz-test/assets/", { stdio: "inherit" });

console.log("Restarting boundless-studio-clean-v11...");
execSync("docker restart boundless-studio-clean-v11", { stdio: "inherit" });
console.log("Sync and restart completed. Showing latest logs:");
execSync("docker logs --tail 40 boundless-studio-clean-v11", { stdio: "inherit" });

export { runtime, dynamic, proxyAdmin } from "../_proxy.js";

export async function POST(req) {
  return proxyAdmin(req, "/push");
}

export { runtime, dynamic, proxyAdmin } from "../_proxy.js";

export async function GET(req) {
  return proxyAdmin(req, "/health");
}

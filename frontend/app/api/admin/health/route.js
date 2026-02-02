export { runtime, dynamic } from "../_proxy.js";
import { proxyAdmin } from "../_proxy.js";

export async function GET(req) {
  return proxyAdmin(req, "/health", "GET");
}

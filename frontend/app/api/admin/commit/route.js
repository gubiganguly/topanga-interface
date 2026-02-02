export { runtime, dynamic } from "../_proxy.js";
import { proxyAdmin } from "../_proxy.js";

export async function POST(req) {
  return proxyAdmin(req, "/commit");
}

export async function POST(req) {
  const { message } = await req.json();

  // Placeholder: wire to backend later
  return Response.json({ reply: `You said: ${message}` });
}

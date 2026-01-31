export const metadata = {
  title: "Topanga Interface",
  description: "Chat UI for OpenClaw"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "ui-sans-serif, system-ui" }}>
        {children}
      </body>
    </html>
  );
}

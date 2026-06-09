/** Keep in sync with server default (9785). */
export function defaultWsUrl(): string {
  if (process.env.PROJECTLM_WS_URL) return process.env.PROJECTLM_WS_URL;
  const port = process.env.PROJECTLM_WS_PORT ?? process.env.PORT ?? "9785";
  return `ws://localhost:${port}`;
}

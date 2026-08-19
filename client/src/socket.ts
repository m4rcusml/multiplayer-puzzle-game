/**
 * Keep Socket.IO on the page origin. In development Vite proxies this path to
 * the backend, which also works when the page is exposed through ngrok.
 */
export function socketEndpoint(): undefined {
  return undefined
}

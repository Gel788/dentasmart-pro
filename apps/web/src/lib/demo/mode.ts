/** Public demo runs entirely in the browser. A live API is optional. */
export function isDemo() {
  if (process.env.NEXT_PUBLIC_DEMO === '0') return false;
  if (process.env.NEXT_PUBLIC_DEMO === '1') return true;
  return !process.env.NEXT_PUBLIC_API_URL;
}

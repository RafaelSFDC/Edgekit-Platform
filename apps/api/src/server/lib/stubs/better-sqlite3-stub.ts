export default class DatabaseStub {
  constructor(_path: string) {
    throw new Error(
      'better-sqlite3 is not available in Cloudflare Workers runtime. Use Cloudflare D1 instead.',
    )
  }
  pragma(_cmd: string) {}
  close() {}
}

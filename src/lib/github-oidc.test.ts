import { generateKeyPairSync, sign } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { verifyGithubOidc } from "./github-oidc";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256" };
vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] }))));
afterAll(() => vi.unstubAllGlobals());

const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
function token(claims: object, kid = "k1") {
  const head = `${enc({ alg: "RS256", kid })}.${enc(claims)}`;
  return `${head}.${sign("RSA-SHA256", Buffer.from(head), privateKey).toString("base64url")}`;
}
const now = Date.now();
const good = { iss: "https://token.actions.githubusercontent.com", aud: "basis-notify", repository: "santangeloluca1/finance", exp: now / 1000 + 300, nbf: now / 1000 - 10 };

describe("token OIDC di GitHub Actions", () => {
  it("accetta il workflow di questo repository", async () => {
    expect(await verifyGithubOidc(token(good), now)).toBe(true);
  });
  it("rifiuta altri repository, audience sbagliata, token scaduti o firme false", async () => {
    expect(await verifyGithubOidc(token({ ...good, repository: "altro/repo" }), now)).toBe(false);
    expect(await verifyGithubOidc(token({ ...good, aud: "altro" }), now)).toBe(false);
    expect(await verifyGithubOidc(token({ ...good, exp: now / 1000 - 1 }), now)).toBe(false);
    const t = token(good).split(".");
    expect(await verifyGithubOidc(`${t[0]}.${enc({ ...good, repository: "x/y" })}.${t[2]}`, now)).toBe(false);
  });
});

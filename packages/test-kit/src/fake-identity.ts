import type {
  AuthenticatedUser,
  Identity,
  UserId,
} from "@rin-language/core-server";

const BEARER_PREFIX = "Bearer ";

/** Maps bearer tokens to users, like the real thing without any secret. */
export class FakeIdentity implements Identity {
  constructor(
    private readonly userIdByToken: Readonly<Record<string, UserId>>,
  ) {}

  async authenticate(request: Request): Promise<AuthenticatedUser | null> {
    const header = request.headers.get("authorization");
    if (header === null || !header.startsWith(BEARER_PREFIX)) return null;
    const userId = this.userIdByToken[header.slice(BEARER_PREFIX.length)];
    return userId === undefined ? null : { userId };
  }
}

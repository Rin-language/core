import type { AuthenticatedUser, Identity } from "../ports/identity.js";

/** Authenticates nobody: the safe default until a real Identity is plugged in. */
export class NoIdentity implements Identity {
  async authenticate(_request: Request): Promise<AuthenticatedUser | null> {
    return null;
  }
}

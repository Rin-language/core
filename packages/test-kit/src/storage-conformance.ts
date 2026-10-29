import type { Storage, StoredUserProfile } from "@rin-language/core-server";
import { afterEach, describe, expect, it } from "vitest";

const profile: StoredUserProfile = {
  displayName: "Aiko 愛子",
  targetLanguage: "ja",
  uiLanguage: "fr",
  timezone: "Asia/Tokyo",
  declaredLevel: "N5",
};

/**
 * Behavior every `Storage` implementation must have (in memory, SQLite,
 * or any other engine), including the isolation between users.
 */
export function describeStorageConformance(
  name: string,
  createStorage: () => Storage | Promise<Storage>,
): void {
  describe(`${name} conforms to Storage`, () => {
    const opened: Storage[] = [];
    const open = async () => {
      const storage = await createStorage();
      opened.push(storage);
      return storage;
    };

    afterEach(async () => {
      for (const storage of opened.splice(0)) await storage.close();
    });

    it("has no profile for an unknown user", async () => {
      const storage = await open();

      expect(await storage.profiles.get("user-a")).toBeNull();
    });

    it("reads back the profile it saved, with non-ASCII text intact", async () => {
      const storage = await open();
      await storage.profiles.save("user-a", profile);

      expect(await storage.profiles.get("user-a")).toEqual(profile);
    });

    it("replaces the previous profile when saving again", async () => {
      const storage = await open();
      await storage.profiles.save("user-a", profile);
      await storage.profiles.save("user-a", {
        ...profile,
        declaredLevel: "N4",
      });

      expect((await storage.profiles.get("user-a"))?.declaredLevel).toBe("N4");
    });

    it("does not share state with the object it was given", async () => {
      const storage = await open();
      const given = { ...profile };
      await storage.profiles.save("user-a", given);
      given.displayName = "changed afterwards";

      expect((await storage.profiles.get("user-a"))?.displayName).toBe(
        profile.displayName,
      );
    });

    it("does not show a user's profile to another user", async () => {
      const storage = await open();
      await storage.profiles.save("user-a", profile);

      expect(await storage.profiles.get("user-b")).toBeNull();
    });

    it("does not let one user's save change another user's profile", async () => {
      const storage = await open();
      await storage.profiles.save("user-a", profile);
      await storage.profiles.save("user-b", { ...profile, displayName: "Bob" });

      expect(await storage.profiles.get("user-a")).toEqual(profile);
    });
  });
}

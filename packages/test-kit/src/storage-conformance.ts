import type {
  Storage,
  StoredUserProfile,
  UsageEntry,
} from "@rin-language/core-server";
import { afterEach, describe, expect, it } from "vitest";

const profile: StoredUserProfile = {
  displayName: "Aiko 愛子",
  targetLanguage: "ja",
  uiLanguage: "fr",
  timezone: "Asia/Tokyo",
  declaredLevel: "N5",
};

const entry = (overrides: Partial<UsageEntry> = {}): UsageEntry => ({
  day: "2026-10-29",
  language: "ja",
  purpose: "correction",
  unit: "input_tokens",
  quantity: 10,
  ...overrides,
});

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

    describe("usage", () => {
      it("has no usage for a user who used nothing", async () => {
        const storage = await open();

        expect(await storage.usage.list("user-a")).toEqual([]);
      });

      it("reads back what was added", async () => {
        const storage = await open();
        await storage.usage.add("user-a", [entry()]);

        expect(await storage.usage.list("user-a")).toEqual([entry()]);
      });

      it("adds up the quantities of the same day, language, purpose and unit", async () => {
        const storage = await open();
        await storage.usage.add("user-a", [entry({ quantity: 10 })]);
        await storage.usage.add("user-a", [entry({ quantity: 5 })]);

        expect(await storage.usage.list("user-a")).toEqual([
          entry({ quantity: 15 }),
        ]);
      });

      it("adds up two entries with the same key given together", async () => {
        const storage = await open();
        await storage.usage.add("user-a", [
          entry({ quantity: 1 }),
          entry({ quantity: 2 }),
        ]);

        expect(await storage.usage.list("user-a")).toEqual([
          entry({ quantity: 3 }),
        ]);
      });

      it("keeps apart the languages, purposes, units and days", async () => {
        const storage = await open();
        await storage.usage.add("user-a", [
          entry(),
          entry({ language: "fr" }),
          entry({ purpose: "quiz" }),
          entry({ unit: "output_tokens" }),
          entry({ day: "2026-10-30" }),
        ]);

        expect(await storage.usage.list("user-a")).toHaveLength(5);
      });

      it("lists by day, then language, purpose and unit", async () => {
        const storage = await open();
        const later = entry({ day: "2026-10-30" });
        const second = entry({ unit: "output_tokens" });
        await storage.usage.add("user-a", [later, second, entry()]);

        expect(await storage.usage.list("user-a")).toEqual([
          entry(),
          second,
          later,
        ]);
      });

      it("lists only the days of the range, bounds included", async () => {
        const storage = await open();
        const days = ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"];
        await storage.usage.add(
          "user-a",
          days.map((day) => entry({ day })),
        );

        const listed = await storage.usage.list("user-a", {
          fromDay: "2026-10-29",
          toDay: "2026-10-30",
        });

        expect(listed.map((record) => record.day)).toEqual([
          "2026-10-29",
          "2026-10-30",
        ]);
      });

      it("does not show a user's usage to another user", async () => {
        const storage = await open();
        await storage.usage.add("user-a", [entry()]);

        expect(await storage.usage.list("user-b")).toEqual([]);
      });

      it("does not book a user's usage on another user", async () => {
        const storage = await open();
        await storage.usage.add("user-a", [entry({ quantity: 10 })]);
        await storage.usage.add("user-b", [entry({ quantity: 99 })]);

        expect(await storage.usage.list("user-a")).toEqual([
          entry({ quantity: 10 }),
        ]);
      });

      it("adds nothing for an empty list", async () => {
        const storage = await open();
        await storage.usage.add("user-a", []);

        expect(await storage.usage.list("user-a")).toEqual([]);
      });
    });
  });
}

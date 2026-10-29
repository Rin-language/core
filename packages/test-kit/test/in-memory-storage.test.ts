import { InMemoryStorage } from "../src/in-memory-storage.js";
import { describeStorageConformance } from "../src/storage-conformance.js";

describeStorageConformance("InMemoryStorage", () => new InMemoryStorage());

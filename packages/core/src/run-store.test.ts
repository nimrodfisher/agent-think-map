import { runStoreContract } from "./run-store-contract.js";
import { SqliteRunStore } from "./sqlite-run-store.js";
runStoreContract("SQLite RunStore contract", () => new SqliteRunStore({path:":memory:"}));

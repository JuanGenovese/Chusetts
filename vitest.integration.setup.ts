import { config } from "dotenv";

// Same precedence as Next: .env.local first, then .env.
config({ path: ".env.local" });
config({ path: ".env" });

import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const userVoicePref = pgTable("user_voice_pref", {
  userId: text("user_id").primaryKey(),
  preference: text("preference").notNull().default("unset"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
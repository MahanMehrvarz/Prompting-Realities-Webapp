import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

logger.log(supabaseUrl, supabaseAnonKey);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase URL or anonymous key");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

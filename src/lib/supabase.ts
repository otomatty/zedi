import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check if credentials are valid (not placeholder values)
export const hasValidCredentials = !!(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== "your-supabase-url" &&
  supabaseAnonKey !== "your-supabase-anon-key" &&
  supabaseUrl.includes("supabase")
);

if (!hasValidCredentials) {
  console.warn(
    "Supabase credentials not configured. Please update your .env file with valid VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
  );
}

// Create Supabase client with error handling
let supabaseClient: SupabaseClient | null = null;

try {
  if (hasValidCredentials) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  }
} catch (error) {
  console.error("Failed to create Supabase client:", error);
}

export const supabase = supabaseClient;

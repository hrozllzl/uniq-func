import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Member = {
  id: string;
  name: string;
  phone: string;
  birthdate: string;
  is_deleted: boolean;
  created_at: string;
};

export type GameRecord = {
  id: string;
  date: string;
  member_id: string;
  scores: (number | null)[];
  created_at: string;
};

export type MemberStats = {
  member: Member;
  avgScore: number;
  gameCount: number;
  totalScores: number;
  maxScore: number;
  minScore: number;
};

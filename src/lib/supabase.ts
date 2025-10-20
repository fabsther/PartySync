import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      parties: {
        Row: {
          id: string;
          title: string;
          description: string;
          schedule: string;
          address: string;
          entry_instructions: string;
          is_date_fixed: boolean;
          fixed_date: string | null;
          images: string[];
          created_by: string;
          is_vlp: boolean;
          vlp_payment_link: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string;
          schedule?: string;
          address?: string;
          entry_instructions?: string;
          is_date_fixed?: boolean;
          fixed_date?: string | null;
          images?: string[];
          created_by: string;
          is_vlp?: boolean;
          vlp_payment_link?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string;
          schedule?: string;
          address?: string;
          entry_instructions?: string;
          is_date_fixed?: boolean;
          fixed_date?: string | null;
          images?: string[];
          created_by?: string;
          is_vlp?: boolean;
          vlp_payment_link?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};

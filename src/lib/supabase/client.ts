"use client";

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://aytwkszqdnylsbufksmf.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5dHdrc3pxZG55bHNidWZrc21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4ODcyMDYsImV4cCI6MjA3NTQ2MzIwNn0.lLZbIEG26IgWGZsuyM7v8X6LnGURA8avB4Gxnkboplg";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const SUPABASE_PUBLIC_URL = SUPABASE_URL;
export const SUPABASE_PUBLIC_ANON_KEY = SUPABASE_ANON_KEY;
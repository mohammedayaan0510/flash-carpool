import { createClient } from '@supabase/supabase-js';

// Replace these values with your actual credentials from Supabase Dashboard -> Project Settings -> API
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://iyexkzavejuwyppcehkd.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5ZXhremF2ZWp1d3lwcGNlaGtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMzkzMjEsImV4cCI6MjEwNjYxNTMyMX0.affv1C2--Y6B6L_ou-REn20uNEPPU-WX1LOCQlDfou4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
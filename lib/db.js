const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Reads SUPABASE_URL and SUPABASE_KEY from your .env file.
// Get these from Supabase: Project Settings > API.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

module.exports = supabase;
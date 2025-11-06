# Environment Variables

## Required Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```bash
# OnchainKit API Key (get from Coinbase Developer Platform)
NEXT_PUBLIC_ONCHAINKIT_API_KEY=your_api_key_here

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Application URL (for production)
NEXT_PUBLIC_URL=https://your-app-url.vercel.app
```

## Getting Your API Keys

### OnchainKit API Key
1. Go to [Coinbase Developer Platform](https://portal.cdp.coinbase.com/)
2. Create a new project or select an existing one
3. Get your API key from the project settings

### Supabase Setup
1. Go to [Supabase](https://supabase.com/)
2. Create a new project
3. Go to Settings > API
4. Copy your Project URL and anon/public key
5. Run the SQL schema from `supabase-schema.sql` in the SQL Editor

## Local Development
For local development, you can use:
```bash
NEXT_PUBLIC_URL=http://localhost:3000
```


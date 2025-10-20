# Party Planning & Coordination App

A comprehensive web application for organizing and managing parties with real-time collaboration features. Built with React, TypeScript, Vite, and Supabase.

## Features

- **User Authentication** - Secure email/password authentication with Supabase
- **Party Management** - Create, view, and delete parties
- **Guest Management** - Invite guests, track RSVPs, and manage companions
- **Car Sharing** - Coordinate rides with available seats and passenger tracking
- **Equipment Coordination** - Track who's bringing what equipment
- **Food & Beverage Planning** - Collaborative meal planning with cost estimates
- **Real-time Updates** - All changes sync in real-time across users
- **Responsive Design** - Works seamlessly on mobile and desktop

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Authentication + Real-time)
- **Icons**: Lucide React
- **PWA**: vite-plugin-pwa for offline capability

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Supabase account and project

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd party-planning-app
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file in the root directory:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Run the development server:
```bash
npm run dev
```

5. Build for production:
```bash
npm run build
```

## Database Schema

The application uses Supabase (PostgreSQL) with the following tables and relationships:

### Core Tables

#### 1. `profiles`
Stores user profile information linked to Supabase auth.
- `id` (uuid, PK) - Foreign key to auth.users
- `email` (text, NOT NULL)
- `full_name` (text)
- `avatar_url` (text)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**RLS Policies:**
- Users can view their own profile
- Users can update their own profile

#### 2. `parties`
Main table for party events.
- `id` (uuid, PK)
- `title` (text, NOT NULL)
- `description` (text)
- `schedule` (text) - Time schedule details
- `address` (text)
- `entry_instructions` (text)
- `is_date_fixed` (boolean) - Whether date is confirmed
- `fixed_date` (timestamptz) - Confirmed date if fixed
- `images` (text[]) - Array of image URLs
- `created_by` (uuid, FK to profiles)
- `is_vlp` (boolean) - VLP payment flag
- `vlp_payment_link` (text)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**RLS Policies:**
- Users can view parties they created or are invited to
- Only creators can update their parties
- Only creators can delete their parties

#### 3. `party_organizers`
Co-organizers with elevated permissions.
- `id` (uuid, PK)
- `party_id` (uuid, FK to parties)
- `user_id` (uuid, FK to profiles)
- `created_at` (timestamptz)

**RLS Policies:**
- Organizers can view parties they organize
- Only party creators can add/remove organizers

#### 4. `party_guests`
Guest list and RSVP tracking.
- `id` (uuid, PK)
- `party_id` (uuid, FK to parties)
- `user_id` (uuid, FK to profiles)
- `status` (text) - 'invited', 'confirmed', or 'declined'
- `notified` (boolean)
- `companions` (text) - Legacy field for companion notes
- `created_at` (timestamptz)

**RLS Policies:**
- Users can view guests for their parties
- Party creators/organizers can manage guests
- Users can update their own RSVP status

#### 5. `guest_companions`
Individual companion tracking for guests.
- `id` (uuid, PK)
- `party_guest_id` (uuid, FK to party_guests, CASCADE DELETE)
- `name` (text, NOT NULL)
- `created_at` (timestamptz)

**RLS Policies:**
- Anyone can view companions for parties they're involved in
- Guests can add their own companions
- Guests can delete their own companions

### Feature Tables

#### 6. `party_date_options`
Date voting for unfixed parties.
- `id` (uuid, PK)
- `party_id` (uuid, FK to parties)
- `date_option` (timestamptz, NOT NULL)
- `timeframe` (text)
- `votes` (integer, DEFAULT 0)
- `created_at` (timestamptz)

#### 7. `car_sharing`
Ride coordination between guests.
- `id` (uuid, PK)
- `party_id` (uuid, FK to parties)
- `user_id` (uuid, FK to profiles)
- `type` (text) - 'offer' or 'request'
- `departure_location` (text)
- `available_seats` (integer)
- `passengers` (uuid[]) - Array of user IDs
- `created_at` (timestamptz)

**RLS Policies:**
- Party guests can view all car sharing offers
- Users can create their own offers/requests
- Only creators can update/delete their entries

#### 8. `equipment`
Equipment items needed for the party.
- `id` (uuid, PK)
- `party_id` (uuid, FK to parties)
- `name` (text, NOT NULL)
- `category` (text, DEFAULT 'general')
- `is_required` (boolean, DEFAULT true)
- `is_available` (boolean, DEFAULT false)
- `created_at` (timestamptz)

**RLS Policies:**
- Party guests can view all equipment
- Confirmed guests can add equipment items
- Only party creators/organizers can update/delete items

#### 9. `equipment_contributors`
Tracks who's bringing which equipment.
- `id` (uuid, PK)
- `equipment_id` (uuid, FK to equipment)
- `user_id` (uuid, FK to profiles)
- `created_at` (timestamptz)

**RLS Policies:**
- Party guests can view contributors
- Users can volunteer to bring equipment
- Users can remove their own contributions

#### 10. `food_items`
Food and beverage planning.
- `id` (uuid, PK)
- `party_id` (uuid, FK to parties)
- `name` (text, NOT NULL)
- `category` (text, DEFAULT 'general')
- `base_quantity` (text) - e.g., "2 per person"
- `estimated_cost` (numeric, DEFAULT 0)
- `created_at` (timestamptz)

**RLS Policies:**
- Party guests can view all food items
- Confirmed guests can add food items
- Only party creators/organizers can update/delete items

#### 11. `food_contributions`
Tracks who's bringing which food items.
- `id` (uuid, PK)
- `food_item_id` (uuid, FK to food_items)
- `user_id` (uuid, FK to profiles)
- `quantity` (text)
- `is_extra` (boolean, DEFAULT false)
- `created_at` (timestamptz)

**RLS Policies:**
- Party guests can view contributions
- Users can add their own contributions
- Users can remove their own contributions

### Utility Tables

#### 12. `subscribers`
Friend/subscriber relationships.
- `id` (uuid, PK)
- `user_id` (uuid, FK to profiles)
- `subscriber_id` (uuid, FK to profiles)
- `created_at` (timestamptz)

#### 13. `invite_codes`
Invitation code system.
- `id` (uuid, PK)
- `code` (text, UNIQUE, NOT NULL)
- `created_by` (uuid, FK to profiles)
- `used_by` (uuid[]) - Array of user IDs who used the code
- `created_at` (timestamptz)

#### 14. `notification_tokens`
Push notification device tokens.
- `id` (uuid, PK)
- `user_id` (uuid, FK to auth.users)
- `token` (text, NOT NULL)
- `device_info` (text)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

## Database Migrations

The database schema is managed through Supabase migrations located in `supabase/migrations/`:

1. **20251019175137_create_party_app_schema_v2.sql** - Initial schema with all core tables
2. **20251019180852_fix_rls_policies_recursion.sql** - RLS policy optimizations
3. **20251020151955_add_notification_tokens.sql** - Push notification support
4. **20251020154553_add_companions_field.sql** - Legacy companion field
5. **20251020155359_create_companions_table.sql** - Individual companion tracking
6. **20251020155600_allow_guests_add_food_items.sql** - Guest food contribution permissions

### Setting Up the Database

1. Create a new Supabase project
2. Run migrations in order using the Supabase dashboard SQL editor or CLI
3. All tables have Row Level Security (RLS) enabled
4. Policies ensure users can only access data they're authorized to see

### Key RLS Security Patterns

The application follows these security principles:

- **Authentication Required**: All policies require `authenticated` role
- **Ownership Checks**: Users can only modify their own data
- **Party Access**: Users can only access parties they created or are invited to
- **Cascading Permissions**: Organizers inherit creator permissions
- **Guest Permissions**: Confirmed guests can contribute but not delete

## Application Structure

```
src/
├── components/
│   ├── party-tabs/        # Tab components for party detail view
│   │   ├── GuestList.tsx
│   │   ├── CarSharing.tsx
│   │   ├── Equipment.tsx
│   │   └── FoodBeverage.tsx
│   ├── AuthForm.tsx       # Login/Register form
│   ├── CreatePartyModal.tsx
│   ├── GuestCount.tsx     # Guest + companion counter
│   ├── Layout.tsx
│   ├── PartyDetail.tsx
│   ├── PartyList.tsx
│   └── SubscribersList.tsx
├── contexts/
│   └── AuthContext.tsx    # Authentication state management
├── lib/
│   ├── supabase.ts        # Supabase client setup
│   └── notifications.ts   # Notification utilities
└── main.tsx               # App entry point
```

## Key Features Explained

### Guest + Companion Tracking

Guests can add multiple companions individually. The system tracks:
- Total confirmed guests
- Individual companions per guest
- Guest can add/remove their companions at any time
- Total headcount displayed for planning purposes

### Food & Beverage Cost Estimation

- Automatic cost calculation based on confirmed guests + companions
- Per-person cost breakdown
- Track who's bringing what items
- Only party owners can add default lists
- Guests can contribute additional items

### Equipment Coordination

- Pre-defined equipment list available
- Track who's bringing each item
- Visual indicators for covered/uncovered items
- Only party owners can delete equipment items

### Car Sharing

- Users can offer rides (with departure location and seats)
- Users can request rides
- Passengers can join available rides
- Real-time seat availability updates

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking

## Environment Variables

Required environment variables:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Security Notes

- All sensitive operations are protected by Row Level Security (RLS)
- Authentication is handled by Supabase Auth
- API keys are never exposed in client-side code
- All database operations are validated by RLS policies

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run typecheck` and `npm run build` to ensure no errors
5. Submit a pull request

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.

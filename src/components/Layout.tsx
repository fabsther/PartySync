import { ReactNode, useState } from 'react';
import { PartyPopper, Users, CalendarDays, LogOut, Menu, X, Plus, User } from 'lucide-react';
import { NotificationsBell } from '../components/NotificationsBell';
import { useAuth } from '../contexts/AuthContext';

interface LayoutProps {
  children: ReactNode;
  activeTab: 'parties' | 'subscribers' | 'profile';
  onTabChange: (tab: 'parties' | 'subscribers' | 'profile') => void;
  onCreateParty: () => void;
}

export function Layout({ children, activeTab, onTabChange, onCreateParty }: LayoutProps) {
  const { signOut, user } = useAuth(); 
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <nav className="bg-neutral-900 border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-2 rounded-lg">
                <PartyPopper className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold">PartySync</span>
            </div>

            <div className="hidden md:flex items-center space-x-1">
              <button
                onClick={() => onTabChange('parties')}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  activeTab === 'parties'
                    ? 'bg-orange-500 text-white'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <CalendarDays className="w-5 h-5 inline mr-2" />
                Parties
              </button>
              <button
                onClick={() => onTabChange('subscribers')}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  activeTab === 'subscribers'
                    ? 'bg-orange-500 text-white'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <Users className="w-5 h-5 inline mr-2" />
                Subscribers
              </button>
              <button
                onClick={() => onTabChange('profile')}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  activeTab === 'profile'
                    ? 'bg-orange-500 text-white'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <User className="w-5 h-5 inline mr-2" />
                Profile
              </button>
            </div>

            <div className="hidden md:flex items-center space-x-3">
              <NotificationsBell userId={user?.id} />
              <button
                onClick={onCreateParty}
                className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-2 rounded-lg font-medium hover:from-orange-600 hover:to-orange-700 transition flex items-center space-x-2"
              >
                <Plus className="w-5 h-5" />
                <span>New Party</span>
              </button>
              <button
                onClick={handleSignOut}
                className="text-neutral-400 hover:text-white p-2 rounded-lg hover:bg-neutral-800 transition"
                title="Sign Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-neutral-400 hover:text-white p-2"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-neutral-800 bg-neutral-900">
            <div className="px-4 py-3 space-y-2">
              <button
                onClick={() => {
                  onTabChange('parties');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-lg font-medium transition ${
                  activeTab === 'parties'
                    ? 'bg-orange-500 text-white'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <CalendarDays className="w-5 h-5 inline mr-2" />
                Parties
              </button>
              <button
                onClick={() => {
                  onTabChange('subscribers');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-lg font-medium transition ${
                  activeTab === 'subscribers'
                    ? 'bg-orange-500 text-white'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <Users className="w-5 h-5 inline mr-2" />
                Subscribers
              </button>
              <button
                onClick={() => {
                  onTabChange('profile');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-lg font-medium transition ${
                  activeTab === 'profile'
                    ? 'bg-orange-500 text-white'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <User className="w-5 h-5 inline mr-2" />
                Profile
              </button>
              <button
                onClick={() => {
                  onCreateParty();
                  setMobileMenuOpen(false);
                }}
                className="w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-3 rounded-lg font-medium hover:from-orange-600 hover:to-orange-700 transition flex items-center justify-center space-x-2"
              >
                <Plus className="w-5 h-5" />
                <span>New Party</span>
              </button>
              <button
                onClick={handleSignOut}
                className="w-full text-left text-neutral-400 hover:text-white px-4 py-3 rounded-lg hover:bg-neutral-800 transition"
              >
                <LogOut className="w-5 h-5 inline mr-2" />
                Sign Out
              </button>
            </div>
          </div>
        )}
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}

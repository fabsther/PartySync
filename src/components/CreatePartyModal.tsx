import { useRef, useState } from 'react';
import { X, ImagePlus, Smile } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { uploadPartyMedia } from '../lib/uploadMedia';

interface CreatePartyModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreatePartyModal({ onClose, onSuccess }: CreatePartyModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    address: '',
    schedule: '',
    entry_instructions: '',
    is_date_fixed: true,
    fixed_date: '',
    chat_url: '',
  });

  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);

  const bannerRef = useRef<HTMLInputElement>(null);
  const iconRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (
    file: File,
    setFile: (f: File) => void,
    setPreview: (url: string) => void
  ) => {
    if (!file.type.startsWith('image/')) return;
    setFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError('');

    try {
      let banner_url: string | null = null;
      let icon_url: string | null = null;

      if (bannerFile) banner_url = await uploadPartyMedia(bannerFile, user.id, 'banner');
      if (iconFile) icon_url = await uploadPartyMedia(iconFile, user.id, 'icon');

      const { data: party, error: partyError } = await supabase
        .from('parties')
        .insert({
          ...formData,
          created_by: user.id,
          fixed_date: formData.is_date_fixed && formData.fixed_date ? formData.fixed_date : null,
          chat_url: formData.chat_url.trim() || null,
          banner_url,
          icon_url,
        })
        .select()
        .single();

      if (partyError) throw partyError;

      if (party) {
        const { error: guestError } = await supabase.from('party_guests').insert({
          party_id: party.id,
          user_id: user.id,
          status: 'confirmed',
        });
        if (guestError) throw guestError;
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create party');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-neutral-900 border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Create New Party</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-2 hover:bg-neutral-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">

          {/* Banner */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Bannière <span className="text-neutral-500">(optionnel)</span>
            </label>
            <div
              onClick={() => bannerRef.current?.click()}
              className="relative w-full h-36 rounded-xl border-2 border-dashed border-neutral-700 hover:border-orange-500 transition cursor-pointer overflow-hidden flex items-center justify-center bg-neutral-800"
            >
              {bannerPreview ? (
                <img src={bannerPreview} alt="banner" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-neutral-500">
                  <ImagePlus className="w-8 h-8" />
                  <span className="text-sm">Cliquer pour ajouter une bannière</span>
                </div>
              )}
              {bannerPreview && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setBannerFile(null); setBannerPreview(null); }}
                  className="absolute top-2 right-2 p-1 bg-black/60 rounded-full text-white hover:bg-black/80"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <input
              ref={bannerRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleImageSelect(e.target.files[0], setBannerFile, setBannerPreview)}
            />
          </div>

          {/* Icon */}
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Icône <span className="text-neutral-500">(optionnel)</span>
              </label>
              <div
                onClick={() => iconRef.current?.click()}
                className="w-20 h-20 rounded-2xl border-2 border-dashed border-neutral-700 hover:border-orange-500 transition cursor-pointer overflow-hidden flex items-center justify-center bg-neutral-800"
              >
                {iconPreview ? (
                  <img src={iconPreview} alt="icon" className="w-full h-full object-cover" />
                ) : (
                  <Smile className="w-8 h-8 text-neutral-500" />
                )}
              </div>
              <input
                ref={iconRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleImageSelect(e.target.files[0], setIconFile, setIconPreview)}
              />
            </div>
            {iconPreview && (
              <button
                type="button"
                onClick={() => { setIconFile(null); setIconPreview(null); }}
                className="text-xs text-red-400 hover:text-red-300 mt-6"
              >
                Supprimer
              </button>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Party Title</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
              placeholder="Summer BBQ Party"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Description</label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
              placeholder="Let's celebrate summer with great food and music!"
            />
          </div>

          {/* Date */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="is_date_fixed"
              checked={formData.is_date_fixed}
              onChange={(e) => setFormData({ ...formData, is_date_fixed: e.target.checked })}
              className="w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-orange-500 focus:ring-orange-500"
            />
            <label htmlFor="is_date_fixed" className="text-sm text-neutral-300">
              Date is confirmed (uncheck if you want guests to vote on dates)
            </label>
          </div>

          {formData.is_date_fixed && (
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">Party Date & Time</label>
              <input
                type="datetime-local"
                value={formData.fixed_date}
                onChange={(e) => setFormData({ ...formData, fixed_date: e.target.value })}
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
              />
            </div>
          )}

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Address</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
              placeholder="123 Main Street, City"
            />
          </div>

          {/* Schedule */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Schedule</label>
            <textarea
              rows={2}
              value={formData.schedule}
              onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
              placeholder="6:00 PM - Arrival, 7:00 PM - Dinner, 9:00 PM - Music"
            />
          </div>

          {/* Entry instructions */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Entry Instructions</label>
            <textarea
              rows={2}
              value={formData.entry_instructions}
              onChange={(e) => setFormData({ ...formData, entry_instructions: e.target.value })}
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
              placeholder="Ring the doorbell, gate code is 1234"
            />
          </div>

          {/* Chat group link */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Lien groupe <span className="text-neutral-500">(WhatsApp, Telegram… — optionnel)</span>
            </label>
            <input
              type="url"
              value={formData.chat_url}
              onChange={(e) => setFormData({ ...formData, chat_url: e.target.value })}
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
              placeholder="https://chat.whatsapp.com/..."
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-neutral-800 text-white rounded-lg font-medium hover:bg-neutral-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-3 rounded-lg font-medium hover:from-orange-600 hover:to-orange-700 transition disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Party'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

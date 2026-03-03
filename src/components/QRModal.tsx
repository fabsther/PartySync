import { useRef } from 'react';
import { X, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { QRCodeCanvas } from 'qrcode.react';

interface QRModalProps {
  url: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
}

export function QRModal({ url, title, subtitle, onClose }: QRModalProps) {
  const { t } = useTranslation('common');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const downloadQR = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_qr.png`;
    a.click();
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-xs w-full shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-white font-bold text-base">{title}</h3>
            {subtitle && <p className="text-neutral-500 text-xs mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-lg transition flex-shrink-0 ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex justify-center p-5 bg-white rounded-xl mb-4">
          <QRCodeCanvas
            ref={canvasRef}
            value={url}
            size={200}
            includeMargin={false}
            bgColor="#ffffff"
            fgColor="#111111"
          />
        </div>

        <p className="text-neutral-600 text-xs text-center break-all mb-5 px-1">{url}</p>

        <button
          onClick={downloadQR}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-medium transition"
        >
          <Download className="w-4 h-4" />
          {t('qr_download')}
        </button>
      </div>
    </div>
  );
}

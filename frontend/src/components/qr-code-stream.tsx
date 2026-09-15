'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useQRStream } from '@/lib/sse';

interface QRCodeStreamProps {
  token: string;
  onConnected?: () => void;
}

export default function QRCodeStream({ token, onConnected }: QRCodeStreamProps) {
  const { status, qrData, phone, displayName } = useQRStream(token);
  const [countdown, setCountdown] = useState(60);
  const [expired, setExpired] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectedCallbackFired = useRef(false);

  // Reset countdown when new QR data arrives
  useEffect(() => {
    if (qrData) {
      setCountdown(60);
      setExpired(false);
    }
  }, [qrData]);

  // Countdown timer when waiting for scan
  useEffect(() => {
    if (status !== 'waiting_scan') return;

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setExpired(true);
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [status, qrData]);

  // Call onConnected after 2s delay
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  useEffect(() => {
    if (status === 'connected' && !connectedCallbackFired.current) {
      connectedCallbackFired.current = true;
      const timer = setTimeout(() => {
        onConnectedRef.current?.();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const handleReload = useCallback(() => {
    window.location.reload();
  }, []);

  // Connecting state
  if (status === 'connecting') {
    return (
      <div className="bg-[#131b2e] rounded-xl p-8 flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-3 border-[#4ff07f] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#bbcbb9]">Preparando conexão...</p>
      </div>
    );
  }

  // Connected state
  if (status === 'connected') {
    return (
      <div className="bg-[#131b2e] rounded-xl p-8 flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 rounded-full bg-[#4ff07f]/20 flex items-center justify-center animate-bounce">
          <span className="material-symbols-outlined text-[#4ff07f] text-4xl">
            check_circle
          </span>
        </div>
        <p className="text-lg font-semibold text-[#4ff07f]">
          WhatsApp conectado!
        </p>
        {(phone || displayName) && (
          <p className="text-sm text-[#bbcbb9]">
            {displayName && <span>{displayName}</span>}
            {displayName && phone && <span> &middot; </span>}
            {phone && <span>{phone}</span>}
          </p>
        )}
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="bg-[#131b2e] rounded-xl p-8 flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
          <span className="material-symbols-outlined text-red-400 text-4xl">
            cancel
          </span>
        </div>
        <p className="text-lg font-semibold text-red-400">Erro na conexão</p>
        <button
          onClick={handleReload}
          className="mt-2 px-5 py-2.5 bg-[#4ff07f] text-[#0b1326] rounded-lg text-sm font-semibold hover:brightness-110 transition-all"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  // Timeout state
  if (status === 'timeout') {
    return (
      <div className="bg-[#131b2e] rounded-xl p-8 flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center">
          <span className="material-symbols-outlined text-yellow-400 text-4xl">
            timer_off
          </span>
        </div>
        <p className="text-lg font-semibold text-[#dae2fd]">QR Code expirou</p>
        <button
          onClick={handleReload}
          className="mt-2 px-5 py-2.5 bg-[#4ff07f] text-[#0b1326] rounded-lg text-sm font-semibold hover:brightness-110 transition-all"
        >
          Gerar novo QR Code
        </button>
      </div>
    );
  }

  // Waiting scan state
  return (
    <div className="bg-[#131b2e] rounded-xl p-8 flex flex-col items-center gap-6">
      {/* QR Code container */}
      {qrData && !expired ? (
        <div className="bg-white rounded-xl p-4">
          <QRCodeSVG value={qrData} size={200} />
        </div>
      ) : expired ? (
        <div className="w-[232px] h-[232px] bg-[#222a3d] rounded-xl flex flex-col items-center justify-center gap-3">
          <span className="material-symbols-outlined text-[#bbcbb9] text-4xl">
            qr_code
          </span>
          <button
            onClick={handleReload}
            className="px-4 py-2 bg-[#4ff07f] text-[#0b1326] rounded-lg text-sm font-semibold hover:brightness-110 transition-all"
          >
            Atualizar QR Code
          </button>
        </div>
      ) : (
        <div className="w-[232px] h-[232px] bg-[#222a3d] rounded-xl flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-[#4ff07f] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Status indicator */}
      {!expired && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#4ff07f] animate-pulse" />
          <p className="text-sm text-[#bbcbb9]">Aguardando escaneamento...</p>
          <span className="text-xs text-[#bbcbb9]/60 ml-1">{countdown}s</span>
        </div>
      )}

      {/* Instructions */}
      <div className="w-full space-y-3 mt-2">
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#2d3449] text-[#4ff07f] text-xs font-bold flex items-center justify-center">
            1
          </span>
          <p className="text-sm text-[#dae2fd]">
            Abra o <span className="font-semibold text-[#4ff07f]">WhatsApp</span> no seu celular
          </p>
        </div>
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#2d3449] text-[#4ff07f] text-xs font-bold flex items-center justify-center">
            2
          </span>
          <p className="text-sm text-[#dae2fd]">
            Toque em <span className="font-semibold text-[#4ff07f]">Dispositivos conectados</span>
          </p>
        </div>
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#2d3449] text-[#4ff07f] text-xs font-bold flex items-center justify-center">
            3
          </span>
          <p className="text-sm text-[#dae2fd]">
            Escaneie o <span className="font-semibold text-[#4ff07f]">código QR</span> acima
          </p>
        </div>
      </div>
    </div>
  );
}

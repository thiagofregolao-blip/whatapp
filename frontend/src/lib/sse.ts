'use client';

import { useState, useEffect, useRef } from 'react';

// Em produção (servido pelo próprio Express), usa caminhos relativos
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export type QRStreamStatus = 'connecting' | 'waiting_scan' | 'connected' | 'error' | 'timeout';

export interface QRStreamState {
  status: QRStreamStatus;
  qrData: string | null;
  phone: string | null;
  displayName: string | null;
  error: string | null;
}

export function useQRStream(token: string): QRStreamState {
  const [status, setStatus] = useState<QRStreamStatus>('connecting');
  const [qrData, setQrData] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!token) return;

    const es = new EventSource(`${API_URL}/api/whatsapp/qr-stream?token=${token}`);
    eventSourceRef.current = es;

    es.onopen = () => {
      setStatus('waiting_scan');
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'qr':
            setQrData(data.qr ?? data.data ?? null);
            break;
          case 'connected_wa':
            setStatus('connected');
            setPhone(data.phone ?? null);
            setDisplayName(data.displayName ?? null);
            break;
          case 'timeout':
            setStatus('timeout');
            break;
          case 'ping':
            // heartbeat, do nothing
            break;
        }
      } catch {
        // ignore malformed messages
      }
    };

    es.onerror = () => {
      setStatus('error');
      setError('Connection to QR stream failed');
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [token]);

  // Close EventSource when connected
  useEffect(() => {
    if (status === 'connected' && eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, [status]);

  return { status, qrData, phone, displayName, error };
}

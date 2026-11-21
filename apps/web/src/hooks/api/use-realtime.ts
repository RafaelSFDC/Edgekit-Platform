import { useState, useEffect, useRef, useCallback } from 'react';
import { broadcastRealtime, STORAGE_KEY_ADMIN } from '../../services/api';
import type { RealtimeMessage } from '../../types';

export function getWebSocketBaseUrl(): string {
  const apiBase =
    (typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env.VITE_API_BASE_URL as string | undefined)
      : '') || '';

  if (apiBase) {
    try {
      const url = new URL(apiBase, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
      const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProtocol}//${url.host}${url.pathname.replace(/\/$/, '')}`;
    } catch {
      if (apiBase.startsWith('https://')) {
        return apiBase.replace(/^https:\/\//, 'wss://').replace(/\/$/, '');
      }
      if (apiBase.startsWith('http://')) {
        return apiBase.replace(/^http:\/\//, 'ws://').replace(/\/$/, '');
      }
    }
  }

  const wsProtocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost:5173';
  return `${wsProtocol}//${host}`;
}

export function useRealtimeStream(channel = 'global') {
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);
  const [status, setStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);

  const isUnmountedRef = useRef(false);
  const reconnectTimeoutRef = useRef<any>(null);
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (isUnmountedRef.current) return;

    setStatus('connecting');
    const wsBase = getWebSocketBaseUrl();
    const apiKey = (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_ADMIN) : null) || '';
    const wsUrl = `${wsBase}/api/v1/realtime/${encodeURIComponent(
      channel
    )}/ws?apikey=${encodeURIComponent(apiKey)}&userName=AdminConsole`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (isUnmountedRef.current) {
          try { ws.close(); } catch {}
          return;
        }
        setStatus('connected');
        setMessages((prev) => [
          {
            id: `sys_${Date.now()}`,
            channel,
            event: 'system:connected',
            payload: { message: `Conectado ao canal "${channel}" via Durable Object` },
            timestamp: Date.now(),
          },
          ...prev,
        ]);
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          const msg: RealtimeMessage = {
            id: parsed.id || `msg_${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
            channel: parsed.channel || channel,
            event: parsed.event || 'broadcast',
            payload: parsed.payload || parsed.data || parsed,
            timestamp: parsed.timestamp || Date.now(),
          };
          setMessages((prev) => [msg, ...prev]);
        } catch {
          setMessages((prev) => [
            {
              id: `raw_${Date.now()}`,
              channel,
              event: 'raw',
              payload: event.data,
              timestamp: Date.now(),
            },
            ...prev,
          ]);
        }
      };

      ws.onerror = () => {
        setStatus('disconnected');
      };

      ws.onclose = () => {
        setStatus('disconnected');
        if (!isUnmountedRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            if (!isUnmountedRef.current) {
              connectRef.current();
            }
          }, 2500);
        }
      };

      wsRef.current = ws;
    } catch {
      setStatus('disconnected');
    }
  }, [channel]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    isUnmountedRef.current = false;
    connect();
    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  const clearMessages = () => setMessages([]);

  const triggerBroadcast = async (eventName: string, payload: any) => {
    return broadcastRealtime(channel, eventName, payload);
  };

  return {
    status,
    messages,
    clearMessages,
    triggerBroadcast,
    reconnect: connect,
  };
}

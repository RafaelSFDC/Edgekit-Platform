import { useState, useEffect, useRef, useCallback } from 'react';
import { broadcastRealtime, STORAGE_KEY_ADMIN } from '../../services/api';
import type { RealtimeMessage } from '../../types';

export function useRealtimeStream(channel = 'global') {
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);
  const [status, setStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setStatus('connecting');
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const apiKey = localStorage.getItem(STORAGE_KEY_ADMIN) || '';
    const wsUrl = `${wsProtocol}//${window.location.host}/api/v1/realtime/${encodeURIComponent(
      channel
    )}/ws?apikey=${encodeURIComponent(apiKey)}&userName=AdminConsole`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
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
      };

      wsRef.current = ws;
    } catch {
      setStatus('disconnected');
    }
  }, [channel]);

  useEffect(() => {
    connect();
    return () => {
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

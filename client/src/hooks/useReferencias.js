import { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api';

export default function useReferencias() {
  const [referencias, setReferencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchReferencias = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/referencias`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Error ${res.status}: ${res.statusText}`);
      }
      const json = await res.json();
      setReferencias(json.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReferencias();
  }, [fetchReferencias]);

  return { referencias, loading, error, refetch: fetchReferencias };
}

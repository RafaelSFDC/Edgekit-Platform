export const queryDefaults = {
  stats: {
    staleTime: 10 * 1000,
    refetchInterval: 30 * 1000,
  },
  database: {
    staleTime: 15 * 1000,
  },
  storage: {
    staleTime: 20 * 1000,
  },
  keys: {
    staleTime: 60 * 1000,
  },
};

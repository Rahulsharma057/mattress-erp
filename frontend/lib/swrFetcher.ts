import api from "@/lib/api";

// Shared SWR fetcher - every useSWR(url, swrFetcher) call across the app goes through the
// same axios instance (auth header, 401 redirect, error toast already wired in lib/api.ts).
const swrFetcher = (url: string) => api.get(url).then((res) => res.data);

export default swrFetcher;

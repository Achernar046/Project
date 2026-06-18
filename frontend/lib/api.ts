const DEFAULT_API_URL = 'http://localhost:5000';

function normalizeBaseUrl(url: string): string {
    return url.replace(/\/+$/, '');
}

export const API_BASE_URL = normalizeBaseUrl(
    process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL
);

export function buildApiUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${API_BASE_URL}${normalizedPath}`;
}

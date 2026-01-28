export const normalizeSpecificAsset = (asset) => {
    if (!asset) return '';
    return String(asset).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
};

export const parseSpecificAssets = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return [];

    let parts = [];
    if (/[\n,;]+/.test(raw)) {
        parts = raw.split(/[\n,;]+/);
    } else if (raw.includes('/')) {
        parts = [raw];
    } else {
        const tokens = raw.split(/\s+/).filter(Boolean);
        const merged = [];
        for (let i = 0; i < tokens.length; i += 1) {
            const cur = tokens[i];
            const next = tokens[i + 1];
            if (next && normalizeSpecificAsset(next) === 'OTC') {
                merged.push(`${cur}${next}`);
                i += 1;
                continue;
            }
            merged.push(cur);
        }
        parts = merged;
    }

    return Array.from(new Set(parts.map((a) => normalizeSpecificAsset(String(a).trim())).filter(Boolean)));
};
